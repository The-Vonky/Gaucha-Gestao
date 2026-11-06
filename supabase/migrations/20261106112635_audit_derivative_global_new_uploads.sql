begin;
-- Modo explícito para uploads iniciados E confirmados após a partida.
-- Não toca linhas existentes na aplicação; mantém wrappers/ACLs e fila privada.
create or replace function audit_private.claim_evidence_derivative() returns jsonb
language plpgsql security definer set search_path='' as $$
declare d audit.checklist_evidence_derivatives; e audit.checklist_evidence; decision timestamptz;
 queue_mode text:=nullif(current_setting('audit_derivative.queue_mode',true),'');
 scope_after timestamptz:=nullif(current_setting('audit_derivative.created_after',true),'')::timestamptz;
 scope_inspection uuid:=nullif(current_setting('audit_derivative.inspection_id',true),'')::uuid;
begin
 if queue_mode='global_new' then
  if scope_after is null or scope_inspection is not null or not isfinite(scope_after) or scope_after>clock_timestamp() then
   raise exception 'Invalid global new-upload scope' using errcode='42501'; end if;
 elsif queue_mode is null or queue_mode='inspection_new' then
  if (scope_after is null)<>(scope_inspection is null) or (queue_mode='inspection_new' and scope_after is null) then
   raise exception 'Invalid queue scope' using errcode='42501'; end if;
 else raise exception 'Unknown queue mode' using errcode='42501';
 end if;
 if not pg_try_advisory_xact_lock(16482002) then return null; end if;
 decision=clock_timestamp();
 update audit.checklist_evidence_derivatives set state='failed',lease_id=null,lease_until=null,error_code='derivative_generation_failed'
 where state='processing' and lease_until<=decision and attempts=5
 and (scope_after is null or (created_at>=scope_after and evidence_id in
 (select id from audit.checklist_evidence where (queue_mode='global_new' or inspection_id=scope_inspection) and created_at>=scope_after)));
 if exists(select 1 from audit.checklist_evidence_derivatives
 where state='processing' and lease_until>decision) then return null; end if;
 -- Primeiro trava evidência; mesma ordem da confirmação/remoção e do complete.
 select x.* into e from audit.checklist_evidence x
 join audit.checklist_evidence_derivatives j on j.evidence_id=x.id
 where (scope_after is null or ((queue_mode='global_new' or x.inspection_id=scope_inspection) and x.created_at>=scope_after and j.created_at>=scope_after))
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

-- CREATE OR REPLACE preserva owner, assinaturas e ACLs; nenhum grant adicional.
commit;
