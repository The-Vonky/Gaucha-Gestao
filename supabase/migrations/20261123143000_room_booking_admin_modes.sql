begin;

-- D5-C (23/11/2026): administrador global pode operar o Agendamento,
-- sem transformar os papéis de solicitante/gestor em privilégios administrativos.
-- A migration D5-B permanece histórica e intacta.
do $$
begin
  if (select count(*) from core.roles where key = 'platform_administrator' and active) <> 1
     or (select count(*) from core.roles where key = 'room_booking_manager' and active and global_only) <> 1
     or (select count(*) from core.roles where key = 'room_booking_requester' and active and global_only) <> 1
     or not exists (select 1 from core.permissions where key = 'room_booking.manage' and active) then
    raise exception 'Catálogo Room Booking/Core inesperado; revisar antes de aplicar D5-C';
  end if;
end
$$;

-- Autorização formal de gestão para o administrador; nenhuma atribuição de
-- gestor é criada automaticamente e nenhum privilégio é concedido à secretária.
insert into core.role_permissions(role_id, permission_key)
select id, 'room_booking.manage' from core.roles where key = 'platform_administrator'
on conflict do nothing;

-- Remove somente o veto D5-B contra o administrador. Gestor comum continua
-- exigindo atribuição global ativa e a relação de permissão no catálogo.
create or replace function private.permission_assignment_allowed(p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_permission <> 'room_booking.manage' or exists (
    select 1 from core.user_role_assignments a
    join core.roles r on r.id = a.role_id and r.active
    where a.user_id = auth.uid() and a.active and a.scope_type = 'global'
      and r.key in ('platform_administrator', 'room_booking_manager')
  )
$$;

-- GG-05B: a admissão de novos funcionários aceita somente os dois papéis
-- globais do Agendamento, sem unidade/setor. Todos os demais papéis
-- global_only (inclusive administrador) continuam vetados à criação.
create or replace function private.identity_can_assign(p_role uuid, p_unit uuid, p_sector uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_role core.roles%rowtype;
begin
  if p_role is null then return p_unit is null and p_sector is null; end if;

  select * into v_role from core.roles where id = p_role and active for share;
  if not found or v_role.key = 'platform_administrator'
     or exists (select 1 from core.role_permissions
                where role_id = p_role and permission_key like 'admin.%') then
    return false;
  end if;

  if v_role.global_only then
    return v_role.key in ('room_booking_manager', 'room_booking_requester')
      and p_unit is null and p_sector is null
      and private.can_delegate(p_role, null, null);
  end if;

  if p_unit is null or not private.can_delegate(p_role, p_unit, p_sector) then
    return false;
  end if;
  return exists (select 1 from core.units where id = p_unit and active)
    and (p_sector is null or exists (
      select 1 from core.unit_sectors us
      join core.sectors s on s.id = us.sector_id and s.active
      where us.unit_id = p_unit and us.sector_id = p_sector
    ));
end
$$;

-- O fechamento do cadastro GG-05B deve persistir os novos papéis sem
-- unidade como atribuições globais. Preserva todo o restante do ciclo de senhas,
-- admissão, bloqueio, auditoria e reconciliação da implementação anterior.
create or replace function private.identity_finish(
  p_actor uuid,p_session uuid,p_operation uuid,p_target uuid,p_confirmed boolean
) returns boolean language plpgsql security definer set search_path = '' as $
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
        values (p_target,op.role_id,case when op.unit_id is null then 'global' when op.sector_id is null then 'unit' else 'sector' end,op.unit_id,op.sector_id);
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
$;


-- Projeção da identidade de administrador, não uma concessão de acesso.
-- O navegador usa a resposta apenas para mostrar o seletor de visualização.
create function public.room_booking_admin_context() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_active_user() and exists (
    select 1 from core.user_role_assignments a
    join core.roles r on r.id = a.role_id and r.active
    where a.user_id = auth.uid() and a.active and a.scope_type = 'global'
      and r.key = 'platform_administrator'
  )
$$;
revoke all on function public.room_booking_admin_context() from public, anon, authenticated;
grant execute on function public.room_booking_admin_context() to authenticated;

notify pgrst, 'reload schema';
commit;
