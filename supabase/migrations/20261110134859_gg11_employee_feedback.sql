-- GG-11. Recebimento interno, com autorização Core atual e Storage privado.
begin;
create schema feedback;
revoke all on schema feedback from public,anon,authenticated;
alter default privileges in schema feedback revoke execute on functions from public;

insert into core.permissions(key,domain,resource,action,description) values
 ('feedback.report.read','feedback','report','read','Consultar relatos internos e seus anexos');
insert into core.role_permissions(role_id,permission_key)
 select id,'feedback.report.read' from core.roles where key='platform_administrator';

-- Mantém a projeção de menu de core.my_access coerente com a exclusividade.
create function feedback.guard_role_permission() returns trigger
language plpgsql set search_path='' as $$
begin
 if not exists (select 1 from core.roles where id=new.role_id and key='platform_administrator') then
  raise exception 'A capacidade de relatos é exclusiva do Platform Administrator.' using errcode='42501';
 end if;
 return new;
end $$;
create trigger feedback_role_permission_guard before insert or update on core.role_permissions
 for each row when (new.permission_key='feedback.report.read') execute function feedback.guard_role_permission();

create table feedback.reports (
 id uuid primary key,
 author_id uuid not null references core.profiles(id),
 kind text not null check(kind in ('problem','suggestion')),
 module text not null check(module in ('home','audit','action-plans','abc','sales','rooms','admin','other')),
 description text not null check(length(description) between 10 and 4000),
 origin text not null check(origin in ('home','audit','action-plans','abc','sales','rooms','admin','other')),
 app_version text check(app_version ~ '^[a-zA-Z0-9._+-]{1,64}$'),
 extension text check(extension in ('png','jpg')),
 attachment_key text generated always as (id::text || '.' || extension) stored unique,
 received_at timestamptz
);
create index feedback_reports_received on feedback.reports(received_at desc,id desc) where received_at is not null;
alter table feedback.reports enable row level security;
create policy feedback_reports_deny on feedback.reports as restrictive for all to public using(false) with check(false);
revoke all on feedback.reports from public,anon,authenticated;

create function feedback.has_session() returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_active_user() and (auth.jwt()->>'is_anonymous') is distinct from 'true'
 and exists (
  select 1 from auth.sessions s
  where s.id=nullif(auth.jwt()->>'session_id','')::uuid
    and s.user_id=auth.uid() and (s.not_after is null or s.not_after>statement_timestamp())
 )
$$;

create function feedback.can_read() returns boolean
language sql stable security definer set search_path='' as $$
 select feedback.has_session() and exists (
  select 1 from core.user_role_assignments a
  join core.roles r on r.id=a.role_id and r.key='platform_administrator' and r.active
  join core.role_permissions rp on rp.role_id=r.id and rp.permission_key='feedback.report.read'
  join core.permissions p on p.key=rp.permission_key and p.active
  where a.user_id=auth.uid() and a.active and a.scope_type='global'
 )
$$;

create function public.feedback_prepare(
 p_id uuid,p_kind text,p_module text,p_description text,p_origin text,p_app_version text,p_extension text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r feedback.reports;
begin
 if not feedback.has_session() then raise exception 'Acesso negado.' using errcode='42501'; end if;
 insert into feedback.reports(id,author_id,kind,module,description,origin,app_version,extension)
 values(p_id,auth.uid(),p_kind,p_module,btrim(p_description),p_origin,p_app_version,p_extension)
 on conflict (id) do nothing;
 select * into r from feedback.reports where id=p_id and author_id=auth.uid();
 if not found then raise exception 'Relato indisponível.' using errcode='42501'; end if;
 if (r.kind,r.module,r.description,r.origin,r.app_version,r.extension)
    is distinct from (p_kind,p_module,btrim(p_description),p_origin,p_app_version,p_extension) then
  raise exception 'A tentativa de envio já possui outro conteúdo.' using errcode='23514';
 end if;
 return jsonb_build_object('id',r.id,'attachmentKey',r.attachment_key,'receivedAt',r.received_at);
end $$;

create function public.feedback_receive(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r feedback.reports;
begin
 if not feedback.has_session() then raise exception 'Acesso negado.' using errcode='42501'; end if;
 select * into r from feedback.reports where id=p_id and author_id=auth.uid() for update;
 if not found then raise exception 'Relato indisponível.' using errcode='42501'; end if;
 if r.received_at is null then
  if r.extension is not null and not exists (
   select 1 from storage.objects o
   where o.bucket_id='feedback-attachments' and o.name=r.attachment_key and o.owner_id=r.author_id::text
     and o.metadata->>'mimetype'=case r.extension when 'png' then 'image/png' else 'image/jpeg' end
     and (o.metadata->>'size')::bigint between 1 and 5242880
  ) then raise exception 'Anexo ainda não confirmado.' using errcode='P0002'; end if;
  update feedback.reports set received_at=clock_timestamp() where id=r.id returning * into r;
  insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id)
   values(auth.uid(),'feedback','report.receive','report',r.id::text);
 end if;
 return jsonb_build_object('id',r.id,'receivedAt',r.received_at);
end $$;

create function public.feedback_list(p_kind text,p_module text,p_from timestamptz,p_until timestamptz,
 p_before timestamptz,p_before_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;
begin
 if not feedback.can_read() then raise exception 'Acesso negado.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(page) order by received_at desc,id desc),'[]'::jsonb) into items
 from (
  select r.id,r.kind,r.module,r.received_at,p.display_name,left(r.description,160) as summary
  from feedback.reports r join core.profiles p on p.id=r.author_id
  where r.received_at is not null and (p_kind is null or r.kind=p_kind) and (p_module is null or r.module=p_module)
    and (p_from is null or r.received_at>=p_from) and (p_until is null or r.received_at<p_until)
    and (p_before is null or (r.received_at,r.id)<(p_before,p_before_id))
  order by r.received_at desc,r.id desc limit 21
 ) page;
 return items;
end $$;

create function public.feedback_detail(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare detail jsonb;
begin
 if not feedback.can_read() then raise exception 'Acesso negado.' using errcode='42501'; end if;
 select jsonb_build_object('id',r.id,'kind',r.kind,'module',r.module,'received_at',r.received_at,
  'display_name',p.display_name,'description',r.description,'origin',r.origin,
  'app_version',r.app_version,'attachment_key',r.attachment_key)
 into detail from feedback.reports r join core.profiles p on p.id=r.author_id
 where r.id=p_id and r.received_at is not null;
 if not found then raise exception 'Relato indisponível.' using errcode='P0002'; end if;
 return detail;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('feedback-attachments','feedback-attachments',false,5242880,array['image/png','image/jpeg']);

create function feedback.can_upload_object(p_name text,p_owner text) returns boolean
language sql stable security definer set search_path='' as $$
 select feedback.has_session() and p_owner=auth.uid()::text and exists (
  select 1 from feedback.reports where attachment_key=p_name and author_id=auth.uid() and received_at is null
 )
$$;
create function feedback.can_read_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select feedback.can_read() and exists (
  select 1 from feedback.reports where attachment_key=p_name and received_at is not null
 )
$$;

-- A política restritiva impede que políticas permissivas de outros módulos
-- concedam listagem, assinatura, sobrescrita ou exclusão para este bucket.
create policy feedback_object_insert on storage.objects for insert to authenticated
 with check(bucket_id='feedback-attachments');
create policy feedback_object_read on storage.objects for select to authenticated
 using(bucket_id='feedback-attachments');
create policy feedback_object_boundary on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'feedback-attachments' or
   (storage.allow_only_operation('storage.object.get_authenticated') and feedback.can_read_object(name)))
 with check(bucket_id<>'feedback-attachments' or
   (storage.allow_only_operation('storage.object.upload') and feedback.can_upload_object(name,owner_id)));

revoke all on all functions in schema feedback from public,anon,authenticated;
-- As políticas referenciam os OIDs dos helpers. O schema continua privado.
grant execute on function feedback.can_read_object(text),feedback.can_upload_object(text,text) to anon,authenticated;
revoke all on function public.feedback_prepare(uuid,text,text,text,text,text,text),public.feedback_receive(uuid),
 public.feedback_list(text,text,timestamptz,timestamptz,timestamptz,uuid),public.feedback_detail(uuid)
 from public,anon,authenticated;
grant execute on function public.feedback_prepare(uuid,text,text,text,text,text,text),public.feedback_receive(uuid),
 public.feedback_list(text,text,timestamptz,timestamptz,timestamptz,uuid),public.feedback_detail(uuid)
 to authenticated;
commit;
