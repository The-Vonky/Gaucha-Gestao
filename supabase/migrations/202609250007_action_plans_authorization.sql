begin;
-- 0006 checked permissions before waiting on row locks, so a revocation committed during
-- the wait was not observed. Mutations now lock the target rows first, then the caller's
-- authorization rows, then check permissions with a fresh snapshot.

-- Locks the caller's profile, candidate assignments and their roles FOR SHARE until commit.
-- Profile deactivation, assignment revocation, role deactivation and save_role (which locks
-- the role FOR UPDATE before changing role_permissions) therefore either committed before
-- the check below, and are observed, or wait for this transaction.
create function action_plans_private.authorize(p_permission text,p_unit uuid,p_sector uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from core.profiles where id=auth.uid() and active for share;
 if found then
  perform 1 from core.user_role_assignments a where a.user_id=auth.uid() and a.active
   and (a.scope_type='global' or a.unit_id=p_unit) order by a.id for share;
  perform 1 from core.roles r where r.active and r.id in (select a.role_id from core.user_role_assignments a
   where a.user_id=auth.uid() and a.active and (a.scope_type='global' or a.unit_id=p_unit)) order by r.id for share;
 end if;
 -- Separate statement: a fresh READ COMMITTED snapshot taken after the locks above.
 if not private.has_scoped_permission(p_permission,p_unit,p_sector) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
end $$;

create or replace function action_plans.create_manual_plan(p_unit uuid,p_sector uuid,p_improvement_point text,
 p_action text default '',p_how_to text default '',p_responsible text default '',p_due_date date default null,
 p_effectiveness_criterion text default '',p_monitoring_start date default null,p_monitoring_end date default null,
 p_expected_evidence text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare r action_plans.plans;
begin
 -- Target rows first (as lock_plan does), without revealing their state before authorization.
 perform 1 from core.units where id=p_unit for share;
 if p_sector is not null then perform 1 from core.sectors where id=p_sector for share; end if;
 perform action_plans_private.authorize('action_plan.create_manual',p_unit,p_sector);
 perform 1 from core.units where id=p_unit and active;
 if not found then raise exception 'Inactive unit' using errcode='23514'; end if;
 if p_sector is not null then
  perform 1 from core.sectors s join core.unit_sectors us on us.sector_id=s.id and us.unit_id=p_unit where s.id=p_sector and s.active;
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

-- Shared by update_plan, set_plan_status and verify_plan.
create or replace function action_plans_private.lock_plan(p_id uuid,p_version integer,p_permission text,p_allow_verified boolean)
returns action_plans.plans language plpgsql security definer set search_path='' as $$
declare b action_plans.plans;
begin
 select * into b from action_plans.plans where id=p_id for update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 perform action_plans_private.authorize(p_permission,b.unit_id,b.sector_id);
 if b.version is distinct from p_version then raise exception 'Concurrent change' using errcode='40001'; end if;
 if b.effectiveness is not null and not p_allow_verified then raise exception 'Verified plan is locked' using errcode='55000'; end if;
 return b;
end $$;

revoke all on function action_plans_private.authorize(text,uuid,uuid) from public,anon,authenticated;
commit;
