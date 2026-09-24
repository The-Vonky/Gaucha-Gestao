begin;
-- Revoking requires authority over the permissions the assignment carries, but not an
-- active role: assignments of a deactivated role must remain revocable.
create function private.can_revoke(p_role uuid,p_unit uuid,p_sector uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_global_permission('admin.user.manage') and not exists(
 select 1 from core.role_permissions rp join core.permissions p on p.key=rp.permission_key and p.active
 where rp.role_id=p_role and not private.has_scoped_permission(rp.permission_key,p_unit,p_sector))
$$;
-- Deactivation removes all access and revokes every assignment through a SECURITY DEFINER
-- trigger, so it requires the same authority as revoking each active assignment directly.
create function private.can_manage_profile(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user<>auth.uid() and private.has_global_permission('admin.user.manage') and not exists(
 select 1 from core.user_role_assignments a where a.user_id=p_user and a.active and not private.can_revoke(a.role_id,a.unit_id,a.sector_id))
$$;
revoke all on function private.can_revoke(uuid,uuid,uuid),private.can_manage_profile(uuid) from public,anon;
grant execute on function private.can_revoke(uuid,uuid,uuid),private.can_manage_profile(uuid) to authenticated;
alter policy profiles_update on core.profiles using(private.can_manage_profile(id)) with check(private.can_manage_profile(id));
alter policy assignments_revoke on core.user_role_assignments using(user_id<>auth.uid() and private.can_revoke(role_id,unit_id,sector_id))
 with check(not active and user_id<>auth.uid() and private.can_revoke(role_id,unit_id,sector_id));
commit;
