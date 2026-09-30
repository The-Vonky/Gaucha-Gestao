begin;
-- Audit owns criterion evidence; bytes are exclusively managed by the Storage API.
-- E3: metadata checks are not trusted byte validation, sanitization or antivirus.
create function audit_private.checklist_file_error(p_name text,p_type text,p_size bigint) returns text
language sql immutable set search_path='' as $$
 select case
 when p_size is null or p_size not between 1 and 10485760 then 'Evidence size not allowed'
 when p_type is null or p_type not in ('image/jpeg','image/png','application/pdf',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then 'Evidence type not allowed'
 when p_name is null or char_length(p_name) not between 1 and 180 or not (p_name is nfc normalized)
 or p_name ~ '[\u0001-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069/\\\\:*?"<>|]'
 or left(p_name,1)='.' or right(p_name,1) in (' ','.') then 'Evidence name not allowed'
 when case lower(substring(p_name from '\\.([^.]+)$'))
 when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png' when 'pdf' then 'application/pdf'
 when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' end
 is distinct from p_type then 'Evidence extension does not match type'
 end
$$;
create table audit.checklist_evidence(
 id uuid primary key default gen_random_uuid(),
 inspection_id uuid not null,
 item_key text not null,
 foreign key(inspection_id,item_key) references audit.inspection_answers(inspection_id,item_key),
 object_key text generated always as (inspection_id::text||'/'||id::text) stored unique,
 original_name text not null,
 content_type text not null,
 size_bytes bigint not null,
 inspection_version_at_begin integer not null check(inspection_version_at_begin>=1),
 created_by uuid not null references core.profiles(id) default auth.uid(),
 created_at timestamptz not null default clock_timestamp(),
 status text not null default 'pending' check(status in ('pending','available','removed')),
 uploaded_at timestamptz,
 removed_by uuid references core.profiles(id),
 removed_at timestamptz,
 constraint checklist_evidence_file check(audit_private.checklist_file_error(original_name,content_type,size_bytes) is null),
 constraint checklist_evidence_shape check(
 (status='pending' and uploaded_at is null and removed_by is null and removed_at is null)
 or (status='available' and uploaded_at is not null and removed_by is null and removed_at is null)
 or (status='removed' and uploaded_at is not null and removed_by is not null and removed_at is not null))
);
create index checklist_evidence_criterion on audit.checklist_evidence(inspection_id,item_key,status);
create index checklist_evidence_quota on audit.checklist_evidence(inspection_id,status,created_at) where status in ('available','pending');

create function audit_private.guard_checklist_evidence() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.inspection_id,new.item_key,new.original_name,new.content_type,new.size_bytes,
 new.inspection_version_at_begin,new.created_by,new.created_at)
 is distinct from (old.id,old.inspection_id,old.item_key,old.original_name,old.content_type,old.size_bytes,
 old.inspection_version_at_begin,old.created_by,old.created_at)
 or not ((old.status='pending' and new.status='available')
 or (old.status='available' and new.status='removed' and new.uploaded_at=old.uploaded_at)) then
 raise exception 'Evidence metadata is immutable' using errcode='55000';
 end if;
 return new;
end $$;
create trigger guard_checklist_evidence before update on audit.checklist_evidence
for each row execute function audit_private.guard_checklist_evidence();

-- Shared Audit mutation order: parent FOR UPDATE -> deterministic authorization locks -> evidence.
-- Neither the FK lookup nor evidence mutations lock/update inspection_answers.
create function audit_private.lock_checklist_evidence_inspection(p_id uuid) returns audit.inspections
language plpgsql security definer set search_path='' as $$
declare i audit.inspections;
begin
 select * into i from audit.inspections where id=p_id for update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 perform audit_private.authorize('audit.inspection.edit',i.unit_id);
 return i;
end $$;
create function audit_private.checklist_evidence_snapshot(e audit.checklist_evidence) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',e.id,'inspection_id',e.inspection_id,'item_key',e.item_key,
 'original_name',e.original_name,'content_type',e.content_type,'size_bytes',e.size_bytes,
 'status',e.status,'created_by',e.created_by,'uploaded_at',e.uploaded_at,'removed_by',e.removed_by,'removed_at',e.removed_at)
$$;
create function audit_private.log_checklist_evidence(p_action text,i audit.inspections,e audit.checklist_evidence,p_before jsonb)
returns void language sql security definer set search_path='' as $$
 insert into core.system_audit_log(actor_user_id,module,entity_type,entity_id,action,unit_id,before_data,after_data,metadata)
 values(auth.uid(),'audit','checklist_evidence',e.id::text,p_action,i.unit_id,p_before,
 audit_private.checklist_evidence_snapshot(e),jsonb_build_object('inspection_id',e.inspection_id,'item_key',e.item_key))
$$;
create function audit.begin_checklist_evidence_upload(p_inspection uuid,p_item_key text,p_original_name text,p_content_type text,p_size bigint)
returns table(evidence_id uuid,object_key text) language plpgsql security definer set search_path='' as $$
declare i audit.inspections; e audit.checklist_evidence; err text; total integer; criterion integer; decision timestamptz;
begin
 i=audit_private.lock_checklist_evidence_inspection(p_inspection);
 if i.status<>'draft' then raise exception 'Inspection is not editable' using errcode='55000'; end if;
 if not exists(select 1 from audit.inspection_answers a where a.inspection_id=i.id and a.item_key=p_item_key) then
 raise exception 'Forbidden' using errcode='42501'; end if;
 err=audit_private.checklist_file_error(p_original_name,p_content_type,p_size);
 if err is not null then raise exception '%',err using errcode='23514'; end if;
 decision=clock_timestamp();
 select count(*),count(*) filter(where x.item_key=p_item_key) into total,criterion
 from audit.checklist_evidence x where x.inspection_id=i.id
 and (x.status='available' or (x.status='pending' and x.created_at>decision-interval '1 hour'));
 if criterion>=10 then raise exception 'Criterion evidence limit reached' using errcode='23514'; end if;
 if total>=100 then raise exception 'Inspection evidence limit reached' using errcode='23514'; end if;
 insert into audit.checklist_evidence(inspection_id,item_key,original_name,content_type,size_bytes,inspection_version_at_begin)
 values(i.id,p_item_key,p_original_name,p_content_type,p_size,i.version) returning * into e;
 return query select e.id,e.object_key;
end $$;

create function audit.confirm_checklist_evidence_upload(p_evidence uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e audit.checklist_evidence; r audit.checklist_evidence; i audit.inspections; metadata jsonb;
begin
 select * into e from audit.checklist_evidence where id=p_evidence;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 i=audit_private.lock_checklist_evidence_inspection(e.inspection_id);
 select * into e from audit.checklist_evidence where id=p_evidence for update;
 if e.created_by is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501'; end if;
 if i.status<>'draft' then raise exception 'Inspection is not editable' using errcode='55000'; end if;
 if e.status='available' then return; end if;
 if e.status<>'pending' or e.created_at<=clock_timestamp()-interval '1 hour' then
 raise exception 'Upload expired' using errcode='55000'; end if;
 if e.inspection_version_at_begin<>i.version then raise exception 'Upload lifecycle changed' using errcode='55000'; end if;
 select o.metadata into metadata from storage.objects o where o.bucket_id='audit-checklist-evidence'
 and o.name=e.object_key and o.owner_id=auth.uid()::text;
 if not found or metadata->>'size' is distinct from e.size_bytes::text
 or metadata->>'mimetype' is distinct from e.content_type then
 raise exception 'Uploaded object does not match' using errcode='23514'; end if;
 update audit.checklist_evidence set status='available',uploaded_at=clock_timestamp() where id=e.id returning * into r;
 perform audit_private.log_checklist_evidence('evidence_add',i,r,null);
end $$;
create function audit.remove_checklist_evidence(p_evidence uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e audit.checklist_evidence; r audit.checklist_evidence; i audit.inspections;
begin
 select * into e from audit.checklist_evidence where id=p_evidence;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 i=audit_private.lock_checklist_evidence_inspection(e.inspection_id);
 select * into e from audit.checklist_evidence where id=p_evidence for update;
 if e.status='pending' then raise exception 'Forbidden' using errcode='42501'; end if;
 if i.status<>'draft' then raise exception 'Inspection is not editable' using errcode='55000'; end if;
 if e.status='removed' then return; end if;
 update audit.checklist_evidence set status='removed',removed_by=auth.uid(),removed_at=clock_timestamp() where id=e.id returning * into r;
 perform audit_private.log_checklist_evidence('evidence_remove',i,r,audit_private.checklist_evidence_snapshot(e));
end $$;
create function audit.checklist_evidence(p_inspection uuid,p_item_key text default null)
returns table(id uuid,inspection_id uuid,item_key text,object_key text,original_name text,content_type text,
size_bytes bigint,created_by uuid,uploaded_by_name text,uploaded_at timestamptz)
language sql stable security definer set search_path='' as $$
 select e.id,e.inspection_id,e.item_key,e.object_key,e.original_name,e.content_type,e.size_bytes,e.created_by,p.display_name,e.uploaded_at
 from audit.checklist_evidence e join audit.inspections i on i.id=e.inspection_id join core.profiles p on p.id=e.created_by
 where e.inspection_id=p_inspection and (p_item_key is null or e.item_key=p_item_key) and e.status='available'
 and private.has_unit_permission('audit.inspection.read',i.unit_id)
 order by e.item_key,e.uploaded_at,e.id
$$;
create function audit_private.can_upload_checklist_evidence_object(p_name text) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from audit.checklist_evidence e join audit.inspections i on i.id=e.inspection_id
 where e.object_key=p_name and e.status='pending' and e.created_by=auth.uid()
 and e.created_at>clock_timestamp()-interval '1 hour' and i.status='draft' and e.inspection_version_at_begin=i.version
 and private.has_unit_permission('audit.inspection.edit',i.unit_id))
$$;
create function audit_private.can_read_checklist_evidence_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from audit.checklist_evidence e join audit.inspections i on i.id=e.inspection_id
 where e.object_key=p_name and e.status='available' and private.has_unit_permission('audit.inspection.read',i.unit_id))
$$;
alter table audit.checklist_evidence enable row level security;
revoke all on audit.checklist_evidence from public,anon,authenticated;
grant select on audit.checklist_evidence to authenticated;
create policy checklist_evidence_read on audit.checklist_evidence for select to authenticated
using(status='available' and audit_private.can_read_checklist_evidence_object(object_key));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('audit-checklist-evidence','audit-checklist-evidence',false,10485760,
array['image/jpeg','image/png','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
create policy audit_checklist_evidence_insert on storage.objects for insert to authenticated
with check(bucket_id='audit-checklist-evidence' and audit_private.can_upload_checklist_evidence_object(name));
create policy audit_checklist_evidence_read on storage.objects for select to authenticated
using(bucket_id='audit-checklist-evidence' and audit_private.can_read_checklist_evidence_object(name));
-- No client UPDATE/DELETE policies: no overwrite, upsert, move or copy destination without pending.

drop function audit.finalize_inspection(uuid,integer);
create function audit.finalize_inspection(p_id uuid,p_version integer,p_expected_evidence_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare r audit.inspections; b audit.inspections; t integer; c record; s numeric; actual uuid[]; expected uuid[];
begin
 select * into b from audit.inspections where id=p_id for update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 perform audit_private.authorize('audit.inspection.finalize',b.unit_id);
 if b.version is distinct from p_version or b.status<>'draft' then raise exception 'Concurrent change' using errcode='40001'; end if;
 if p_expected_evidence_ids is null then raise exception 'Expected evidence set is required' using errcode='23514'; end if;
 select coalesce(array_agg(e.id order by e.id),'{}'::uuid[]) into actual
 from audit.checklist_evidence e where e.inspection_id=p_id and e.status='available';
 select coalesce(array_agg(distinct x order by x),'{}'::uuid[]) into expected from unnest(p_expected_evidence_ids) x;
 if actual is distinct from expected then raise exception 'Evidence set changed' using errcode='40001'; end if;
 -- Scoring/completeness preserved exactly from 0009.
 select item_count into t from audit.checklist_templates where version=b.template_version;
 select count(*) total,count(response) answered,count(*) filter(where response='AT') at,
 count(*) filter(where response='AP') ap,count(*) filter(where response='NAT') nat
 into c from audit.inspection_answers where inspection_id=p_id;
 if c.total<>t or c.answered<>t then raise exception 'Inspection incomplete' using errcode='23514'; end if;
 s=audit_private.conformity(c.at,c.ap,c.nat);
 update audit.inspections set status='finalized',final_score=s,final_classification=audit_private.classify(s),
 finalized_at=clock_timestamp(),finalized_by=auth.uid() where id=p_id returning * into r;
 insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,unit_id,before_data,after_data,metadata)
 values(auth.uid(),'audit','finalize','inspection',r.id::text,r.unit_id,to_jsonb(b),to_jsonb(r),jsonb_build_object('evidence_ids',actual));
end $$;
-- Operator-only metadata reconciliation. Operators must also verify actual bytes via Storage.
-- No automatic purge; authorized physical removal is only through an audited Storage runbook.
create function audit_private.checklist_evidence_reconciliation()
returns table(issue text,evidence_id uuid,object_key text,detail text)
language sql stable security definer set search_path='' as $$
 select 'expired_pending'::text,e.id,e.object_key,case when o.id is null then 'no object' else 'object present' end
 from audit.checklist_evidence e left join storage.objects o on o.bucket_id='audit-checklist-evidence' and o.name=e.object_key
 where e.status='pending' and e.created_at<=now()-interval '1 hour'
 union all
 select 'available_missing_object',e.id,e.object_key,null from audit.checklist_evidence e where e.status='available'
 and not exists(select 1 from storage.objects o where o.bucket_id='audit-checklist-evidence' and o.name=e.object_key)
 union all
 select 'orphan_object',null,o.name,null from storage.objects o where o.bucket_id='audit-checklist-evidence'
 and not exists(select 1 from audit.checklist_evidence e where e.object_key=o.name)
$$;
revoke all on function audit_private.checklist_file_error(text,text,bigint),audit_private.guard_checklist_evidence(),
audit_private.lock_checklist_evidence_inspection(uuid),audit_private.checklist_evidence_snapshot(audit.checklist_evidence),
audit_private.log_checklist_evidence(text,audit.inspections,audit.checklist_evidence,jsonb),
audit_private.can_upload_checklist_evidence_object(text),audit_private.can_read_checklist_evidence_object(text),
audit_private.checklist_evidence_reconciliation(),
audit.begin_checklist_evidence_upload(uuid,text,text,text,bigint),audit.confirm_checklist_evidence_upload(uuid),
audit.remove_checklist_evidence(uuid),audit.checklist_evidence(uuid,text),audit.finalize_inspection(uuid,integer,uuid[])
from public,anon,authenticated;
grant usage on schema audit_private to authenticated;
grant execute on function audit_private.can_upload_checklist_evidence_object(text),audit_private.can_read_checklist_evidence_object(text),
audit.begin_checklist_evidence_upload(uuid,text,text,text,bigint),audit.confirm_checklist_evidence_upload(uuid),
audit.remove_checklist_evidence(uuid),audit.checklist_evidence(uuid,text),audit.finalize_inspection(uuid,integer,uuid[]) to authenticated;
commit;
