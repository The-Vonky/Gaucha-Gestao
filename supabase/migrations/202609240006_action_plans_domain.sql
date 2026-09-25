begin;
-- Transversal Action Plans module. Depends on Core and on the Audit answer contract;
-- Core and Audit never reference this schema.
create schema action_plans;
create schema action_plans_private;
revoke all on schema action_plans, action_plans_private from public;
grant usage on schema action_plans to authenticated;

create table action_plans.plans (
 id uuid primary key default gen_random_uuid(),
 unit_id uuid not null references core.units(id),
 sector_id uuid references core.sectors(id),
 source_type text not null check(source_type in ('checklist','manual')),
 source_inspection_id uuid, source_item_key text,
 source_active boolean, source_response text check(source_response in ('AP','NAT')), source_observation text,
 -- Set when a verified plan's checklist source becomes AP/NAT again; cleared by re-verification.
 source_reactivated_after_verification boolean not null default false,
 improvement_point text not null check(length(btrim(improvement_point)) between 1 and 1000),
 action text not null default '' check(length(action)<=2000),
 how_to text not null default '' check(length(how_to)<=2000),
 responsible text not null default '' check(length(responsible)<=200),
 due_date date,
 status text not null default 'pending' check(status in ('pending','in_progress','completed')),
 effectiveness_criterion text not null default '' check(length(effectiveness_criterion)<=1000),
 monitoring_start date, monitoring_end date,
 expected_evidence text not null default '' check(length(expected_evidence)<=1000),
 effectiveness text check(effectiveness in ('effective','partially_effective','ineffective')),
 verified_on date, verification_notes text check(length(verification_notes)<=2000),
 verified_by uuid references core.profiles(id), verified_at timestamptz,
 completed_by uuid references core.profiles(id), completed_at timestamptz,
 version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid references core.profiles(id) default auth.uid(), updated_by uuid references core.profiles(id) default auth.uid(),
 foreign key(unit_id,sector_id) references core.unit_sectors(unit_id,sector_id),
 foreign key(source_inspection_id,source_item_key) references audit.inspection_answers(inspection_id,item_key),
 unique(source_inspection_id,source_item_key),
 constraint plans_source_shape check(
  (source_type='checklist' and source_inspection_id is not null and source_item_key is not null and source_active is not null
   and source_response is not null and source_observation is not null and sector_id is null)
  or (source_type='manual' and source_inspection_id is null and source_item_key is null and source_active is null
   and source_response is null and source_observation is null and not source_reactivated_after_verification)),
 constraint plans_monitoring check((monitoring_start is null and monitoring_end is null)
  or (monitoring_start is not null and monitoring_end is not null and monitoring_start<=monitoring_end)),
 -- Planning completeness required before execution starts.
 constraint plans_ready check(status='pending' or (btrim(action)<>'' and btrim(how_to)<>'' and btrim(responsible)<>''
  and due_date is not null and btrim(effectiveness_criterion)<>'' and btrim(expected_evidence)<>'')),
 constraint plans_completion check((status='completed')=(completed_at is not null)),
 constraint plans_verification check(
  (effectiveness is null and verified_on is null and verification_notes is null and verified_by is null and verified_at is null)
  or (effectiveness is not null and status='completed' and verified_on is not null and btrim(verification_notes)<>''
   and verified_by is not null and verified_at is not null))
);
create index plans_unit on action_plans.plans(unit_id,sector_id);
create index plans_open_due on action_plans.plans(due_date) where status<>'completed';

create function action_plans_private.log(p_action text,p_row action_plans.plans,p_before jsonb,p_metadata jsonb default '{}')
returns void language sql security definer set search_path='' as $$
 insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,unit_id,sector_id,before_data,after_data,metadata)
 values(auth.uid(),'action_plans',p_action,'plan',p_row.id::text,p_row.unit_id,p_row.sector_id,p_before,to_jsonb(p_row),p_metadata)
$$;
create function action_plans_private.touch_plan() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.unit_id,new.sector_id,new.source_type,new.source_inspection_id,new.source_item_key,new.created_at,new.created_by)
  is distinct from (old.unit_id,old.sector_id,old.source_type,old.source_inspection_id,old.source_item_key,old.created_at,old.created_by)
  or (new.source_type='checklist' and new.improvement_point is distinct from old.improvement_point) then
  raise exception 'Plan scope and source are immutable' using errcode='55000';
 end if;
 new.updated_at=clock_timestamp(); new.updated_by=auth.uid(); new.version=old.version+1;
 return new;
end $$;
create trigger touch_plan before update on action_plans.plans for each row execute function action_plans_private.touch_plan();
-- A checklist plan always belongs to its inspection's unit.
create function action_plans_private.validate_plan_unit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.source_type='checklist' and new.source_inspection_id is not null
  and not exists(select 1 from audit.inspections i where i.id=new.source_inspection_id and i.unit_id=new.unit_id) then
  raise exception 'Checklist plan unit must match the inspection' using errcode='23514';
 end if;
 return new;
end $$;
create trigger validate_plan_unit before insert on action_plans.plans for each row execute function action_plans_private.validate_plan_unit();

-- Audit integration contract: keep exactly one checklist plan per inspection item.
-- Runs after Audit has authorized the answer update; writes only to action_plans.
create function action_plans_private.sync_checklist_source() returns trigger language plpgsql security definer set search_path='' as $$
declare p action_plans.plans; b action_plans.plans; eligible boolean=coalesce(new.response in ('AP','NAT'),false);
begin
 select * into b from action_plans.plans where source_inspection_id=new.inspection_id and source_item_key=new.item_key for update;
 if not found then
  if not eligible then return null; end if;
  insert into action_plans.plans(unit_id,source_type,source_inspection_id,source_item_key,source_active,source_response,source_observation,improvement_point,created_by,updated_by)
  select i.unit_id,'checklist',new.inspection_id,new.item_key,true,new.response,new.observation,c.text,auth.uid(),auth.uid()
  from audit.inspections i join audit.checklist_items c on c.template_version=i.template_version and c.key=new.item_key
  where i.id=new.inspection_id
  on conflict(source_inspection_id,source_item_key) do nothing returning * into p;
  if p.id is not null then perform action_plans_private.log('create',p,null,'{"source":"checklist"}'); return null; end if;
  -- A concurrent answer write created it first: continue with the existing row.
  select * into b from action_plans.plans where source_inspection_id=new.inspection_id and source_item_key=new.item_key for update;
 end if;
 if eligible then
  if (b.source_active,b.source_response,b.source_observation) is not distinct from (true,new.response,new.observation) then return null; end if;
  update action_plans.plans set source_active=true,source_response=new.response,source_observation=new.observation,
   source_reactivated_after_verification=source_reactivated_after_verification or (not b.source_active and b.effectiveness is not null)
  where id=b.id returning * into p;
  if not b.source_active then perform action_plans_private.log('source_activate',p,to_jsonb(b));
  elsif b.source_response<>new.response then perform action_plans_private.log('source_update',p,to_jsonb(b)); end if;
 elsif b.source_active then
  update action_plans.plans set source_active=false where id=b.id returning * into p;
  perform action_plans_private.log('source_deactivate',p,to_jsonb(b));
 end if;
 return null;
end $$;
create trigger sync_action_plans after update of response,observation on audit.inspection_answers
 for each row execute function action_plans_private.sync_checklist_source();

-- Deterministic backfill: one active plan per current AP/NAT answer, nothing for AT/NAP/null.
with created as (
 insert into action_plans.plans(unit_id,source_type,source_inspection_id,source_item_key,source_active,source_response,source_observation,improvement_point,created_by,updated_by)
 select i.unit_id,'checklist',a.inspection_id,a.item_key,true,a.response,a.observation,c.text,a.updated_by,a.updated_by
 from audit.inspection_answers a join audit.inspections i on i.id=a.inspection_id
 join audit.checklist_items c on c.template_version=a.template_version and c.key=a.item_key
 where a.response in ('AP','NAT') order by a.inspection_id,a.item_key
 on conflict(source_inspection_id,source_item_key) do nothing returning *
)
insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,unit_id,after_data,metadata)
select null,'action_plans','create','plan',p.id::text,p.unit_id,to_jsonb(p),'{"source":"checklist","backfill":true}' from created p;

-- Reads: sector_id null is unit-wide; otherwise exact sector scope (ADR-005).
grant select on action_plans.plans to authenticated;
alter table action_plans.plans enable row level security;
create policy plans_read on action_plans.plans for select to authenticated
 using(private.has_scoped_permission('action_plan.read',unit_id,sector_id));

-- Plans with display context the caller may lack Core/Audit read access to.
create function action_plans.plan_summaries(p_plan uuid default null,p_inspection uuid default null)
returns table(plan action_plans.plans,unit_name text,sector_name text,inspection_applied_on date,item_number integer,verified_by_name text,completed_by_name text)
language sql stable security definer set search_path='' as $$
 select p,u.name,s.name,i.applied_on,c.number,vp.display_name,cp.display_name
 from action_plans.plans p join core.units u on u.id=p.unit_id
 left join core.sectors s on s.id=p.sector_id
 left join audit.inspections i on i.id=p.source_inspection_id
 left join audit.checklist_items c on c.template_version=i.template_version and c.key=p.source_item_key
 left join core.profiles vp on vp.id=p.verified_by
 left join core.profiles cp on cp.id=p.completed_by
 where private.has_scoped_permission('action_plan.read',p.unit_id,p.sector_id)
 and (p_plan is null or p.id=p_plan) and (p_inspection is null or p.source_inspection_id=p_inspection)
 order by p.created_at desc,p.id
$$;
-- Unit and unit/sector targets where the caller may create manual plans.
create function action_plans.creation_scopes() returns table(unit_id uuid,unit_name text,sector_id uuid,sector_name text)
language sql stable security definer set search_path='' as $$
 select u.id,u.name,null::uuid,null::text from core.units u
 where u.active and private.has_scoped_permission('action_plan.create_manual',u.id,null)
 union all
 select u.id,u.name,s.id,s.name from core.unit_sectors us join core.units u on u.id=us.unit_id join core.sectors s on s.id=us.sector_id
 where u.active and s.active and private.has_scoped_permission('action_plan.create_manual',u.id,s.id)
 order by 2,4 nulls first
$$;

create function action_plans.create_manual_plan(p_unit uuid,p_sector uuid,p_improvement_point text,
 p_action text default '',p_how_to text default '',p_responsible text default '',p_due_date date default null,
 p_effectiveness_criterion text default '',p_monitoring_start date default null,p_monitoring_end date default null,
 p_expected_evidence text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare r action_plans.plans;
begin
 if not private.has_scoped_permission('action_plan.create_manual',p_unit,p_sector) then raise exception 'Forbidden' using errcode='42501'; end if;
 perform 1 from core.units where id=p_unit and active for share;
 if not found then raise exception 'Inactive unit' using errcode='23514'; end if;
 if p_sector is not null then
  perform 1 from core.sectors s join core.unit_sectors us on us.sector_id=s.id and us.unit_id=p_unit where s.id=p_sector and s.active for share of s;
  if not found then raise exception 'Invalid sector for unit' using errcode='23514'; end if;
 end if;
 insert into action_plans.plans(unit_id,sector_id,source_type,improvement_point,action,how_to,responsible,due_date,
  effectiveness_criterion,monitoring_start,monitoring_end,expected_evidence)
 values(p_unit,p_sector,'manual',btrim(p_improvement_point),coalesce(btrim(p_action),''),coalesce(btrim(p_how_to),''),coalesce(btrim(p_responsible),''),p_due_date,
  coalesce(btrim(p_effectiveness_criterion),''),p_monitoring_start,p_monitoring_end,coalesce(btrim(p_expected_evidence),''))
 returning * into r;
 perform action_plans_private.log('create',r,null,'{"source":"manual"}');
 return r.id;
end $$;

-- Loads a plan for a mutation: authorization, expected version and verification lock.
create function action_plans_private.lock_plan(p_id uuid,p_version integer,p_permission text,p_allow_verified boolean)
returns action_plans.plans language plpgsql security definer set search_path='' as $$
declare b action_plans.plans;
begin
 select * into b from action_plans.plans where id=p_id for update;
 if not found or not private.has_scoped_permission(p_permission,b.unit_id,b.sector_id) then raise exception 'Forbidden' using errcode='42501'; end if;
 if b.version is distinct from p_version then raise exception 'Concurrent change' using errcode='40001'; end if;
 if b.effectiveness is not null and not p_allow_verified then raise exception 'Verified plan is locked' using errcode='55000'; end if;
 return b;
end $$;
create function action_plans.update_plan(p_id uuid,p_version integer,p_improvement_point text,p_action text,p_how_to text,
 p_responsible text,p_due_date date,p_effectiveness_criterion text,p_monitoring_start date,p_monitoring_end date,p_expected_evidence text)
returns void language plpgsql security definer set search_path='' as $$
declare b action_plans.plans; r action_plans.plans;
begin
 b=action_plans_private.lock_plan(p_id,p_version,'action_plan.write',false);
 update action_plans.plans set
  improvement_point=case when b.source_type='manual' then btrim(p_improvement_point) else improvement_point end,
  action=coalesce(btrim(p_action),''),how_to=coalesce(btrim(p_how_to),''),responsible=coalesce(btrim(p_responsible),''),
  due_date=p_due_date,effectiveness_criterion=coalesce(btrim(p_effectiveness_criterion),''),
  monitoring_start=p_monitoring_start,monitoring_end=p_monitoring_end,expected_evidence=coalesce(btrim(p_expected_evidence),'')
 where id=p_id returning * into r;
 perform action_plans_private.log('update',r,to_jsonb(b));
end $$;
create function action_plans.set_plan_status(p_id uuid,p_version integer,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare b action_plans.plans; r action_plans.plans;
begin
 b=action_plans_private.lock_plan(p_id,p_version,'action_plan.write',false);
 if p_status is null or p_status=b.status then raise exception 'Invalid status transition' using errcode='23514'; end if;
 update action_plans.plans set status=p_status,
  completed_at=case when p_status='completed' then clock_timestamp() end,
  completed_by=case when p_status='completed' then auth.uid() end
 where id=p_id returning * into r;
 perform action_plans_private.log('status',r,to_jsonb(b));
end $$;
create function action_plans.verify_plan(p_id uuid,p_version integer,p_effectiveness text,p_verified_on date,p_notes text) returns void
language plpgsql security definer set search_path='' as $$
declare b action_plans.plans; r action_plans.plans;
begin
 b=action_plans_private.lock_plan(p_id,p_version,'action_plan.verify',true);
 if b.status<>'completed' then raise exception 'Only completed plans can be verified' using errcode='23514'; end if;
 -- Business date may not be in the future (one day of tolerance for UTC vs local date).
 if p_verified_on is null or p_verified_on>current_date+1 or coalesce(btrim(p_notes),'')='' then
  raise exception 'Verification date and analysis are required' using errcode='23514';
 end if;
 update action_plans.plans set effectiveness=p_effectiveness,verified_on=p_verified_on,verification_notes=btrim(p_notes),
  verified_by=auth.uid(),verified_at=clock_timestamp(),source_reactivated_after_verification=false
 where id=p_id returning * into r;
 perform action_plans_private.log(case when b.effectiveness is null then 'verify' else 're_verify' end,r,to_jsonb(b));
end $$;

revoke all on all functions in schema action_plans,action_plans_private from public,anon,authenticated;
grant execute on function action_plans.plan_summaries(uuid,uuid),action_plans.creation_scopes(),
 action_plans.create_manual_plan(uuid,uuid,text,text,text,text,date,text,date,date,text),
 action_plans.update_plan(uuid,integer,text,text,text,text,date,text,date,date,text),
 action_plans.set_plan_status(uuid,integer,text),action_plans.verify_plan(uuid,integer,text,date,text) to authenticated;
commit;
