begin;

-- Adoção explícita. O deploy desta migration sozinho preserva o ingresso legado.
create table private.identity_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into private.identity_settings default values;

create table private.identity_credentials (
  user_id uuid primary key,
  generation bigint not null default 1 check (generation > 0),
  managed boolean not null default true,
  state text not null check (state in ('active', 'temporary', 'quarantined')),
  operation_id uuid
);

create table private.identity_admissions (
  session_id uuid primary key,
  user_id uuid not null references private.identity_credentials(user_id) on delete cascade,
  generation bigint not null,
  purpose text not null check (purpose in ('application', 'password_change'))
);
create index identity_admissions_user on private.identity_admissions(user_id);

-- A autoridade de identidade é global e concedida explicitamente por operação.
create table private.identity_operators (
  user_id uuid references core.profiles(id) primary key,
  provision boolean not null default false,
  reset_password boolean not null default false
);

create table private.identity_operations (
  id uuid primary key,
  actor_id uuid not null,
  actor_session uuid not null,
  target_id uuid not null,
  verb text not null check (verb in ('create', 'reset', 'change')),
  generation bigint not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'complete', 'rejected')),
  profile_name text,
  email text,
  role_id uuid,
  unit_id uuid,
  sector_id uuid,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index identity_operation_open
  on private.identity_operations(target_id) where status = 'in_progress';
create unique index identity_operation_open_email
  on private.identity_operations(email) where verb = 'create' and status = 'in_progress';

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'identity_settings', 'identity_credentials', 'identity_admissions',
    'identity_operators', 'identity_operations'
  ] loop
    execute format('revoke all on private.%I from public, anon, authenticated', table_name);
    execute format('alter table private.%I enable row level security', table_name);
  end loop;
end
$$;

create function private.identity_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled from private.identity_settings where singleton), false)
$$;

create function private.identity_live_session(p_user uuid, p_session uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1 from auth.sessions s
    where s.id = p_session and s.user_id = p_user
      and (s.not_after is null or s.not_after > statement_timestamp())
  );
end
$$;

create function private.identity_session_purpose(p_user uuid, p_session uuid) returns text
language sql stable security definer set search_path = '' as $$
  select a.purpose
  from private.identity_admissions a
  join private.identity_credentials c on c.user_id = a.user_id and c.generation = a.generation
  join core.profiles p on p.id = a.user_id and p.active
  where a.session_id = p_session and a.user_id = p_user
    and case a.purpose when 'application' then c.state = 'active' else c.state = 'temporary' end
    and private.identity_live_session(p_user, p_session)
$$;

create function private.identity_request_allowed() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_claims jsonb;
  v_session text;
begin
  if not private.identity_enabled() then
    return not exists (select 1 from private.identity_credentials where user_id = auth.uid() and managed);
  end if;
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_session := v_claims->>'session_id';
  if v_claims->>'is_anonymous' = 'true' or v_session is null
      or v_session !~ '^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$' then
    return false;
  end if;
  return coalesce(private.identity_session_purpose(auth.uid(), v_session::uuid) = 'application', false);
end
$$;

create or replace function private.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from core.profiles where id = auth.uid() and active)
    and private.identity_request_allowed()
$$;

-- Configurado como db-pre-request no PostgREST do DEV quando o ingresso estiver completo.
-- O lock compartilhado dura até o fim da transação, inclusive em leituras.
create function private.identity_lock(p_user uuid, p_shared boolean) returns void
language plpgsql set search_path = '' as $$
declare lock_id bigint := hashtextextended('gg05b:' || p_user::text, 0);
begin
  if p_shared then
    perform pg_advisory_xact_lock_shared(lock_id);
  else
    perform pg_advisory_xact_lock(lock_id);
  end if;
end
$$;

create function public.identity_pre_request() returns void
language plpgsql security definer set search_path = '' as $$
declare v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if v_claims->>'role' is distinct from 'authenticated' then return; end if;
  if private.identity_enabled() then perform private.identity_lock(auth.uid(), true); end if;
  if not private.identity_request_allowed() then
    raise exception 'Sessão sem acesso aos módulos' using errcode = '42501';
  end if;
end
$$;

revoke all on function public.identity_pre_request() from public, anon, authenticated;
grant execute on function public.identity_pre_request() to anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.identity_pre_request() to service_role;
  end if;
end
$$;

create function private.identity_storage_allowed() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if private.identity_enabled() then perform private.identity_lock(auth.uid(), true); end if;
  return private.identity_request_allowed();
end
$$;

-- O gateway fecha as variantes por assinatura; o Storage reavalia os JWTs próprios.
create policy identity_objects_admitted on storage.objects as restrictive
  for all to authenticated
  using ((select private.identity_storage_allowed()))
  with check ((select private.identity_storage_allowed()));
grant execute on function private.identity_storage_allowed() to authenticated;

create function private.identity_invalidate_deactivated() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.active and not new.active and private.identity_enabled() then
    perform private.identity_lock(new.id, false);
    update private.identity_credentials set generation = generation + 1 where user_id = new.id;
    delete from private.identity_admissions where user_id = new.id;
  end if;
  return new;
end
$$;
create trigger identity_invalidate_deactivated after update of active on core.profiles
  for each row execute function private.identity_invalidate_deactivated();

create function private.identity_login_state(p_email text)
returns table(user_id uuid, generation bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.identity_enabled() then return; end if;
  return query
    select u.id, c.generation
    from auth.users u
    join private.identity_credentials c on c.user_id = u.id
    join core.profiles p on p.id = u.id and p.active
    where lower(u.email) = p_email and u.email_confirmed_at is not null
      and c.state in ('active', 'temporary');
end
$$;

create function private.identity_admit(p_user uuid, p_session uuid, p_generation bigint)
returns text language plpgsql security definer set search_path = '' as $$
declare v_purpose text;
begin
  perform private.identity_lock(p_user, true);
  if not private.identity_enabled() or not private.identity_live_session(p_user, p_session) then
    return null;
  end if;
  select case c.state when 'active' then 'application' when 'temporary' then 'password_change' end
    into v_purpose
    from private.identity_credentials c
    join core.profiles p on p.id = c.user_id and p.active
    where c.user_id = p_user and c.generation = p_generation;
  if v_purpose is null then return null; end if;
  -- GoTrue pode reutilizar a sessão? Uma admissão existente jamais muda de finalidade.
  insert into private.identity_admissions values (p_session, p_user, p_generation, v_purpose)
    on conflict do nothing;
  return private.identity_session_purpose(p_user, p_session);
end
$$;

create function private.identity_protected(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.identity_operators where user_id = p_user)
    or exists (
      select 1 from core.user_role_assignments a
      join core.roles r on r.id = a.role_id
      where a.user_id = p_user
        and (r.key = 'platform_administrator' or exists (
          select 1 from core.role_permissions rp
          where rp.role_id = r.id and rp.permission_key like 'admin.%'
        ))
    )
$$;

create function private.identity_actor(p_actor uuid,p_session uuid,p_verb text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.identity_enabled() or
      private.identity_session_purpose(p_actor,p_session) is distinct from 'application' then
    return false;
  end if;
  perform 1 from core.profiles where id = p_actor and active for share;
  if not found then return false; end if;
  perform 1 from core.user_role_assignments a join core.roles r on r.id = a.role_id
    where a.user_id = p_actor and a.active and r.active
    order by r.id for share of a,r;
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', p_actor, 'session_id', p_session, 'role', 'authenticated')::text, true);
  return private.has_global_permission('admin.user.manage') and exists (
    select 1 from private.identity_operators where user_id = p_actor
      and case p_verb when 'create' then provision when 'reset' then reset_password else false end
  );
end
$$;

create function private.identity_can_assign(p_role uuid,p_unit uuid,p_sector uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_role is null then return p_unit is null and p_sector is null; end if;
  perform 1 from core.roles where id = p_role and active and not global_only
    and key <> 'platform_administrator' for share;
  if not found or p_unit is null then return false; end if;
  return private.can_delegate(p_role,p_unit,p_sector)
    and not exists (select 1 from core.role_permissions where role_id = p_role and permission_key like 'admin.%')
    and exists (select 1 from core.units where id = p_unit and active)
    and (p_sector is null or exists (
      select 1 from core.unit_sectors us join core.sectors s on s.id = us.sector_id and s.active
      where us.unit_id = p_unit and us.sector_id = p_sector
    ));
end
$$;

create function private.identity_begin(
  p_actor uuid,p_session uuid,p_operation uuid,p_target uuid,p_verb text,p_version integer,
  p_email text,p_name text,p_role uuid,p_unit uuid,p_sector uuid
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_generation bigint;
begin
  if not private.identity_enabled() then return false; end if;
  perform private.identity_lock(p_target, false);
  if p_verb = 'change' then
    if p_actor <> p_target or
        private.identity_session_purpose(p_actor,p_session) is distinct from 'password_change' then
      return false;
    end if;
  elsif not private.identity_actor(p_actor,p_session,p_verb) then
    return false;
  end if;

  if p_verb = 'create' then
    if not private.identity_can_assign(p_role,p_unit,p_sector) or exists (
      select 1 from core.profiles where id = p_target
    ) or exists (
      select 1 from auth.users where lower(email) = p_email
    ) then return false; end if;
    insert into private.identity_credentials(user_id,state) values (p_target,'quarantined')
      returning generation into v_generation;
  else
    -- A atualização existente de atribuições trava o mesmo perfil.
    perform 1 from core.profiles where id = p_target and active
      and (p_verb = 'change' or version = p_version) for update;
    if not found then return false; end if;
    if p_verb = 'reset' and (p_actor = p_target or private.identity_protected(p_target)) then
      return false;
    end if;
    update private.identity_credentials
      set state = 'quarantined', generation = generation + 1, operation_id = p_operation, managed = true
      where user_id = p_target and operation_id is null and state <> 'quarantined'
      returning generation into v_generation;
    if not found then return false; end if;
    delete from private.identity_admissions where user_id = p_target;
  end if;

  insert into private.identity_operations(
    id,actor_id,actor_session,target_id,verb,generation,email,profile_name,role_id,unit_id,sector_id
  ) values (p_operation,p_actor,p_session,p_target,p_verb,v_generation,p_email,p_name,p_role,p_unit,p_sector);
  update private.identity_credentials set operation_id = p_operation where user_id = p_target;
  insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,correlation_id)
    values (p_actor,'core','identity_' || p_verb || '_started','identity',p_target::text,p_operation::text);
  return true;
end
$$;

create function private.identity_finish(
  p_actor uuid,p_session uuid,p_operation uuid,p_target uuid,p_confirmed boolean
) returns boolean language plpgsql security definer set search_path = '' as $$
declare op private.identity_operations;
begin
  if not private.identity_enabled() then return false; end if;
  perform private.identity_lock(p_target, false);
  select * into op from private.identity_operations
    where id = p_operation and actor_id = p_actor and actor_session = p_session
      and target_id = p_target and status = 'in_progress';
  if not found then return false; end if;
  perform 1 from core.profiles where id = p_target and active for update;
  if not found then return false; end if;
  if not exists (
    select 1 from private.identity_credentials
    where user_id = p_target and generation = op.generation and operation_id = p_operation
      and state = 'quarantined'
  ) then return false; end if;
  if op.verb = 'change' then
    if p_actor <> p_target or not private.identity_live_session(p_actor,p_session) then return false; end if;
    if not p_confirmed then
      update private.identity_credentials set state = 'temporary', operation_id = null where user_id = p_target;
      insert into private.identity_admissions values (p_session,p_target,op.generation,'password_change');
      update private.identity_operations set status = 'rejected', completed_at = now() where id = p_operation;
      insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,correlation_id)
        values (p_actor,'core','identity_change_rejected','identity',p_target::text,p_operation::text);
      return true;
    end if;
  elsif not p_confirmed or not private.identity_actor(p_actor,p_session,op.verb) then
    return false;
  end if;

  if op.verb = 'create' then
    if not exists (
      select 1 from auth.users where id = p_target and lower(email) = op.email and email_confirmed_at is not null
    ) or private.identity_protected(p_target) or exists (
      select 1 from core.user_role_assignments where user_id = p_target
    ) then return false; end if;

    if not private.identity_can_assign(op.role_id,op.unit_id,op.sector_id) then return false; end if;
    update core.profiles set display_name = op.profile_name where id = p_target;
    if op.role_id is not null then
      insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id)
        values (p_target,op.role_id,case when op.sector_id is null then 'unit' else 'sector' end,op.unit_id,op.sector_id);
    end if;
  elsif op.verb = 'reset' and private.identity_protected(p_target) then
    return false;
  end if;

  update private.identity_credentials
    set state = case op.verb when 'change' then 'active' else 'temporary' end,
      generation = generation + 1, operation_id = null
    where user_id = p_target;
  update private.identity_operations
    set status = 'complete', completed_at = now(), email = null, profile_name = null
    where id = p_operation;
  insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,correlation_id)
    values (p_actor,'core','identity_' || op.verb || '_complete','identity',p_target::text,p_operation::text);
  return true;
end
$$;

-- A instalação não atribui credenciais SQL nem capacidades a usuários existentes.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'gg_identity') then
    create role gg_identity nologin noinherit;
  else
    raise exception 'Role gg_identity já existe. Confira a custódia antes de aplicar a migration.';
  end if;
end
$$;
revoke all on function
  private.identity_enabled(), private.identity_live_session(uuid,uuid),
  private.identity_session_purpose(uuid,uuid), private.identity_request_allowed(),
  private.identity_lock(uuid,boolean), private.identity_storage_allowed(),
  private.identity_invalidate_deactivated(), private.identity_login_state(text),
  private.identity_admit(uuid,uuid,bigint), private.identity_protected(uuid),
  private.identity_actor(uuid,uuid,text), private.identity_can_assign(uuid,uuid,uuid),
  private.identity_begin(uuid,uuid,uuid,uuid,text,integer,text,text,uuid,uuid,uuid),
  private.identity_finish(uuid,uuid,uuid,uuid,boolean)
from public, anon;
revoke all on function
  private.identity_enabled(), private.identity_live_session(uuid,uuid),
  private.identity_session_purpose(uuid,uuid), private.identity_request_allowed(),
  private.identity_lock(uuid,boolean), private.identity_invalidate_deactivated(),
  private.identity_login_state(text), private.identity_admit(uuid,uuid,bigint),
  private.identity_protected(uuid), private.identity_actor(uuid,uuid,text),
  private.identity_can_assign(uuid,uuid,uuid),
  private.identity_begin(uuid,uuid,uuid,uuid,text,integer,text,text,uuid,uuid,uuid),
  private.identity_finish(uuid,uuid,uuid,uuid,boolean)
from authenticated;

grant usage on schema private to gg_identity;
grant execute on function private.identity_enabled(),
  private.identity_login_state(text),private.identity_admit(uuid,uuid,bigint),
  private.identity_session_purpose(uuid,uuid),private.identity_actor(uuid,uuid,text),
  private.identity_begin(uuid,uuid,uuid,uuid,text,integer,text,text,uuid,uuid,uuid),
  private.identity_finish(uuid,uuid,uuid,uuid,boolean)
to gg_identity;

commit;
