begin;

-- O vínculo de leitura é o plano intacto atribuído no escopo do grant execute.
create function audit_private.can_read_plan_origin(p_inspection uuid,p_unit uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
  select from action_plans.plans p where p.source_inspection_id=p_inspection
   and p.source_type='checklist' and p.unit_id=p_unit and p.responsible_id=auth.uid()
   and private.has_scoped_permission('action_plan.execute',p.unit_id,p.sector_id)
   and action_plans_private.plan_is_intact(p.id,p.source_inspection_id)
 )
$$;
revoke all on function audit_private.can_read_plan_origin(uuid,uuid) from public,anon,authenticated;
grant execute on function audit_private.can_read_plan_origin(uuid,uuid) to authenticated;

alter policy inspections_read on audit.inspections using (
 private.has_unit_permission('audit.inspection.read',unit_id)
 or audit_private.can_read_plan_origin(id,unit_id)
);
alter policy answers_read on audit.inspection_answers using (
 exists(select from audit.inspections i where i.id=inspection_id)
);
-- A nova leitura não substitui a leitura ordinária exigida pela edição via RLS.
alter policy answers_edit on audit.inspection_answers
 using(exists(select from audit.inspections i where i.id=inspection_id and i.status='draft'
  and private.has_unit_permission('audit.inspection.read',i.unit_id)
  and private.has_unit_permission('audit.inspection.edit',i.unit_id)))
 with check(exists(select from audit.inspections i where i.id=inspection_id and i.status='draft'
  and private.has_unit_permission('audit.inspection.read',i.unit_id)
  and private.has_unit_permission('audit.inspection.edit',i.unit_id)));

-- A listagem de Auditorias continua exigindo o grant original. Somente o detalhe por ID usa o vínculo.
create or replace function audit.inspection_summaries_page(
 p_before_applied_on date,p_before_created_at timestamptz,p_before_id uuid,
 p_unit uuid default null,p_inspection uuid default null,p_overview boolean default false)
returns table(id uuid,unit_id uuid,unit_name text,template_version text,applied_on date,previous_visit_on date,
 responsible_id uuid,responsible_name text,status text,final_score numeric,final_classification text,
 finalized_at timestamptz,version integer,created_at timestamptz,total_items integer,answered integer,
 at_count integer,ap_count integer,nat_count integer,nap_count integer)
language sql stable security definer set search_path='' as $$
 select s.id,s.unit_id,s.unit_name,s.template_version,s.applied_on,s.previous_visit_on,s.responsible_id,s.responsible_name,
 s.status,s.final_score,s.final_classification,s.finalized_at,s.version,s.created_at,
 c.total_items,c.answered,c.at_count,c.ap_count,c.nat_count,c.nap_count
 from (
  select i.*,u.name unit_name,p.display_name responsible_name,
  row_number() over(partition by i.unit_id,i.status order by i.applied_on desc,i.created_at desc,i.id desc) status_rank
  from audit_private.intact_inspections i join core.units u on u.id=i.unit_id join core.profiles p on p.id=i.responsible_id
  where (private.has_unit_permission('audit.inspection.read',i.unit_id)
    or (p_inspection is not null and not p_overview and audit_private.can_read_plan_origin(i.id,i.unit_id)))
  and (p_unit is null or i.unit_id=p_unit) and (p_inspection is null or i.id=p_inspection)
 ) s
 cross join lateral (
  select count(*)::integer total_items,count(a.response)::integer answered,
  count(*) filter(where a.response='AT')::integer at_count,count(*) filter(where a.response='AP')::integer ap_count,
  count(*) filter(where a.response='NAT')::integer nat_count,count(*) filter(where a.response='NAP')::integer nap_count
  from audit.inspection_answers a where a.inspection_id=s.id
 ) c
 where (not p_overview or s.status='draft' or s.status_rank<=2)
 and (p_before_id is null or (s.applied_on,s.created_at,s.id)<(p_before_applied_on,p_before_created_at,p_before_id))
 order by s.applied_on desc,s.created_at desc,s.id desc
$$;

create or replace function audit.checklist_evidence(p_inspection uuid,p_item_key text default null)
returns table(id uuid,inspection_id uuid,item_key text,object_key text,original_name text,content_type text,
size_bytes bigint,created_by uuid,uploaded_by_name text,uploaded_at timestamptz)
language sql stable security definer set search_path='' as $$
 select e.id,e.inspection_id,e.item_key,e.object_key,e.original_name,e.content_type,e.size_bytes,e.created_by,p.display_name,e.uploaded_at
 from audit.checklist_evidence e join audit.inspections i on i.id=e.inspection_id join core.profiles p on p.id=e.created_by
 where e.inspection_id=p_inspection and (p_item_key is null or e.item_key=p_item_key) and e.status='available'
 and (private.has_unit_permission('audit.inspection.read',i.unit_id)
   or audit_private.can_read_plan_origin(i.id,i.unit_id))
 order by e.item_key,e.uploaded_at,e.id
$$;
alter policy checklist_evidence_read on audit.checklist_evidence using (
 status='available' and exists(select from audit.inspections i where i.id=inspection_id)
);

-- Sem URLs assinadas para a leitura por atribuição, que deve reavaliar o grant a cada download.
create or replace function audit_private.can_read_checklist_evidence_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select from audit.checklist_evidence e join audit.inspections i on i.id=e.inspection_id
 where e.object_key=p_name and e.status='available'
 and (private.has_unit_permission('audit.inspection.read',i.unit_id)
  or (storage.allow_only_operation('storage.object.get_authenticated')
   and audit_private.can_read_plan_origin(i.id,i.unit_id))))
$$;

commit;
