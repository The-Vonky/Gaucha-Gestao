begin;

-- Storage v1.72.1 aplica esta operação somente na transformação autenticada.
-- Assinatura, listagem e demais operações conservam a autorização da AP-02.
create or replace function action_plans_private.can_read_evidence_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from action_plans.evidence e join action_plans.plans p on p.id=e.plan_id
  where e.object_key=p_name and e.status='available'
  and action_plans_private.plan_is_intact(p.id,p.source_inspection_id)
  and (not storage.allow_only_operation('storage.render.image_authenticated')
       or e.content_type in ('image/jpeg','image/png'))
  and (
   private.has_scoped_permission('action_plan.read',p.unit_id,p.sector_id)
   or (p.responsible_id=auth.uid()
       and private.has_scoped_permission('action_plan.execute',p.unit_id,p.sector_id)
       and (storage.allow_only_operation('storage.object.get_authenticated')
            or storage.allow_only_operation('storage.render.image_authenticated')))
  ))
$$;

create or replace function audit_private.can_read_checklist_evidence_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select from audit.checklist_evidence e join audit.inspections i on i.id=e.inspection_id
 where e.object_key=p_name and e.status='available'
 and (not storage.allow_only_operation('storage.render.image_authenticated')
      or (e.content_type in ('image/jpeg','image/png')
          and exists(select from audit_private.intact_inspections s where s.id=i.id)))
 and (private.has_unit_permission('audit.inspection.read',i.unit_id)
  or ((storage.allow_only_operation('storage.object.get_authenticated')
       or storage.allow_only_operation('storage.render.image_authenticated'))
   and audit_private.can_read_plan_origin(i.id,i.unit_id))))
$$;

commit;
