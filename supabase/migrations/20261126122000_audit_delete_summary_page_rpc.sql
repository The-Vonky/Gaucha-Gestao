begin;
-- Nomes distintos preservam as chamadas SQL posicionais legadas, inclusive com NULL.
alter function audit.inspection_summaries(date,timestamptz,uuid,uuid,uuid,boolean)
 rename to inspection_summaries_page;
alter function action_plans.plan_summaries(timestamptz,uuid,uuid,uuid)
 rename to plan_summaries_page;

create or replace function audit.inspection_summaries(p_unit uuid default null,p_inspection uuid default null,p_overview boolean default false)
returns table(id uuid,unit_id uuid,unit_name text,template_version text,applied_on date,previous_visit_on date,
 responsible_id uuid,responsible_name text,status text,final_score numeric,final_classification text,
 finalized_at timestamptz,version integer,created_at timestamptz,total_items integer,answered integer,
 at_count integer,ap_count integer,nat_count integer,nap_count integer)
language sql stable security definer set search_path='' as $$
 select * from audit.inspection_summaries_page(null,null,null,p_unit,p_inspection,p_overview)
$$;

create or replace function action_plans.plan_summaries(p_plan uuid default null,p_inspection uuid default null)
returns table(plan action_plans.plans,unit_name text,sector_name text,inspection_applied_on date,item_number integer,verified_by_name text,completed_by_name text)
language sql stable security definer set search_path='' as $$
 select * from action_plans.plan_summaries_page(null,null,p_plan,p_inspection)
$$;
commit;
