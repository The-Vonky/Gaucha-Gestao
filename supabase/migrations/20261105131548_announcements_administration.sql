-- GG-10 Entrega B. Proposta anterior: docs/modules/announcements/ADMINISTRATION_V1.md.
-- Arquivo gerado pela CLI 3.0.0. Não autoriza aplicação persistente ou remota.
begin;
create schema announcements;
create schema announcements_private;
revoke all on schema announcements,announcements_private from public,anon,authenticated;
alter default privileges in schema announcements revoke execute on functions from public;
alter default privileges in schema announcements_private revoke execute on functions from public;

insert into core.permissions(key,domain,resource,action,description) values
 ('announcements.notice.manage','announcements','notice','manage','Gerenciar comunicados institucionais globais');

do $$ begin
 if not exists(select 1 from core.roles where key='platform_administrator' and system and active and global_only)
 or exists(select 1 from core.role_permissions rp join core.roles r on r.id=rp.role_id
   where r.key='platform_administrator' and rp.permission_key='room_booking.manage') then
  raise exception 'Composição institucional incompatível; preservar D5-B';
 end if;
 if exists(select 1 from core.roles where key='announcement_manager') then
  raise exception 'Colisão de papel announcement_manager; revisar antes de provisionar';
 end if;
end $$;
insert into core.roles(key,name,description,system,global_only) values
 ('announcement_manager','Gestor de Comunicados','Gerenciamento exclusivo de comunicados institucionais globais.',true,true);
insert into core.role_permissions(role_id,permission_key)
 select id,'announcements.notice.manage' from core.roles where key in ('platform_administrator','announcement_manager');

create table announcements.notices (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(btrim(title))>=1 and length(title)<=120 and title !~ '[<>]'),
 message text not null check(length(btrim(message))>=1 and length(message)<=1600 and message !~ '[<>]'),
 category text not null check(category in ('testing','maintenance','information','critical','success','general')),
 tone text not null check(tone in ('neutral','warning','info','danger','success')),
 state text not null default 'draft' check(state in ('draft','published','inactive','archived')),
 priority integer not null default 0 check(priority between -10000 and 10000),
 starts_at timestamptz(3) check(starts_at is null or (isfinite(starts_at) and extract(year from starts_at) between 1 and 9999)),
 ends_at timestamptz(3) check(ends_at is null or (isfinite(ends_at) and extract(year from ends_at) between 1 and 9999)),
 show_feedback boolean not null default true,
 created_by uuid not null references core.profiles(id),
 updated_by uuid not null references core.profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 version integer not null default 1 check(version>=1),
 check(starts_at is null or ends_at is null or ends_at>starts_at),
 check((category='critical' and tone='danger') or (category='maintenance' and tone='warning')
   or (category='success' and tone='success') or (category in ('testing','information','general') and tone in ('info','neutral')))
);
create index notices_page on announcements.notices(updated_at desc,id);
create index notices_schedule on announcements.notices(starts_at,ends_at) where state='published';
create table announcements.notice_history (
 notice_id uuid not null references announcements.notices(id),
 version integer not null,
 actor_user_id uuid not null references core.profiles(id),
 occurred_at timestamptz not null default clock_timestamp(),
 before_data jsonb,
 after_data jsonb not null,
 primary key(notice_id,version)
);
alter table announcements.notices enable row level security;
alter table announcements.notice_history enable row level security;
create policy notices_deny on announcements.notices as restrictive for all to public using(false) with check(false);
create policy notice_history_deny on announcements.notice_history as restrictive for all to public using(false) with check(false);
revoke all on all tables in schema announcements from public,anon,authenticated;

create function announcements_private.authorize(p_manage boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from core.profiles where id=auth.uid() for share;
 if not private.is_active_user() then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if p_manage then
  perform 1 from core.user_role_assignments where user_id=auth.uid() and active and scope_type='global' order by id for share;
  perform 1 from core.roles where id in (select role_id from core.user_role_assignments
    where user_id=auth.uid() and active and scope_type='global') order by id for share;
  perform 1 from core.role_permissions where permission_key='announcements.notice.manage' and role_id in (
    select role_id from core.user_role_assignments where user_id=auth.uid() and active and scope_type='global') order by role_id for share;
  perform 1 from core.permissions where key='announcements.notice.manage' for share;
  if not private.has_global_permission('announcements.notice.manage') then
   raise exception 'Acesso negado.' using errcode='42501';
  end if;
 end if;
end $$;

create function announcements_private.status(n announcements.notices,p_now timestamptz) returns text
language sql immutable set search_path='' as $$
 select case when n.state<>'published' then n.state
  when n.ends_at is not null and n.ends_at<=p_now then 'expired'
  when n.starts_at is not null and n.starts_at>p_now then 'scheduled' else 'active' end
$$;
create function announcements_private.notice_json(n announcements.notices,p_now timestamptz) returns jsonb
language sql immutable set search_path='' as $$
 select to_jsonb(n)||jsonb_build_object('status',announcements_private.status(n,p_now))
$$;
create function announcements_private.guard_notice() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Exclusão física proibida.' using errcode='55000'; end if;
 if tg_op='UPDATE' then
  if old.state='archived' then raise exception 'Comunicado arquivado é imutável.' using errcode='55000'; end if;
  new.id:=old.id; new.created_at:=old.created_at; new.created_by:=old.created_by;
  new.version:=old.version+1;
 else
  new.created_by:=auth.uid(); new.created_at:=clock_timestamp(); new.version:=1;
 end if;
 new.updated_by:=auth.uid(); new.updated_at:=clock_timestamp();
 return new;
end $$;
create trigger notice_guard before insert or update or delete on announcements.notices
 for each row execute function announcements_private.guard_notice();
create function announcements_private.audit_notice() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into announcements.notice_history(notice_id,version,actor_user_id,before_data,after_data)
 values(new.id,new.version,auth.uid(),case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,before_data,after_data)
 values(auth.uid(),'announcements',case when tg_op='INSERT' then 'notice.create' else 'notice.update' end,
  'notice',new.id::text,
  case when tg_op='UPDATE' then jsonb_build_object('version',old.version,'state',old.state) else null end,
  jsonb_build_object('version',new.version,'state',new.state));
 return new;
end $$;
create trigger notice_audit after insert or update on announcements.notices
 for each row execute function announcements_private.audit_notice();
create function announcements_private.immutable_history() returns trigger
language plpgsql set search_path='' as $$ begin
 raise exception 'Histórico imutável.' using errcode='55000';
end $$;
create trigger notice_history_immutable before update or delete on announcements.notice_history
 for each row execute function announcements_private.immutable_history();

create function public.announcements_manage_list(p_limit integer default 20,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_now timestamptz; v_items jsonb;
begin
 perform announcements_private.authorize(true);
 v_now:=clock_timestamp();
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then
  raise exception 'Paginação inválida.' using errcode='23514'; end if;
 select coalesce(jsonb_agg(announcements_private.notice_json(n,v_now) order by n.updated_at desc,n.id),'[]'::jsonb)
 into v_items from (select * from announcements.notices order by updated_at desc,id limit p_limit offset p_offset) n;
 return jsonb_build_object('items',v_items,'total',(select count(*) from announcements.notices),'serverNow',v_now);
end $$;

-- Escrita única transacional: create/update/publicação/desativação/arquivo.
-- p_id null cria; em edição a versão esperada é obrigatória. Não existe upsert.
create function public.announcements_notice_save(
 p_id uuid,p_expected_version integer,p_title text,p_message text,p_category text,p_tone text,
 p_priority integer,p_starts_at timestamptz,p_ends_at timestamptz,p_state text,p_show_feedback boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare n announcements.notices;
begin
 perform announcements_private.authorize(true);
 if p_id is null then
  if p_expected_version is not null or p_state is null or p_state not in ('draft','published') then
   raise exception 'Criação exige rascunho ou publicação inicial.' using errcode='23514'; end if;
  insert into announcements.notices(title,message,category,tone,priority,starts_at,ends_at,state,show_feedback,created_by,updated_by)
  values(p_title,p_message,p_category,p_tone,p_priority,p_starts_at,p_ends_at,p_state,p_show_feedback,auth.uid(),auth.uid()) returning * into n;
 else
  select * into n from announcements.notices where id=p_id for update;
  if not found then raise exception 'Comunicado indisponível.' using errcode='P0002'; end if;
  if p_expected_version is null or p_expected_version<1 then raise exception 'Versão esperada obrigatória.' using errcode='23514'; end if;
  if n.version<>p_expected_version then raise exception 'Comunicado alterado. Recarregue antes de salvar.' using errcode='40001'; end if;
  update announcements.notices set title=p_title,message=p_message,category=p_category,tone=p_tone,priority=p_priority,
   starts_at=p_starts_at,ends_at=p_ends_at,state=p_state,show_feedback=p_show_feedback where id=p_id returning * into n;
 end if;
 return announcements_private.notice_json(n,clock_timestamp());
end $$;

create function public.announcements_notice_history(p_id uuid,p_limit integer default 20,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_items jsonb;
begin
 perform announcements_private.authorize(true);
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then
  raise exception 'Paginação inválida.' using errcode='23514'; end if;
 select coalesce(jsonb_agg(to_jsonb(h) order by h.version desc),'[]'::jsonb) into v_items
 from (select * from announcements.notice_history where notice_id=p_id order by version desc limit p_limit offset p_offset) h;
 return jsonb_build_object('items',v_items,'total',(select count(*) from announcements.notice_history where notice_id=p_id));
end $$;

create function public.announcements_published() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_now timestamptz; v_items jsonb; v_next timestamptz;
begin
 perform announcements_private.authorize(false);
 v_now:=clock_timestamp();
 -- Sem conteúdo futuro, rascunhos, autoria ou metadados administrativos.
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'type',n.category,'tone',n.tone,
  'title',n.title,'message',n.message,'enabled',true,'startsAt',n.starts_at,'endsAt',n.ends_at,
  'audience','authenticated','priority',n.priority,'showIcon',true,
  'action',case when n.show_feedback then jsonb_build_object('type','feedback','label','Relatar problema ou sugerir melhoria','enabled',false) else null end)
  order by case n.category when 'critical' then 6 when 'maintenance' then 5 when 'information' then 4 when 'success' then 3 when 'general' then 2 else 1 end desc,n.priority desc,n.id),'[]'::jsonb)
 into v_items from (select * from announcements.notices
  where state='published' and (starts_at is null or starts_at<=v_now) and (ends_at is null or ends_at>v_now)
  order by case category when 'critical' then 6 when 'maintenance' then 5 when 'information' then 4 when 'success' then 3 when 'general' then 2 else 1 end desc,priority desc,id limit 20) n;
 select min(boundary) into v_next from announcements.notices n cross join lateral (values(n.starts_at),(n.ends_at)) d(boundary)
 where n.state='published' and d.boundary>v_now and (n.ends_at is null or n.ends_at>v_now);
 return jsonb_build_object('version',1,'enabled',true,'announcements',v_items,'serverNow',v_now,'nextRefreshAt',v_next);
end $$;

revoke all on all functions in schema announcements_private from public,anon,authenticated;
revoke all on function public.announcements_manage_list(integer,integer),
 public.announcements_notice_save(uuid,integer,text,text,text,text,integer,timestamptz,timestamptz,text,boolean),
 public.announcements_notice_history(uuid,integer,integer), public.announcements_published() from public,anon,authenticated;
grant execute on function public.announcements_manage_list(integer,integer),
 public.announcements_notice_save(uuid,integer,text,text,text,text,integer,timestamptz,timestamptz,text,boolean),
 public.announcements_notice_history(uuid,integer,integer), public.announcements_published() to authenticated;
commit;
