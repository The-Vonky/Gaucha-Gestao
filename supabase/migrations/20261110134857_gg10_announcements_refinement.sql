-- GG-10. Falha integralmente se houver períodos legados conflitantes.
begin;
lock table announcements.notices in access exclusive mode;

do $$ begin
 if exists (
  select 1 from announcements.notices a join announcements.notices b on a.id < b.id
   and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(b.starts_at,b.ends_at,'[)')
  where a.state='published' and b.state='published'
 ) then
  raise exception 'Há comunicados publicados com períodos sobrepostos. Resolva os conflitos antes de aplicar GG-10.' using errcode='23P01';
 end if;
end $$;

alter table announcements.notices drop constraint notices_check1,
 add constraint notices_published_period_exclusion
 exclude using gist (tstzrange(starts_at,ends_at,'[)') with &&) where (state='published');

create or replace function public.announcements_manage_list(p_limit integer default 20,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_now timestamptz; v_items jsonb;
begin
 perform announcements_private.authorize(true);
 v_now:=clock_timestamp();
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then
  raise exception 'Paginação inválida.' using errcode='23514'; end if;
 select coalesce(jsonb_agg(announcements_private.notice_json(n,v_now) order by (announcements_private.status(n,v_now)='active') desc,n.updated_at desc,n.id),'[]'::jsonb)
 into v_items from (select * from announcements.notices as n order by (announcements_private.status(n,v_now)='active') desc,updated_at desc,id limit p_limit offset p_offset) n;
 return jsonb_build_object('items',v_items,'total',(select count(*) from announcements.notices),'serverNow',v_now);
end $$;

-- p_priority é mantido na assinatura para clientes anteriores. Novas escritas usam zero.
create or replace function public.announcements_notice_save(
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
  values(p_title,p_message,p_category,p_tone,0,p_starts_at,p_ends_at,p_state,p_show_feedback,auth.uid(),auth.uid()) returning * into n;
 else
  select * into n from announcements.notices where id=p_id for update;
  if not found then raise exception 'Comunicado indisponível.' using errcode='P0002'; end if;
  if p_expected_version is null or p_expected_version<1 then raise exception 'Versão esperada obrigatória.' using errcode='23514'; end if;
  if n.version<>p_expected_version then raise exception 'Comunicado alterado. Recarregue antes de salvar.' using errcode='40001'; end if;
  update announcements.notices set title=p_title,message=p_message,category=p_category,tone=p_tone,priority=0,
   starts_at=p_starts_at,ends_at=p_ends_at,state=p_state,show_feedback=p_show_feedback where id=p_id returning * into n;
 end if;
 return announcements_private.notice_json(n,clock_timestamp());
exception when exclusion_violation then
 raise exception 'Já existe um comunicado programado para esse período. Desative ou ajuste o período do outro comunicado antes de publicar.' using errcode='23P01';
end $$;

create or replace function public.announcements_published() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_now timestamptz; v_items jsonb; v_next timestamptz;
begin
 perform announcements_private.authorize(false);
 v_now:=clock_timestamp();
 -- Sem conteúdo futuro, rascunhos, autoria ou metadados administrativos.
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'type',n.category,'tone',n.tone,
  'title',n.title,'message',n.message,'enabled',true,'startsAt',n.starts_at,'endsAt',n.ends_at,
  'audience','authenticated','priority',0,'showIcon',true,
  'action',case when n.show_feedback then jsonb_build_object('type','feedback','label','Relatar problema ou sugerir melhoria','enabled',true) else null end)),'[]'::jsonb)
 into v_items from announcements.notices n
 where n.state='published' and tstzrange(n.starts_at,n.ends_at,'[)') @> v_now;
 select min(boundary) into v_next from announcements.notices n cross join lateral (values(n.starts_at),(n.ends_at)) d(boundary)
 where n.state='published' and d.boundary>v_now and (n.ends_at is null or n.ends_at>v_now);
 return jsonb_build_object('version',1,'enabled',true,'announcements',v_items,'serverNow',v_now,'nextRefreshAt',v_next);
end $$;

commit;
