begin;
-- Core Reference Resolvers v1. Additive: no table, column, policy or existing function changes.
-- Read-only contracts that resolve already-known Core UUIDs into a minimal label projection.
-- They are not directories: there is no search, listing or paging, input is a bounded batch of
-- UUIDs and only references the caller is already entitled to see are returned. A missing or
-- invisible reference is simply absent from the result, so the answer is the same
-- for an unknown UUID and for one the caller may not see. Inactive references are returned with
-- active=false for historical reading; eligibility for new use is the consumer's own check.
-- No e-mail, Auth data, timestamps, roles or permissions leave these functions.
-- This is reference metadata visibility only: resolving a label never authorizes reading or
-- operating a business record, the administrative catalogs or another module. Consumers keep
-- verifying their own permission, resource scope and domain rules.

-- Shared input contract of the definer resolvers: active caller, explicit batch bound,
-- duplicates and nulls ignored.
create function private.reference_batch(p_ids uuid[]) returns uuid[]
language plpgsql stable set search_path='' as $$
begin
 if not private.is_active_user() then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_ids is null or cardinality(p_ids)>100 then
 raise exception 'Between 0 and 100 references per call' using errcode='22023'; end if;
 return array(select distinct x from unnest(p_ids) x where x is not null);
end $$;

-- Users: SECURITY INVOKER, so visibility is exactly profiles_read (own profile, or a global
-- admin.user.read/manage grant). No business-user directory is approved (PO-02); business
-- modules resolve actors of their own authorized records through their own projections.
-- The guard is repeated here so the private helper needs no client EXECUTE grant.
create function core.profile_references(p_ids uuid[])
returns table(id uuid,display_name text,active boolean)
language plpgsql stable security invoker set search_path='' as $$
begin
 if not private.is_active_user() then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_ids is null or cardinality(p_ids)>100 then
 raise exception 'Between 0 and 100 references per call' using errcode='22023'; end if;
 return query select p.id,p.display_name,p.active from core.profiles p
 where p.id=any(p_ids) order by p.id;
end $$;

-- Units, sectors and unit/sector pairs: visible when covered by one of the caller's effective
-- scopes, exactly the scopes core.my_access() already discloses (active assignment, role and
-- permission). Every administrative RLS reader of these catalogs is covered by its own grant.
-- Ordinary members cannot read the catalogs, so this needs SECURITY DEFINER with the predicate
-- applied explicitly per row. A global scope covers every target, as in
-- private.has_scoped_permission; a sector grant labels its own unit, sector and pair only.
create function private.can_resolve_unit(p_unit uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from core.my_access() m where m.scope_type='global' or m.unit_id=p_unit)
$$;
create function private.can_resolve_sector(p_sector uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from core.my_access() m where m.scope_type='global' or m.sector_id=p_sector
 or (m.scope_type='unit' and exists(select 1 from core.unit_sectors us where us.unit_id=m.unit_id and us.sector_id=p_sector)))
$$;
create function private.can_resolve_unit_sector(p_unit uuid,p_sector uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from core.my_access() m where m.scope_type='global'
 or (m.unit_id=p_unit and (m.scope_type='unit' or m.sector_id=p_sector)))
$$;

create function core.unit_references(p_ids uuid[])
returns table(id uuid,code text,name text,active boolean)
language plpgsql stable security definer set search_path='' as $$
declare ids uuid[]=private.reference_batch(p_ids);
begin
 return query select u.id,u.code,u.name,u.active from core.units u
 where u.id=any(ids) and private.can_resolve_unit(u.id) order by u.id;
end $$;

create function core.sector_references(p_ids uuid[])
returns table(id uuid,code text,name text,active boolean)
language plpgsql stable security definer set search_path='' as $$
declare ids uuid[]=private.reference_batch(p_ids);
begin
 return query select s.id,s.code,s.name,s.active from core.sectors s
 where s.id=any(ids) and private.can_resolve_sector(s.id) order by s.id;
end $$;

-- Pair validity: p_units[i] with p_sectors[i]. Only existing links are returned; an absent pair
-- is either not linked or not visible. A link has no lifecycle of its own (PO-07): new use
-- also requires both sides active, which is reported, not filtered, for historical reading.
create function core.unit_sector_references(p_units uuid[],p_sectors uuid[])
returns table(unit_id uuid,sector_id uuid,unit_active boolean,sector_active boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.reference_batch(p_units);
 if p_sectors is null or cardinality(p_sectors)<>cardinality(p_units) then
 raise exception 'Units and sectors must be paired' using errcode='22023'; end if;
 return query select distinct us.unit_id,us.sector_id,u.active,s.active
 from unnest(p_units,p_sectors) q(unit_id,sector_id)
 join core.unit_sectors us on us.unit_id=q.unit_id and us.sector_id=q.sector_id
 join core.units u on u.id=us.unit_id join core.sectors s on s.id=us.sector_id
 where private.can_resolve_unit_sector(us.unit_id,us.sector_id)
 order by us.unit_id,us.sector_id;
end $$;

revoke all on function private.reference_batch(uuid[]),private.can_resolve_unit(uuid),private.can_resolve_sector(uuid),
private.can_resolve_unit_sector(uuid,uuid),core.profile_references(uuid[]),core.unit_references(uuid[]),
core.sector_references(uuid[]),core.unit_sector_references(uuid[],uuid[]) from public,anon,authenticated;
-- Only the four resolvers are callable; every private helper stays without client EXECUTE.
grant execute on function core.profile_references(uuid[]),core.unit_references(uuid[]),
core.sector_references(uuid[]),core.unit_sector_references(uuid[],uuid[]) to authenticated;
commit;
