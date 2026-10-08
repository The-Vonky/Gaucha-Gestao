begin;
-- Access Governance Read v1 (docs/briefs/CORE_ACCESS_GOVERNANCE_READ_V1.md). Additive and
-- read-only: no table, column, policy or existing function changes, no second history ledger.
-- Every function is SECURITY INVOKER, so each join stays under the RLS of its source table
-- (profiles, assignments, roles, units, sectors, role_permissions, permissions, system_audit_log).
-- Explicit gates sit on top, following ACCESS_GOVERNANCE_V1.md section 7:
--  U = global admin.user.read or admin.user.manage (nominative data: people, assignments, counts);
--  R = global admin.role.read or admin.role.manage (role holders, together with U);
--  T = the unit row is readable under units_read (admin.unit.read/manage covering it, or the
--      auxiliary audiences that policy already allows). T alone never returns people or counts.
-- An absent ID and an ID the caller cannot read get the same answer: no rows.

-- One row per assignment; shared by the user, unit and role listings.
create type core.access_assignment_row as (
 assignment_id uuid, assignment_version integer, assignment_active boolean,
 user_id uuid, user_display_name text, user_active boolean,
 role_id uuid, role_key text, role_name text, role_active boolean, role_system boolean,
 scope_type text,
 -- *_label_source: 'current' (current name, readable by the caller) or 'restricted'
 -- (the caller cannot read that catalog row); null when the scope has no unit/sector.
 unit_id uuid, unit_code text, unit_name text, unit_active boolean, unit_label_source text,
 sector_id uuid, sector_code text, sector_name text, sector_active boolean, sector_label_source text,
 -- Grant evidence is the assignment row itself (granted_by, created_at).
 granted_by uuid, granted_by_name text, granted_at timestamptz, updated_at timestamptz,
 -- Revocation evidence only from a revoke event the caller may read (logs_read); never
 -- inferred from updated_at. 'audit_event', 'unavailable', or null while the assignment is active.
 revoked_at timestamptz, revoked_by uuid, revoked_by_name text, revocation_evidence text,
 -- 'available' when the caller may read the role composition (R, admin.user.manage, or owning
 -- the role, as rp_read); otherwise 'restricted' and effective/keys are null, never "empty".
 -- effective: an active assignment is NOT usable access by itself. true only when assignment,
 -- user and role are active and the role holds at least one active permission; it then covers
 -- only those keys at this assignment's scope (never other domains or scopes) and never proves
 -- access to a business record, whose own rules still apply. Unit/sector activity is reported
 -- separately and is not part of the Core helper equation.
 composition_visibility text, effective boolean,
 active_permission_keys text[], inactive_permission_keys text[],
 -- Totals of the whole filtered set, not of the page; people are distinct users.
 total_count bigint, people_count bigint
);

create function private.governance_page(p_limit integer,p_offset integer) returns void
language plpgsql immutable set search_path='' as $$
begin
 if p_limit is null or p_limit<1 or p_limit>100 or p_offset is null or p_offset<0 then
  raise exception 'Invalid page' using errcode='22023';
 end if;
end $$;

create function private.has_user_audience() returns boolean language sql stable security invoker set search_path='' as $$
 select private.has_global_permission('admin.user.read') or private.has_global_permission('admin.user.manage')
$$;
create function private.has_role_audience() returns boolean language sql stable security invoker set search_path='' as $$
 select private.has_global_permission('admin.role.read') or private.has_global_permission('admin.role.manage')
$$;

-- Projects an already authorized, ordered page of assignment IDs in one statement (no N+1).
create function private.access_assignment_page(p_ids uuid[],p_total bigint,p_people bigint)
returns setof core.access_assignment_row language sql stable security invoker set search_path='' as $$
 with caller as (select private.has_role_audience() or private.has_global_permission('admin.user.manage') as composition)
 select a.id,a.version,a.active,
  p.id,p.display_name,p.active,
  r.id,r.key,r.name,r.active,r.system,
  a.scope_type,
  a.unit_id,u.code,u.name,u.active,
  case when a.unit_id is null then null when u.id is null then 'restricted' else 'current' end,
  a.sector_id,s.code,s.name,s.active,
  case when a.sector_id is null then null when s.id is null then 'restricted' else 'current' end,
  a.granted_by,g.display_name,a.created_at,a.updated_at,
  rv.occurred_at,rv.actor_user_id,rb.display_name,
  case when a.active then null when rv.id is null then 'unavailable' else 'audit_event' end,
  case when cv.visible then 'available' else 'restricted' end,
  case when not (a.active and p.active and r.active) then false
   when not cv.visible then null else cardinality(k.active_keys)>0 end,
  k.active_keys,k.inactive_keys,
  p_total,p_people
 from unnest(p_ids) with ordinality as page(id,ord)
 join core.user_role_assignments a on a.id=page.id
 join core.profiles p on p.id=a.user_id
 join core.roles r on r.id=a.role_id
 left join core.units u on u.id=a.unit_id
 left join core.sectors s on s.id=a.sector_id
 left join core.profiles g on g.id=a.granted_by
 cross join caller c
 cross join lateral (select c.composition or private.owns_role(r.id) as visible) cv
 left join lateral (
  select coalesce(array_agg(pm.key order by pm.key) filter(where pm.active),'{}') as active_keys,
   coalesce(array_agg(pm.key order by pm.key) filter(where not pm.active),'{}') as inactive_keys
  from core.role_permissions rp join core.permissions pm on pm.key=rp.permission_key
  where rp.role_id=r.id and cv.visible
  having cv.visible) k on true
 left join lateral (
  select l.id,l.occurred_at,l.actor_user_id from core.system_audit_log l
  where not a.active and l.entity_type='user_role_assignments' and l.action='revoke'
   and l.entity_id=a.id::text and l.before_data->>'active'='true'
  order by l.occurred_at,l.id limit 1) rv on true
 left join core.profiles rb on rb.id=rv.actor_user_id
 order by page.ord
$$;
-- Revocation lookup path of access_assignment_page (one revoke event per assignment page row).
create index audit_log_assignment_revoke on core.system_audit_log(entity_id,occurred_at,id)
 where entity_type='user_role_assignments' and action='revoke';

-- Which access does a user hold? Requires U. Composition coverage is explicit: 'complete',
-- 'partial' or 'restricted' over the active assignments; the effective count is null when
-- incomplete instead of pretending the hidden part is empty. Permission keys are deliberately
-- returned only per assignment (user_access_assignments), paired with their scope: a flat union
-- would read as "these rights everywhere".
create function core.user_access_summary(p_user uuid)
returns table(user_id uuid,display_name text,user_active boolean,user_version integer,
 active_assignment_count bigint,revoked_assignment_count bigint,effective_assignment_count bigint,
 composition_coverage text,evaluated_at timestamptz)
language plpgsql stable security invoker set search_path='' as $$
declare v_composition boolean;
begin
 if not private.has_user_audience() then return; end if;
 v_composition=private.has_role_audience() or private.has_global_permission('admin.user.manage');
 return query
 with a as (
  select x.active,x.role_id,r.active as role_active,(v_composition or private.owns_role(x.role_id)) as visible
  from core.user_role_assignments x join core.roles r on r.id=x.role_id where x.user_id=p_user),
 e as (
  select a.role_id,a.visible,a.role_active from a where a.active),
 s as (
  select count(*) filter(where a.active) as active_n,count(*) filter(where not a.active) as revoked_n,
   count(*) filter(where a.active and not a.visible) as hidden_n from a)
 select p.id,p.display_name,p.active,p.version,s.active_n,s.revoked_n,
  case when s.hidden_n>0 then null else (
   select count(*) from e where p.active and e.role_active and exists(
    select 1 from core.role_permissions rp join core.permissions pm on pm.key=rp.permission_key and pm.active
    where rp.role_id=e.role_id)) end,
  case when s.hidden_n=0 then 'complete' when s.hidden_n=s.active_n then 'restricted' else 'partial' end,
  now()
 from core.profiles p cross join s where p.id=p_user;
end $$;

-- Assignment history of a user (revoked ones only when asked). Requires U.
create function core.user_access_assignments(p_user uuid,p_include_revoked boolean default false,
 p_limit integer default 25,p_offset integer default 0)
returns setof core.access_assignment_row language plpgsql stable security invoker set search_path='' as $$
declare v_ids uuid[]; v_total bigint;
begin
 perform private.governance_page(p_limit,p_offset);
 if not private.has_user_audience() or p_include_revoked is null then return; end if;
 select count(*) into v_total from core.user_role_assignments a where a.user_id=p_user and (p_include_revoked or a.active);
 if v_total=0 then return; end if;
 v_ids=array(select a.id from core.user_role_assignments a where a.user_id=p_user and (p_include_revoked or a.active)
  order by a.active desc,a.created_at desc,a.id limit p_limit offset p_offset);
 return query select * from private.access_assignment_page(v_ids,v_total,1);
end $$;

-- Who covers a unit (optionally narrowed to one of its sectors)? The unit must be readable (T);
-- people and counts additionally require U. Coverage: global assignments, assignments of that
-- unit, and sector assignments inside it (only the given sector when p_sector is set).
create function private.unit_access_covers(p_unit uuid,p_sector uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from core.units where id=p_unit)
  and (p_sector is null or exists(select 1 from core.unit_sectors where unit_id=p_unit and sector_id=p_sector))
$$;

-- people_count and the *_assignment_count columns count ACTIVE ASSIGNMENTS covering the unit,
-- not usable access. effective_people_count counts active users with at least one effective
-- covering assignment (see access_assignment_row.effective); it needs the global composition
-- audience (R or admin.user.manage) and is null (unknown) otherwise, never zero.
create function core.unit_access_summary(p_unit uuid,p_sector uuid default null)
returns table(unit_id uuid,unit_code text,unit_name text,unit_active boolean,unit_version integer,sector_id uuid,
 people_visibility text,people_count bigint,effective_people_count bigint,global_assignment_count bigint,
 unit_assignment_count bigint,sector_assignment_count bigint,evaluated_at timestamptz)
language plpgsql stable security invoker set search_path='' as $$
declare v_people boolean; v_composition boolean;
begin
 if not private.is_active_user() or not private.unit_access_covers(p_unit,p_sector) then return; end if;
 v_people=private.has_user_audience();
 v_composition=private.has_role_audience() or private.has_global_permission('admin.user.manage');
 return query
 with a as (
  select x.user_id,x.role_id,x.scope_type from core.user_role_assignments x
  where v_people and x.active and (x.scope_type='global' or (x.unit_id=p_unit and
   (x.scope_type='unit' or (x.scope_type='sector' and (p_sector is null or x.sector_id=p_sector))))))
 select u.id,u.code,u.name,u.active,u.version,p_sector,
  case when v_people then 'available' else 'restricted' end,
  case when v_people then (select count(distinct a.user_id) from a) end,
  case when v_people and v_composition then (
   select count(distinct a.user_id) from a join core.profiles p on p.id=a.user_id and p.active
   join core.roles r on r.id=a.role_id and r.active
   where exists(select 1 from core.role_permissions rp join core.permissions pm on pm.key=rp.permission_key and pm.active
    where rp.role_id=a.role_id)) end,
  case when v_people then (select count(*) from a where a.scope_type='global') end,
  case when v_people then (select count(*) from a where a.scope_type='unit') end,
  case when v_people then (select count(*) from a where a.scope_type='sector') end,
  now()
 from core.units u where u.id=p_unit;
end $$;

create function core.unit_access_assignments(p_unit uuid,p_sector uuid default null,p_include_revoked boolean default false,
 p_limit integer default 25,p_offset integer default 0)
returns setof core.access_assignment_row language plpgsql stable security invoker set search_path='' as $$
declare v_ids uuid[]; v_total bigint; v_people bigint;
begin
 perform private.governance_page(p_limit,p_offset);
 if not private.has_user_audience() or p_include_revoked is null or not private.unit_access_covers(p_unit,p_sector) then return; end if;
 select count(*),count(distinct a.user_id) into v_total,v_people from core.user_role_assignments a
 where (p_include_revoked or a.active) and (a.scope_type='global' or (a.unit_id=p_unit and
  (a.scope_type='unit' or (a.scope_type='sector' and (p_sector is null or a.sector_id=p_sector)))));
 if v_total=0 then return; end if;
 v_ids=array(select a.id from core.user_role_assignments a join core.profiles p on p.id=a.user_id join core.roles r on r.id=a.role_id
  where (p_include_revoked or a.active) and (a.scope_type='global' or (a.unit_id=p_unit and
   (a.scope_type='unit' or (a.scope_type='sector' and (p_sector is null or a.sector_id=p_sector)))))
  order by p.display_name,p.id,case a.scope_type when 'global' then 0 when 'unit' then 1 else 2 end,a.active desc,r.name,a.id
  limit p_limit offset p_offset);
 return query select * from private.access_assignment_page(v_ids,v_total,v_people);
end $$;

-- POTENTIAL impact of changing a role: a current-state snapshot of who holds it. It does NOT
-- simulate a proposed permission delta, does not evaluate overlapping grants and is not a
-- preview or confirmation for a future save (impact_kind='potential', overlap_evaluated=false).
-- The role row requires U or R. Holder figures require U + R and are null with
-- holders_visibility='restricted' otherwise; composition figures are null with
-- composition_visibility='restricted' when unreadable. Null means unknown, never zero.
--  holder_count: distinct users with an active assignment (overlapping assignments count once);
--   active_assignment_count/revoked_assignment_count count assignments.
--  inactive_user_holder_count: holders whose user is inactive (the assignment grants them nothing).
--  potentially_affected_user_count: active users with an active assignment; their access may
--   change if the composition or the activation of this role changes.
--  currently_effective_user_count: of those, who derive at least one capability from this role
--   right now (0 when the role is inactive or has no active permission). An active assignment
--   alone is not usable access.
--  holders_with_other_roles_count: potentially affected users who also hold an active assignment
--   of another role and may keep equivalent capabilities through it; not evaluated per permission.
create function core.role_impact_summary(p_role uuid)
returns table(impact_kind text,overlap_evaluated boolean,role_id uuid,role_key text,role_name text,role_active boolean,
 role_system boolean,role_global_only boolean,role_version integer,
 composition_visibility text,active_permission_count bigint,inactive_permission_count bigint,role_grants_capabilities boolean,
 holders_visibility text,holder_count bigint,inactive_user_holder_count bigint,potentially_affected_user_count bigint,
 currently_effective_user_count bigint,holders_with_other_roles_count bigint,
 active_assignment_count bigint,revoked_assignment_count bigint,evaluated_at timestamptz)
language plpgsql stable security invoker set search_path='' as $$
declare v_holders boolean; v_composition boolean; v_active_permissions bigint; v_inactive_permissions bigint;
begin
 if not (private.has_user_audience() or private.has_role_audience()) then return; end if;
 v_holders=private.has_user_audience() and private.has_role_audience();
 v_composition=private.has_role_audience() or private.has_global_permission('admin.user.manage') or private.owns_role(p_role);
 if v_composition then
  select count(*) filter(where pm.active),count(*) filter(where not pm.active) into v_active_permissions,v_inactive_permissions
  from core.role_permissions rp join core.permissions pm on pm.key=rp.permission_key where rp.role_id=p_role;
 end if;
 return query
 with a as (
  select x.user_id,x.active,p.active as user_active from core.user_role_assignments x join core.profiles p on p.id=x.user_id
  where v_holders and x.role_id=p_role),
 h as (select distinct a.user_id,a.user_active from a where a.active),
 affected as (select h.user_id from h where h.user_active)
 select 'potential'::text,false,r.id,r.key,r.name,r.active,r.system,r.global_only,r.version,
  case when v_composition then 'available' else 'restricted' end,
  v_active_permissions,v_inactive_permissions,
  case when not r.active then false when v_composition then v_active_permissions>0 end,
  case when v_holders then 'available' else 'restricted' end,
  case when v_holders then (select count(*) from h) end,
  case when v_holders then (select count(*) from h where not h.user_active) end,
  case when v_holders then (select count(*) from affected) end,
  case when not v_holders then null when not r.active then 0 when not v_composition then null
   when v_active_permissions=0 then 0 else (select count(*) from affected) end,
  case when v_holders then (select count(*) from affected where exists(
   select 1 from core.user_role_assignments o where o.user_id=affected.user_id and o.active and o.role_id<>p_role)) end,
  case when v_holders then (select count(*) from a where a.active) end,
  case when v_holders then (select count(*) from a where not a.active) end,
  now()
 from core.roles r where r.id=p_role;
end $$;

-- Users holding a role ("usuários com este perfil"). Requires U + R.
create function core.role_holders(p_role uuid,p_include_revoked boolean default false,
 p_limit integer default 25,p_offset integer default 0)
returns setof core.access_assignment_row language plpgsql stable security invoker set search_path='' as $$
declare v_ids uuid[]; v_total bigint; v_people bigint;
begin
 perform private.governance_page(p_limit,p_offset);
 if not (private.has_user_audience() and private.has_role_audience()) or p_include_revoked is null
  or not exists(select 1 from core.roles where id=p_role) then return; end if;
 select count(*),count(distinct a.user_id) into v_total,v_people from core.user_role_assignments a
 where a.role_id=p_role and (p_include_revoked or a.active);
 if v_total=0 then return; end if;
 v_ids=array(select a.id from core.user_role_assignments a join core.profiles p on p.id=a.user_id
  where a.role_id=p_role and (p_include_revoked or a.active)
  order by p.display_name,p.id,a.active desc,case a.scope_type when 'global' then 0 when 'unit' then 1 else 2 end,
   a.created_at desc,a.id limit p_limit offset p_offset);
 return query select * from private.access_assignment_page(v_ids,v_total,v_people);
end $$;

revoke all on function private.governance_page(integer,integer),private.has_user_audience(),private.has_role_audience(),
 private.access_assignment_page(uuid[],bigint,bigint),private.unit_access_covers(uuid,uuid),
 core.user_access_summary(uuid),core.user_access_assignments(uuid,boolean,integer,integer),
 core.unit_access_summary(uuid,uuid),core.unit_access_assignments(uuid,uuid,boolean,integer,integer),
 core.role_impact_summary(uuid),core.role_holders(uuid,boolean,integer,integer) from public,anon;
grant execute on function private.governance_page(integer,integer),private.has_user_audience(),private.has_role_audience(),
 private.access_assignment_page(uuid[],bigint,bigint),private.unit_access_covers(uuid,uuid),
 core.user_access_summary(uuid),core.user_access_assignments(uuid,boolean,integer,integer),
 core.unit_access_summary(uuid,uuid),core.unit_access_assignments(uuid,uuid,boolean,integer,integer),
 core.role_impact_summary(uuid),core.role_holders(uuid,boolean,integer,integer) to authenticated;
commit;
