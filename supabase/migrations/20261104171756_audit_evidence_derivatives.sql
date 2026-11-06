begin;
-- GO B: definição somente. Não provisiona identidade, grants técnicos ou backfill.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('audit-evidence-thumbnails','audit-evidence-thumbnails',false,1048576,array['image/jpeg','image/png']);

-- Uma linha por original/encoder funciona como fila e manifesto; sem bytes ou nomes pessoais.
create table audit.checklist_evidence_derivatives(
 evidence_id uuid not null references audit.checklist_evidence(id),
 encoder_version text not null check(encoder_version='img-480-v1'),
 original_object_key text not null,
 state text not null default 'pending' check(state in ('pending','processing','failed','ready')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 next_attempt_at timestamptz not null default clock_timestamp(),
 lease_id uuid, lease_until timestamptz,
 original_sha256 text, derived_sha256 text, derived_object_key text unique,
 mime text, width integer, height integer, bytes bigint,
 error_code text check(error_code is null or error_code='derivative_generation_failed'),
 created_at timestamptz not null default clock_timestamp(),
 ready_at timestamptz,
 primary key(evidence_id,encoder_version),
 check((state='processing')=(lease_id is not null and lease_until is not null)),
 check(state<>'ready' or (ready_at is not null and original_sha256 is not null
   and derived_sha256 is not null and derived_object_key is not null
   and mime is not null and width is not null and height is not null and bytes is not null)),
 check(original_sha256 is null or original_sha256 ~ '^[a-f0-9]{64}$'),
 check(derived_sha256 is null or derived_sha256 ~ '^[a-f0-9]{64}$'),
 check(mime is null or mime in ('image/jpeg','image/png')),
 check(width is null or width between 1 and 480),
 check(height is null or height between 1 and 480),
 check(bytes is null or bytes between 1 and 1048576),
 check(derived_object_key is null or derived_object_key=evidence_id::text||'/'||encoder_version||'/'||
   original_sha256||'/'||derived_sha256||case mime when 'image/png' then '.png' else '.jpg' end)
);
create index checklist_derivatives_queue on audit.checklist_evidence_derivatives(next_attempt_at,created_at)
where state<>'ready' and attempts<5;
create index checklist_derivatives_leases on audit.checklist_evidence_derivatives(lease_until) where state='processing';
alter table audit.checklist_evidence_derivatives enable row level security;
revoke all on audit.checklist_evidence_derivatives from public,anon,authenticated;
grant select on audit.checklist_evidence_derivatives to authenticated;

create function audit_private.can_read_evidence_derivative(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from audit.checklist_evidence_derivatives d
 join audit.checklist_evidence e on e.id=d.evidence_id
 join audit.inspections i on i.id=e.inspection_id
 where d.derived_object_key=p_name and d.state='ready' and e.status='available'
 and d.original_object_key=e.object_key
 and private.has_unit_permission('audit.inspection.read',i.unit_id))
$$;
revoke all on function audit_private.can_read_evidence_derivative(text) from public,anon,authenticated;
grant execute on function audit_private.can_read_evidence_derivative(text) to authenticated;
create policy checklist_derivative_read on audit.checklist_evidence_derivatives for select to authenticated
using(state='ready' and audit_private.can_read_evidence_derivative(derived_object_key));
create policy audit_derivative_read on storage.objects for select to authenticated
using(bucket_id='audit-evidence-thumbnails' and audit_private.can_read_evidence_derivative(name));
-- Restrições defendem o bucket inclusive contra políticas permissivas futuras de outros módulos.
create policy audit_derivative_no_insert on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'audit-evidence-thumbnails');
create policy audit_derivative_no_update on storage.objects as restrictive for update to authenticated
using(bucket_id<>'audit-evidence-thumbnails') with check(bucket_id<>'audit-evidence-thumbnails');
create policy audit_derivative_no_delete on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'audit-evidence-thumbnails');

create function audit.checklist_evidence_thumbnail(p_evidence uuid)
returns table(evidence_id uuid,encoder_version text,derived_object_key text,mime text,bytes bigint,derived_sha256 text)
language sql stable security invoker set search_path='' as $$
 select d.evidence_id,d.encoder_version,d.derived_object_key,d.mime,d.bytes,d.derived_sha256
 from audit.checklist_evidence_derivatives d where d.evidence_id=p_evidence and d.state='ready'
$$;
revoke all on function audit.checklist_evidence_thumbnail(uuid) from public,anon,authenticated;
grant execute on function audit.checklist_evidence_thumbnail(uuid) to authenticated;

create function audit_private.enqueue_evidence_derivative() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='available' and old.status='pending' and new.content_type in ('image/jpeg','image/png') then
  insert into audit.checklist_evidence_derivatives(evidence_id,encoder_version,original_object_key)
  values(new.id,'img-480-v1',new.object_key) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function audit_private.enqueue_evidence_derivative() from public,anon,authenticated;
create trigger enqueue_evidence_derivative after update of status on audit.checklist_evidence
for each row execute function audit_private.enqueue_evidence_derivative();

-- Contrato de processamento interno. EXECUTE permanece revogado até GO/identidade comprovada.
-- Nenhum papel técnico/JWT/service_role provisionado por esta migration.
create function audit_private.claim_evidence_derivative() returns jsonb
language plpgsql security definer set search_path='' as $$
declare d audit.checklist_evidence_derivatives; e audit.checklist_evidence; decision timestamptz;
begin
 if not pg_try_advisory_xact_lock(16482002) then return null; end if;
 decision=clock_timestamp();
 update audit.checklist_evidence_derivatives set state='failed',lease_id=null,lease_until=null,error_code='derivative_generation_failed'
 where state='processing' and lease_until<=decision and attempts=5;
 if exists(select 1 from audit.checklist_evidence_derivatives
 where state='processing' and lease_until>decision) then return null; end if;
 -- Primeiro trava evidência; mesma ordem da confirmação/remoção e do complete.
 select x.* into e from audit.checklist_evidence x
 join audit.checklist_evidence_derivatives j on j.evidence_id=x.id
 where x.status='available' and x.content_type in ('image/jpeg','image/png')
 and j.state<>'ready' and j.attempts<5 and j.next_attempt_at<=decision
 and (j.lease_until is null or j.lease_until<=decision)
 order by j.next_attempt_at,j.created_at,x.id for update of x skip locked limit 1;
 if not found then return null; end if;
 update audit.checklist_evidence_derivatives set state='processing',attempts=attempts+1,
 lease_id=gen_random_uuid(),lease_until=decision+interval '2 minutes',error_code=null,
 original_sha256=null,derived_sha256=null,derived_object_key=null,mime=null,width=null,height=null,bytes=null,ready_at=null
 where evidence_id=e.id and encoder_version='img-480-v1' returning * into d;
 return jsonb_build_object('evidence',jsonb_build_object('id',e.id,'inspection_id',e.inspection_id,
 'object_key',e.object_key,'content_type',e.content_type,'size_bytes',e.size_bytes,'status',e.status),
 'lease',d.lease_id,'version',d.encoder_version);
end $$;

-- Reserva chave canônica ANTES do upload; futura política técnica poderá limitar INSERT à lease.
create function audit_private.prepare_evidence_derivative(p_lease uuid,p_manifest jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare d audit.checklist_evidence_derivatives; e audit.checklist_evidence; key text;
begin
 select * into e from audit.checklist_evidence where id=(p_manifest->>'evidence_id')::uuid for share;
 if not found or e.status<>'available' then return false; end if;
 select * into d from audit.checklist_evidence_derivatives where evidence_id=e.id
 and encoder_version=p_manifest->>'encoder_version' and lease_id=p_lease
 and state='processing' and lease_until>clock_timestamp() for update;
 if not found then return false; end if;
 key=e.id::text||'/'||d.encoder_version||'/'||(p_manifest->>'original_sha256')||'/'||
 (p_manifest->>'derived_sha256')||case p_manifest->>'mime' when 'image/png' then '.png' else '.jpg' end;
 if (p_manifest->>'original_object_key') is distinct from e.object_key
 or (p_manifest->>'derived_object_key') is distinct from key
 or coalesce((p_manifest->>'bytes')::bigint,0) not between 1 and least(1048576,e.size_bytes-1)
 or coalesce((p_manifest->>'width')::integer,0) not between 1 and 480
 or coalesce((p_manifest->>'height')::integer,0) not between 1 and 480
 or coalesce(p_manifest->>'mime','') not in ('image/jpeg','image/png')
 or coalesce(p_manifest->>'original_sha256','') !~ '^[a-f0-9]{64}$'
 or coalesce(p_manifest->>'derived_sha256','') !~ '^[a-f0-9]{64}$'
 then raise exception 'Invalid derivative' using errcode='23514'; end if;
 update audit.checklist_evidence_derivatives set original_sha256=p_manifest->>'original_sha256',
 derived_sha256=p_manifest->>'derived_sha256',derived_object_key=key,mime=p_manifest->>'mime',
 width=(p_manifest->>'width')::integer,height=(p_manifest->>'height')::integer,bytes=(p_manifest->>'bytes')::bigint
 where evidence_id=e.id and encoder_version=d.encoder_version;
 return true;
end $$;

create function audit_private.complete_evidence_derivative(p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare d audit.checklist_evidence_derivatives; eid uuid;
begin
 select evidence_id into eid from audit.checklist_evidence_derivatives where lease_id=p_lease;
 perform 1 from audit.checklist_evidence where id=eid and status='available' for share;
 if not found then return false; end if;
 select * into d from audit.checklist_evidence_derivatives where lease_id=p_lease
 and state='processing' and lease_until>clock_timestamp() for update;
 if not found or d.derived_object_key is null then return false; end if;
 -- Bytes/hash foram conferidos pela API pelo processador; SQL confere apenas metadados Storage.
 if not exists(select 1 from storage.objects o where o.bucket_id='audit-evidence-thumbnails'
 and o.name=d.derived_object_key and o.metadata->>'size'=d.bytes::text and o.metadata->>'mimetype'=d.mime)
 then return false; end if;
 update audit.checklist_evidence_derivatives set state='ready',ready_at=clock_timestamp(),lease_id=null,lease_until=null
 where evidence_id=d.evidence_id and encoder_version=d.encoder_version;
 return true;
end $$;
create function audit_private.fail_evidence_derivative(p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update audit.checklist_evidence_derivatives set state='failed',lease_id=null,lease_until=null,
 error_code='derivative_generation_failed',next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,attempts-1)::integer))
 where lease_id=p_lease and state='processing' and lease_until>clock_timestamp();
 return found;
end $$;
revoke all on function audit_private.claim_evidence_derivative() from public,anon,authenticated;
revoke all on function audit_private.prepare_evidence_derivative(uuid,jsonb) from public,anon,authenticated;
revoke all on function audit_private.complete_evidence_derivative(uuid) from public,anon,authenticated;
revoke all on function audit_private.fail_evidence_derivative(uuid) from public,anon,authenticated;
commit;
