begin;
set local lock_timeout = '5s';

alter table audit.checklist_evidence_derivatives
  drop constraint checklist_evidence_derivatives_error_code_check,
  add constraint checklist_evidence_derivatives_error_code_check
    check (error_code is null or error_code in (
      'derivative_generation_failed', 'derivative_not_smaller',
      'derivative_dimensions_exceeded', 'derivative_invalid_image'
    ));

-- Mesmo contrato e ACLs. O encerramento exige lease válida do próprio login.
-- attempts=5 é o estado já usado para esgotar o orçamento de retries.
create or replace function audit_private.runtime_derivative_fail(p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare failure text := current_setting('audit_derivative.failure_code', true);
begin
  if not audit_private.runtime_derivative_owned(p_lease) then return false; end if;
  if failure in ('derivative_not_smaller', 'derivative_dimensions_exceeded', 'derivative_invalid_image') then
    update audit.checklist_evidence_derivatives
    set state='failed', attempts=5, lease_id=null, lease_until=null, error_code=failure
    where lease_id=p_lease and runtime_login=session_user;
    return found;
  end if;
  return audit_private.fail_evidence_derivative(p_lease);
end $$;

commit;
