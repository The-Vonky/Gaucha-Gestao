begin;
-- User directory for Administration. Additive: no table, column or existing policy changes.
-- The e-mail and the last sign-in live in Supabase Auth (auth.users), which the Data API does
-- not expose. This read-only function returns them, with the Core profile, only to active
-- users holding a global admin.user.read or admin.user.manage grant: the same audience that
-- already reads every profile through profiles_read. Nothing else from auth.users leaves it.
create function core.user_directory(p_search text default '',p_inactive boolean default false)
returns table(id uuid,display_name text,active boolean,version integer,created_at timestamptz,
 updated_at timestamptz,email text,last_sign_in_at timestamptz)
language sql stable security definer set search_path='' as $$
 select p.id,p.display_name,p.active,p.version,p.created_at,p.updated_at,u.email::text,u.last_sign_in_at
 from core.profiles p join auth.users u on u.id=p.id
 where private.is_active_user()
  and (private.has_global_permission('admin.user.read') or private.has_global_permission('admin.user.manage'))
  and (p_inactive or p.active)
  -- Name or e-mail; LIKE wildcards typed by the user are matched literally.
  and (coalesce(btrim(p_search),'')='' or (
   select p.display_name ilike q or u.email::text ilike q
   from (select '%'||replace(replace(replace(left(btrim(p_search),160),'\','\\'),'%','\%'),'_','\_')||'%' as q) s))
 order by p.display_name,p.id
$$;
revoke all on function core.user_directory(text,boolean) from public,anon;
grant execute on function core.user_directory(text,boolean) to authenticated;

-- Renaming a user: the display name joins `active` as an updatable column. profiles_update
-- (private.can_manage_profile) still decides who may change a profile: a global
-- admin.user.manage holder with authority over the target's assignments, never on themself.
-- core.record_change already logs the before/after values of every profile update.
grant update(display_name) on core.profiles to authenticated;
commit;
