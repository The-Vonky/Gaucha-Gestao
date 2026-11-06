begin;
-- Filtros operacionais de sessão: não concedem autoridade nova ao login técnico.
create or replace function audit_private.claim_evidence_derivative() returns jsonb
language plpgsql security definer set search_path='' as $$
declare d audit.checklist_evidence_derivatives; e audit.checklist_evidence; decision timestamptz;
 scope_after timestamptz:=nullif(current_setting('audit_derivative.created_after',true),'')::timestamptz;
 scope_inspection uuid:=nullif(current_setting('audit_derivative.inspection_id',true),'')::uuid;
begin
 if (scope_after is null)<>(scope_inspection is null) then raise exception 'Invalid queue scope' using errcode='42501'; end if;
 if not pg_try_advisory_xact_lock(16482002) then return null; end if;
 decision=clock_timestamp();
 update audit.checklist_evidence_derivatives set state='failed',lease_id=null,lease_until=null,error_code='derivative_generation_failed'
 where state='processing' and lease_until<=decision and attempts=5
 and (scope_after is null or (created_at>=scope_after and evidence_id in
 (select id from audit.checklist_evidence where inspection_id=scope_inspection and created_at>=scope_after)));
 if exists(select 1 from audit.checklist_evidence_derivatives
 where state='processing' and lease_until>decision) then return null; end if;
 -- Primeiro trava evidência; mesma ordem da confirmação/remoção e do complete.
 select x.* into e from audit.checklist_evidence x
 join audit.checklist_evidence_derivatives j on j.evidence_id=x.id
 where (scope_after is null or (x.inspection_id=scope_inspection and x.created_at>=scope_after and j.created_at>=scope_after))
 and x.status='available' and x.content_type in ('image/jpeg','image/png')
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


alter table audit.checklist_evidence_derivatives drop constraint checklist_evidence_derivatives_error_code_check;
alter table audit.checklist_evidence_derivatives add constraint checklist_evidence_derivatives_error_code_check
check(error_code is null or error_code in ('derivative_generation_failed','derivative_not_smaller'));

create or replace function audit_private.runtime_derivative_fail(p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not audit_private.runtime_derivative_owned(p_lease) then return false; end if;
 if current_setting('audit_derivative.failure_code',true)='derivative_not_smaller' then
  update audit.checklist_evidence_derivatives set state='failed',attempts=5,lease_id=null,lease_until=null,
  error_code='derivative_not_smaller' where lease_id=p_lease and runtime_login=session_user;
  return found;
 end if;
 return audit_private.fail_evidence_derivative(p_lease);
end $$;

-- Estado mínimo para o leitor já autorizado; não expõe a fila nem permite processá-la.
create function audit.checklist_evidence_thumbnail_state(p_evidence uuid)
returns table(state text,reason text,retryable boolean)
language sql stable security definer set search_path='' as $$
 select coalesce(d.state,'absent'),d.error_code,
 coalesce(d.state in ('pending','processing') or (d.state='failed' and d.attempts<5),false)
 from audit.checklist_evidence e join audit.inspections i on i.id=e.inspection_id
 left join audit.checklist_evidence_derivatives d on d.evidence_id=e.id and d.encoder_version='img-480-v1'
 where e.id=p_evidence and e.status='available' and auth.uid() is not null
 and private.has_unit_permission('audit.inspection.read',i.unit_id)
$$;
revoke all on function audit.checklist_evidence_thumbnail_state(uuid) from public,anon,authenticated;
grant execute on function audit.checklist_evidence_thumbnail_state(uuid) to authenticated;
-- CREATE OR REPLACE preserva os cinco EXECUTEs técnicos existentes; nenhum grant novo ao worker.
commit;
