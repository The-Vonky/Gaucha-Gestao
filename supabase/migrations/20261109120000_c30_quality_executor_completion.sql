begin;

-- Permissão exclusiva para concluir ou reabrir planos.
insert into core.permissions(key,domain,resource,action,description)
values (
  'action_plan.complete','action_plan','plan','complete',
  'Concluir ou reabrir planos de ação'
)
on conflict (key) do nothing;

-- Preservar a capacidade de conclusão dos perfis existentes.
insert into core.role_permissions(role_id,permission_key)
select id,'action_plan.complete'
from core.roles
where key in ('quality','platform_administrator')
on conflict do nothing;

-- Perfil restrito para a nova funcionária.
insert into core.roles(key,name,description,system,global_only)
values (
  'quality_executor',
  'Executor de planos de ação',
  'Consulta auditorias, edita planos e anexa evidências sem concluir',
  true,false
)
on conflict (key) do nothing;

insert into core.role_permissions(role_id,permission_key)
select r.id,p.key
from core.roles r cross join core.permissions p
where r.key='quality_executor'
and p.key in (
  'audit.inspection.read',
  'action_plan.read',
  'action_plan.write'
)
on conflict do nothing;

-- Impedir conclusão e reabertura sem autorização específica.
create or replace function action_plans.set_plan_status(
  p_id uuid,p_version integer,p_status text
) returns void
language plpgsql security definer set search_path='' as $$
declare b action_plans.plans; r action_plans.plans;
begin
  b=action_plans_private.lock_plan(
    p_id,p_version,'action_plan.write',false
  );

  if p_status is null or p_status=b.status then
    raise exception 'Invalid status transition'
      using errcode='23514';
  end if;

  if p_status='completed' or b.status='completed' then
    perform action_plans_private.authorize(
      'action_plan.complete',b.unit_id,b.sector_id
    );
  end if;

  update action_plans.plans set
    status=p_status,
    completed_at=case when p_status='completed'
      then clock_timestamp() end,
    completed_by=case when p_status='completed'
      then auth.uid() end
  where id=p_id returning * into r;

  perform action_plans_private.log('status',r,to_jsonb(b));
end $$;

commit;
