begin;

-- A Auditoria consome o contrato de origem que pertence a Planos de Ação.
create or replace function audit_private.can_read_plan_origin(p_inspection uuid,p_unit uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
  select from action_plans_private.inspection_plans(p_inspection) p
   where p.unit_id=p_unit and p.responsible_id=auth.uid()
   and private.has_scoped_permission('action_plan.execute',p.unit_id,p.sector_id)
   and action_plans_private.plan_is_intact(p.id,p.source_inspection_id)
 )
$$;

commit;
