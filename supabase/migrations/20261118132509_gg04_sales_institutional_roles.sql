-- GG-04: substitui o papel institucional de operação pelo perfil de consulta.
-- Os triggers do Core registram as alterações no catálogo e em suas relações.
do $$
declare
  operator_id uuid;
  manager_id uuid;
  viewer_id uuid;
  viewer_permissions constant text[] := array[
    'sales.entry.read', 'sales.dashboard.read', 'sales.export.filtered', 'sales.export.full'
  ];
  manager_permissions constant text[] := viewer_permissions || array[
    'sales.entry.create', 'sales.entry.edit', 'sales.entry.delete'
  ];
begin
  lock table core.roles, core.role_permissions in share row exclusive mode;

  select id into manager_id from core.roles
  where key = 'sales_manager' and name = 'Sales Manager' and system and active and not global_only;

  if manager_id is null
    or (select count(*) from core.permissions where active and key = any(manager_permissions)) <> 7
    or (select count(*) from core.role_permissions
        where role_id = manager_id and permission_key = any(manager_permissions)) <> 7
    or exists (select 1 from core.role_permissions
               where role_id = manager_id and not (permission_key = any(manager_permissions))) then
    raise exception 'GG-04: composição do Sales Manager divergente';
  end if;

  select id into operator_id from core.roles where key = 'sales_operator' for update;

  if operator_id is not null then
    if not (select system from core.roles where id = operator_id)
      or exists (select 1 from core.role_permissions
                 where role_id = operator_id and permission_key not in ('sales.entry.read', 'sales.entry.create')) then
      raise exception 'GG-04: papel sales_operator ou permissões divergentes';
    end if;

    -- A vinculação, inclusive revogada, exige decisão própria de preservação.
    if exists (select 1 from core.user_role_assignments where role_id = operator_id) then
      raise exception 'GG-04: sales_operator possui atribuições; verificar acesso e histórico antes de remover';
    end if;

    if exists (
      select 1 from pg_constraint
      where contype = 'f' and confrelid in ('core.roles'::regclass, 'core.role_permissions'::regclass)
        and not (
          confrelid = 'core.roles'::regclass and confdeltype = 'a'
          and (conrelid, conname) in (
            ('core.role_permissions'::regclass, 'role_permissions_role_id_fkey'),
            ('core.user_role_assignments'::regclass, 'user_role_assignments_role_id_fkey')
          )
        )
    ) then
      raise exception 'GG-04: chave estrangeira inesperada no catálogo de papéis; revisar dependências';
    end if;
  end if;

  insert into core.roles(key, name, description, system, global_only)
  values (
    'sales_viewer', 'Sales Viewer',
    'Consulta de lançamentos, dashboard e exportações de Vendas / Maquininhas no escopo atribuído.',
    true, false
  ) on conflict (key) do nothing;

  select id into viewer_id from core.roles
  where key = 'sales_viewer' and name = 'Sales Viewer' and system and active and not global_only;

  if viewer_id is null or exists (
    select 1 from core.role_permissions
    where role_id = viewer_id and not (permission_key = any(viewer_permissions))
  ) then
    raise exception 'GG-04: colisão ou composição divergente no Sales Viewer';
  end if;

  insert into core.role_permissions(role_id, permission_key)
  select viewer_id, permission_key from unnest(viewer_permissions) as p(permission_key)
  on conflict (role_id, permission_key) do nothing;

  if operator_id is not null then
    delete from core.role_permissions where role_id = operator_id;
    delete from core.roles where id = operator_id;
  end if;
end;
$$;
