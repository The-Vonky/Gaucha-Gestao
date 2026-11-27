begin;
-- O cursor é aplicado após o ranking de Auditorias para manter o recorte do painel.
-- As assinaturas anteriores continuam disponíveis para os consumidores existentes.
create function audit.inspection_summaries(
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
  where private.has_unit_permission('audit.inspection.read',i.unit_id)
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

create function action_plans.plan_summaries(
 p_before_created_at timestamptz,p_before_id uuid,
 p_plan uuid default null,p_inspection uuid default null)
returns table(plan action_plans.plans,unit_name text,sector_name text,inspection_applied_on date,item_number integer,verified_by_name text,completed_by_name text)
language sql stable security definer set search_path='' as $$
 select p,u.name,s.name,i.applied_on,c.number,vp.display_name,cp.display_name
 from action_plans.plans p join core.units u on u.id=p.unit_id
 left join core.sectors s on s.id=p.sector_id
 left join audit.inspections i on i.id=p.source_inspection_id
 left join audit.checklist_items c on c.template_version=i.template_version and c.key=p.source_item_key
 left join core.profiles vp on vp.id=p.verified_by
 left join core.profiles cp on cp.id=p.completed_by
 where not exists(select from audit_private.inspection_deletions j where j.inspection_id=p.source_inspection_id)
 and private.has_scoped_permission('action_plan.read',p.unit_id,p.sector_id)
 and (p_plan is null or p.id=p_plan) and (p_inspection is null or p.source_inspection_id=p_inspection)
 and (p_before_id is null or p.created_at<p_before_created_at
   or (p.created_at=p_before_created_at and p.id>p_before_id))
 order by p.created_at desc,p.id
$$;

revoke all on function audit.inspection_summaries(date,timestamptz,uuid,uuid,uuid,boolean),
 action_plans.plan_summaries(timestamptz,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function audit.inspection_summaries(date,timestamptz,uuid,uuid,uuid,boolean),
 action_plans.plan_summaries(timestamptz,uuid,uuid,uuid) to authenticated;

create or replace function audit.inspection_summaries(p_unit uuid default null,p_inspection uuid default null,p_overview boolean default false)
returns table(id uuid,unit_id uuid,unit_name text,template_version text,applied_on date,previous_visit_on date,
 responsible_id uuid,responsible_name text,status text,final_score numeric,final_classification text,
 finalized_at timestamptz,version integer,created_at timestamptz,total_items integer,answered integer,
 at_count integer,ap_count integer,nat_count integer,nap_count integer)
language sql stable security definer set search_path='' as $$
 select * from audit.inspection_summaries(null,null,null,p_unit,p_inspection,p_overview)
$$;

create or replace function action_plans.plan_summaries(p_plan uuid default null,p_inspection uuid default null)
returns table(plan action_plans.plans,unit_name text,sector_name text,inspection_applied_on date,item_number integer,verified_by_name text,completed_by_name text)
language sql stable security definer set search_path='' as $$
 select * from action_plans.plan_summaries(null,null,p_plan,p_inspection)
$$;
commit;
