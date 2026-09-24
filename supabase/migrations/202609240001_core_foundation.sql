begin;
create schema core;
create schema private;
revoke all on schema core, private from public;
grant usage on schema core, private to authenticated;
alter default privileges in schema core revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

create table core.profiles (
 id uuid primary key references auth.users(id),
 display_name text not null check (length(btrim(display_name)) between 1 and 160),
 active boolean not null default true,
 version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table core.units (
 id uuid primary key default gen_random_uuid(), code text not null unique check(length(btrim(code)) between 1 and 40),
 name text not null check(length(btrim(name)) between 1 and 160), active boolean not null default true,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid references core.profiles(id) default auth.uid(), updated_by uuid references core.profiles(id) default auth.uid()
);
create table core.sectors (
 id uuid primary key default gen_random_uuid(), code text not null unique check(length(btrim(code)) between 1 and 40),
 name text not null check(length(btrim(name)) between 1 and 160), active boolean not null default true,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table core.unit_sectors (
 unit_id uuid not null references core.units(id), sector_id uuid not null references core.sectors(id), primary key(unit_id,sector_id)
);
create index unit_sectors_sector on core.unit_sectors(sector_id,unit_id);
create table core.permissions (
 key text primary key, domain text not null, resource text not null, action text not null,
 description text not null, active boolean not null default true
);
create table core.roles (
 id uuid primary key default gen_random_uuid(), key text not null unique check(key ~ '^[a-z][a-z0-9_-]{1,79}$'),
 name text not null check(length(btrim(name)) between 1 and 160), description text not null default '' check(length(description)<=500),
 system boolean not null default false, active boolean not null default true,
 global_only boolean not null default false,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table core.role_permissions (
 role_id uuid not null references core.roles(id), permission_key text not null references core.permissions(key), primary key(role_id,permission_key)
);
create index role_permissions_permission on core.role_permissions(permission_key,role_id);
create table core.user_role_assignments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references core.profiles(id), role_id uuid not null references core.roles(id),
 scope_type text not null check(scope_type in ('global','unit','sector')),
 unit_id uuid references core.units(id), sector_id uuid references core.sectors(id),
 active boolean not null default true, granted_by uuid references core.profiles(id) default auth.uid(),
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(unit_id,sector_id) references core.unit_sectors(unit_id,sector_id),
 check((scope_type='global' and unit_id is null and sector_id is null) or
 (scope_type='unit' and unit_id is not null and sector_id is null) or
 (scope_type='sector' and unit_id is not null and sector_id is not null))
);
create unique index assignment_unique on core.user_role_assignments(user_id,role_id,scope_type,coalesce(unit_id,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(sector_id,'00000000-0000-0000-0000-000000000000'::uuid)) where active;
create index assignments_effective on core.user_role_assignments(user_id,role_id) where active;
create index assignments_unit on core.user_role_assignments(unit_id,sector_id);
create index assignments_role on core.user_role_assignments(role_id);
create table core.system_audit_log (
 id uuid primary key default gen_random_uuid(), occurred_at timestamptz not null default clock_timestamp(),
 actor_user_id uuid references core.profiles(id), module text not null, action text not null,
 entity_type text not null, entity_id text not null, unit_id uuid references core.units(id), sector_id uuid references core.sectors(id),
 before_data jsonb, after_data jsonb, metadata jsonb not null default '{}', correlation_id text
);
create index audit_log_page on core.system_audit_log(occurred_at desc,id desc);
create index audit_log_actor on core.system_audit_log(actor_user_id,occurred_at desc);
create index audit_log_action on core.system_audit_log(module,action,occurred_at desc);

create function private.is_active_user() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from core.profiles where id=auth.uid() and active)
$$;
create function private.has_scoped_permission(p_permission text,p_unit uuid default null,p_sector uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and exists(
 select 1 from core.user_role_assignments a
 join core.roles r on r.id=a.role_id and r.active
 join core.role_permissions rp on rp.role_id=r.id
 join core.permissions p on p.key=rp.permission_key and p.active
 where a.user_id=auth.uid() and a.active and p.key=p_permission and
 (a.scope_type='global' or (a.unit_id=p_unit and (a.scope_type='unit' or (a.scope_type='sector' and a.sector_id=p_sector)))))
$$;
create function private.has_global_permission(p_permission text) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_scoped_permission(p_permission,null,null)
$$;
create function private.has_unit_permission(p_permission text,p_unit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_scoped_permission(p_permission,p_unit,null)
$$;
create function private.owns_role(p_role uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_user() and exists(select 1 from core.user_role_assignments where user_id=auth.uid() and role_id=p_role and active)
$$;
create function private.can_delegate(p_role uuid,p_unit uuid,p_sector uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_global_permission('admin.user.manage') and exists(select 1 from core.roles where id=p_role and active)
 and not exists(select 1 from core.role_permissions rp where rp.role_id=p_role and not private.has_scoped_permission(rp.permission_key,p_unit,p_sector))
$$;
create function private.can_edit_role(p_role uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_global_permission('admin.role.manage') and not exists(
 select 1 from core.role_permissions rp where rp.role_id=p_role and not private.has_global_permission(rp.permission_key))
$$;
create function core.my_access() returns table(permission text,scope_type text,unit_id uuid,sector_id uuid)
language sql stable security definer set search_path='' as $$
 select distinct p.key,a.scope_type,a.unit_id,a.sector_id from core.user_role_assignments a
 join core.roles r on r.id=a.role_id and r.active
 join core.role_permissions rp on rp.role_id=r.id join core.permissions p on p.key=rp.permission_key and p.active
 where a.user_id=auth.uid() and a.active and private.is_active_user()
$$;

-- Explicit grants; only the listed columns can be changed through the Data API.
grant select on all tables in schema core to authenticated;
grant update(active) on core.profiles to authenticated;
grant insert(code,name,active),update(code,name,active) on core.units,core.sectors to authenticated;
grant insert(unit_id,sector_id),delete on core.unit_sectors to authenticated;
grant insert(key,name,description),update(name,description,active) on core.roles to authenticated;
grant insert(user_id,role_id,scope_type,unit_id,sector_id),update(active) on core.user_role_assignments to authenticated;
-- role_permissions is changed only by the transactional role RPC below.
grant execute on function private.is_active_user(),private.has_scoped_permission(text,uuid,uuid),private.has_global_permission(text),private.has_unit_permission(text,uuid),private.owns_role(uuid),private.can_delegate(uuid,uuid,uuid),private.can_edit_role(uuid),core.my_access() to authenticated;

do $$ declare t text; begin
 foreach t in array array['profiles','units','sectors','unit_sectors','permissions','roles','role_permissions','user_role_assignments','system_audit_log'] loop
 execute format('alter table core.%I enable row level security',t);
 end loop;
end $$;
create policy profiles_read on core.profiles for select to authenticated using(private.is_active_user() and (id=auth.uid() or private.has_global_permission('admin.user.read') or private.has_global_permission('admin.user.manage')));
create policy profiles_update on core.profiles for update to authenticated using(id<>auth.uid() and private.has_global_permission('admin.user.manage')) with check(id<>auth.uid() and private.has_global_permission('admin.user.manage'));
create policy units_read on core.units for select to authenticated using(private.has_unit_permission('admin.unit.read',id) or private.has_unit_permission('admin.unit.manage',id) or private.has_global_permission('admin.user.manage') or private.has_global_permission('admin.sector.manage') or private.has_global_permission('admin.sector.read'));
create policy units_create on core.units for insert to authenticated with check(private.has_global_permission('admin.unit.manage'));
create policy units_update on core.units for update to authenticated using(private.has_unit_permission('admin.unit.manage',id)) with check(private.has_unit_permission('admin.unit.manage',id));
-- Sectors are a canonical global catalog; editing them affects every associated unit.
create policy sectors_read on core.sectors for select to authenticated using(private.has_global_permission('admin.sector.read') or private.has_global_permission('admin.sector.manage') or private.has_global_permission('admin.user.manage'));
create policy sectors_create on core.sectors for insert to authenticated with check(private.has_global_permission('admin.sector.manage'));
create policy sectors_update on core.sectors for update to authenticated using(private.has_global_permission('admin.sector.manage')) with check(private.has_global_permission('admin.sector.manage'));
create policy unit_sectors_read on core.unit_sectors for select to authenticated using(private.has_global_permission('admin.sector.read') or private.has_global_permission('admin.sector.manage') or private.has_global_permission('admin.user.manage'));
create policy unit_sectors_create on core.unit_sectors for insert to authenticated with check(private.has_global_permission('admin.sector.manage'));
create policy unit_sectors_delete on core.unit_sectors for delete to authenticated using(private.has_global_permission('admin.sector.manage'));
create policy roles_read on core.roles for select to authenticated using(private.owns_role(id) or private.has_global_permission('admin.role.read') or private.has_global_permission('admin.role.manage') or private.has_global_permission('admin.user.read') or private.has_global_permission('admin.user.manage'));
create policy roles_create on core.roles for insert to authenticated with check(not system and private.has_global_permission('admin.role.manage'));
create policy roles_update on core.roles for update to authenticated using(not system and private.can_edit_role(id)) with check(not system and private.can_edit_role(id));
create policy rp_read on core.role_permissions for select to authenticated using(private.owns_role(role_id) or private.has_global_permission('admin.role.read') or private.has_global_permission('admin.role.manage') or private.has_global_permission('admin.user.manage'));
create policy permissions_read on core.permissions for select to authenticated using(private.has_global_permission('admin.role.read') or private.has_global_permission('admin.role.manage') or private.has_global_permission('admin.user.manage') or exists(select 1 from core.role_permissions rp where rp.permission_key=key and private.owns_role(rp.role_id)));
create policy assignments_read on core.user_role_assignments for select to authenticated using(private.is_active_user() and (user_id=auth.uid() or private.has_global_permission('admin.user.read') or private.has_global_permission('admin.user.manage')));
create policy assignments_create on core.user_role_assignments for insert to authenticated with check(private.can_delegate(role_id,unit_id,sector_id));
create policy assignments_revoke on core.user_role_assignments for update to authenticated using(user_id<>auth.uid() and private.can_delegate(role_id,unit_id,sector_id)) with check(not active and user_id<>auth.uid() and private.can_delegate(role_id,unit_id,sector_id));
create policy logs_read on core.system_audit_log for select to authenticated using(private.has_scoped_permission('admin.audit_log.read',unit_id,sector_id));

create function private.touch_row() returns trigger language plpgsql set search_path='' as $$
begin
 new.updated_at=clock_timestamp(); new.version=old.version+1;
 if tg_table_name='units' then new.updated_by=auth.uid(); end if;
 return new;
end $$;
create function private.record_change() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb; a jsonb; row_data jsonb; event text;
begin
 if tg_op='UPDATE' and new is not distinct from old then return new; end if;
 if tg_op<>'INSERT' then b=to_jsonb(old); end if;
 if tg_op<>'DELETE' then a=to_jsonb(new); end if;
 row_data=coalesce(a,b); event=lower(tg_op);
 if tg_op='UPDATE' and b->'active' is distinct from a->'active' then event=case when (a->>'active')::boolean then 'activate' else 'deactivate' end; end if;
 if tg_table_name='user_role_assignments' then event=case when (a->>'active')::boolean then 'grant' else 'revoke' end; end if;
 insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,unit_id,sector_id,before_data,after_data)
 values(auth.uid(),'core',event,tg_table_name,coalesce(row_data->>'id',concat_ws(':',row_data->>'role_id',row_data->>'permission_key',row_data->>'unit_id',row_data->>'sector_id')),
 case when tg_table_name='units' then (row_data->>'id')::uuid else (row_data->>'unit_id')::uuid end,
 case when tg_table_name='sectors' then (row_data->>'id')::uuid else (row_data->>'sector_id')::uuid end,b,a);
 return coalesce(new,old);
end $$;
create function private.validate_assignment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Serialize role composition changes with new assignments.
 perform 1 from core.roles where id=new.role_id for share;
 if new.active then
 -- A fresh statement snapshot after the role lock prevents stale delegation
 -- if save_role committed a permission change while this grant was waiting.
 if auth.uid() is not null and not private.can_delegate(new.role_id,new.unit_id,new.sector_id) then raise exception 'Cannot delegate permission' using errcode='42501'; end if;
 perform 1 from core.profiles where id=new.user_id for share;
 if new.unit_id is not null then perform 1 from core.units where id=new.unit_id for share; end if;
 if new.sector_id is not null then perform 1 from core.sectors where id=new.sector_id for share; end if;
 if not exists(select 1 from core.profiles where id=new.user_id and active) then raise exception 'Inactive profile' using errcode='23514'; end if;
 if not exists(select 1 from core.roles where id=new.role_id and active and (not global_only or new.scope_type='global')) then raise exception 'Invalid role or scope' using errcode='23514'; end if;
 if new.unit_id is not null and not exists(select 1 from core.units where id=new.unit_id and active) then raise exception 'Inactive unit' using errcode='23514'; end if;
 if new.sector_id is not null and not exists(select 1 from core.sectors where id=new.sector_id and active) then raise exception 'Inactive sector' using errcode='23514'; end if;
 end if;
 return new;
end $$;
create trigger validate_assignment before insert or update on core.user_role_assignments for each row execute function private.validate_assignment();
create function private.validate_unit_sector() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from core.units where id=new.unit_id and active for share;
 if not found then raise exception 'Inactive unit' using errcode='23514'; end if;
 perform 1 from core.sectors where id=new.sector_id and active for share;
 if not found then raise exception 'Inactive sector' using errcode='23514'; end if;
 return new;
end $$;
create trigger validate_unit_sector before insert on core.unit_sectors for each row execute function private.validate_unit_sector();
create function private.revoke_deactivated_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.active and not new.active then update core.user_role_assignments set active=false where user_id=new.id and active; end if;
 return new;
end $$;
create trigger revoke_deactivated_user after update of active on core.profiles for each row execute function private.revoke_deactivated_user();
create function private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into core.profiles(id,display_name) values(new.id,coalesce(nullif(left(btrim(new.raw_user_meta_data->>'display_name'),160),''),'Novo usuário'));
 return new;
end $$;
create trigger create_core_profile after insert on auth.users for each row execute function private.create_profile();
-- Safe adoption of identities already present in a fresh development Auth database.
insert into core.profiles(id,display_name) select id,coalesce(nullif(left(btrim(raw_user_meta_data->>'display_name'),160),''),'Novo usuário') from auth.users on conflict(id) do nothing;

do $$ declare t text; begin
 foreach t in array array['profiles','units','sectors','roles','user_role_assignments'] loop
 execute format('create trigger touch_row before update on core.%I for each row execute function private.touch_row()',t);
 end loop;
 foreach t in array array['profiles','units','sectors','roles','role_permissions','user_role_assignments','unit_sectors'] loop
 execute format('create trigger record_change after insert or update or delete on core.%I for each row execute function private.record_change()',t);
 end loop;
end $$;

-- An atomic role editor prevents partial permission replacement and lost updates.
create function core.save_role(p_id uuid,p_version integer,p_key text,p_name text,p_description text,p_permissions text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; r core.roles;
begin
 if not private.has_global_permission('admin.role.manage') then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_permissions is null then raise exception 'Permissions required' using errcode='23514'; end if;
 if exists(select 1 from unnest(p_permissions) k where not private.has_global_permission(k)) then raise exception 'Cannot delegate permission' using errcode='42501'; end if;
 if p_id is null then
 insert into core.roles(key,name,description) values(p_key,p_name,p_description) returning id into result;
 else
 select * into r from core.roles where id=p_id for update;
 if not found or r.system or not private.can_edit_role(p_id) then raise exception 'Forbidden' using errcode='42501'; end if;
 if r.version is distinct from p_version then raise exception 'Concurrent change' using errcode='40001'; end if;
 result=p_id;
 update core.roles set name=p_name,description=p_description where id=result;
 end if;
 delete from core.role_permissions where role_id=result and not(permission_key=any(p_permissions));
 insert into core.role_permissions(role_id,permission_key) select result,k from (select distinct unnest(p_permissions) k) x on conflict do nothing;
 return result;
end $$;
create function core.role_detail(p_id uuid) returns table(role jsonb,permission_keys text[])
language sql stable security invoker set search_path='' as $$
 select to_jsonb(r),array(select rp.permission_key from core.role_permissions rp where rp.role_id=r.id order by rp.permission_key)
 from core.roles r where r.id=p_id
$$;
-- Schema-local default revokes do not cancel PostgreSQL's global PUBLIC default.
revoke all on all functions in schema core,private from public,anon,authenticated;
grant execute on function private.is_active_user(),private.has_scoped_permission(text,uuid,uuid),private.has_global_permission(text),private.has_unit_permission(text,uuid),private.owns_role(uuid),private.can_delegate(uuid,uuid,uuid),private.can_edit_role(uuid),core.my_access(),core.role_detail(uuid),core.save_role(uuid,integer,text,text,text,text[]) to authenticated;
commit;
