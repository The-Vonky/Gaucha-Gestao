begin;

-- Execução separada da edição do planejamento.
insert into core.permissions(key,domain,resource,action,description)
values (
  'action_plan.execute','action_plan','plan','execute',
  'Iniciar execução e gerenciar evidências da execução'
)
on conflict (key) do nothing;

-- Qualidade e administrador conservam todas as operações.
-- Adriele recebe apenas execução, além de leitura.
insert into core.role_permissions(role_id,permission_key)
select id,'action_plan.execute'
from core.roles
where key in (
  'quality',
  'platform_administrator',
  'quality_executor'
)
on conflict do nothing;

-- Remover da executora o direito de editar planejamento.
delete from core.role_permissions rp
using core.roles r
where rp.role_id=r.id
  and r.key='quality_executor'
  and rp.permission_key='action_plan.write';

-- Upload e remoção de evidências da execução usam execute.
create or replace function action_plans_private.evidence_permission(
  p_kind text
) returns text
language sql immutable set search_path='' as $$
  select case p_kind
    when 'execution' then 'action_plan.execute'
    when 'verification' then 'action_plan.verify'
  end
$$;

-- Mudanças de situação usam execute.
-- Concluir ou reabrir exige também complete.
create or replace function action_plans.set_plan_status(
  p_id uuid,p_version integer,p_status text
) returns void
language plpgsql security definer set search_path='' as $$
declare b action_plans.plans; r action_plans.plans;
begin
  b=action_plans_private.lock_plan(
    p_id,p_version,'action_plan.execute',false
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

update core.roles
set description='Consultar auditorias e planos, iniciar execução e anexar evidências, sem editar planejamento nem concluir planos'
where key='quality_executor';

commit;
