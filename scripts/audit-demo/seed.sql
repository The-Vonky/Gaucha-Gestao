-- Development fixture, NOT a migration or standalone remote provisioning script.
-- Execute only through seed.mjs, which verifies the local Docker/CLI target first.
begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';
do $actor$
declare
  requested uuid := nullif('__AUDIT_DEMO_USER_ID__','')::uuid;
  actor uuid;
  candidates uuid[];
begin
  perform pg_catalog.pg_advisory_xact_lock(510052026);
  select array_agg(distinct p.id) into candidates
  from core.profiles p join auth.users u on u.id=p.id
  join core.user_role_assignments a on a.user_id=p.id and a.active and a.scope_type='global'
  join core.roles r on r.id=a.role_id and r.active and r.key='platform_administrator'
  where p.active and u.email_confirmed_at is not null and u.deleted_at is null
    and (u.banned_until is null or u.banned_until<=now())
    and (requested is null or p.id=requested);
  if coalesce(cardinality(candidates),0)<>1 then
    raise exception 'Requer exatamente um administrador local ativo/confirmado; crie via Studio e bootstrap ou selecione com --user-id';
  end if;
  actor := candidates[1];
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $actor$;
-- Only operator identity lookup above is privileged. All domain writes below use
-- the same authenticated grants, RLS, triggers and RPCs as the application.
set local role authenticated;
do $demo$
declare
  units jsonb := '[
    {"code":"DEMO-AUD-ALTA","name":"[DEMO] Hospital Santa Clara — adequada","audits":[
      {"days":2,"at":140,"ap":8,"nat":4,"nap":6,"answered":158,"finalize":true}]},
    {"code":"DEMO-AUD-BAIXA","name":"[DEMO] Hospital Vale Verde — em atenção","audits":[
      {"days":3,"at":45,"ap":45,"nat":60,"nap":8,"answered":158,"finalize":true}]},
    {"code":"DEMO-AUD-INICIO","name":"[DEMO] UPA Central — início da visita","audits":[
      {"days":0,"at":14,"ap":3,"nat":1,"nap":0,"answered":18,"finalize":false}]},
    {"code":"DEMO-AUD-FINAL","name":"[DEMO] Hospital São Lucas — visita quase pronta","audits":[
      {"days":0,"at":123,"ap":15,"nat":4,"nap":8,"answered":150,"finalize":false}]},
    {"code":"DEMO-AUD-EVOLUCAO","name":"[DEMO] Hospital Horizonte — evolução","audits":[
      {"days":90,"at":45,"ap":45,"nat":60,"nap":8,"answered":158,"finalize":true},
      {"days":60,"at":90,"ap":38,"nat":22,"nap":8,"answered":158,"finalize":true},
      {"days":30,"at":135,"ap":10,"nat":5,"nap":8,"answered":158,"finalize":true}]},
    {"code":"DEMO-AUD-VAZIA","name":"[DEMO] Ambulatório Nova Esperança — sem auditoria","audits":[]}
  ]';
  unit_spec jsonb;
  audit_spec jsonb;
  existing_count integer;
  demo_unit_id uuid;
  demo_inspection_id uuid;
  inspection_version integer;
  previous_date date;
  base_date date := current_date;
  permission text;
  n integer;
  plan_row action_plans.plans;
  plan_index integer := 0;
begin
  foreach permission in array array['admin.unit.manage','admin.unit.read','audit.inspection.read',
    'audit.inspection.create','audit.inspection.edit','audit.inspection.finalize',
    'action_plan.read','action_plan.write','action_plan.verify'] loop
    if not private.has_global_permission(permission) then
      raise exception 'Administrador local sem permissão global necessária: %',permission;
    end if;
  end loop;
  if not exists(select 1 from audit.checklist_templates where active
    and version='checklist-geral-2026-09-22-v1' and item_count=158) then
    raise exception 'Seed v1 requer checklist canônico ativo de 158 critérios; aplique as migrations locais';
  end if;
  select count(*) into existing_count from core.units u
  where u.code like 'DEMO-AUD-%';
  if existing_count<>0 then
    if existing_count<>6 then
      raise exception 'Massa DEMO parcial ou colisão de namespace; use reset LOCAL descartável';
    end if;
    for unit_spec in select value from jsonb_array_elements(units) loop
      if not exists(select 1 from core.units u where u.code=unit_spec->>'code' and u.name=unit_spec->>'name' and u.active) then
        raise exception 'Massa DEMO alterada ou colisão de identidade; nenhum dado será sobrescrito';
      end if;
      select count(*) into n from audit.inspections where unit_id=(select id from core.units where code=unit_spec->>'code');
      if n<>jsonb_array_length(unit_spec->'audits') then
        raise exception 'Massa DEMO parcial/expandida; nenhum dado será sobrescrito; use reset LOCAL para recriar';
      end if;
    end loop;
    perform set_config('audit_demo.result','reutilizada, sem sobrescrever edições',true);
    return;
  end if;
  for unit_spec in select value from jsonb_array_elements(units) loop
    insert into core.units(code,name,active)
    values(unit_spec->>'code',unit_spec->>'name',true) returning id into demo_unit_id;
    previous_date := null;
    for audit_spec in select value from jsonb_array_elements(unit_spec->'audits') loop
      demo_inspection_id := audit.create_inspection(demo_unit_id,
        base_date-(audit_spec->>'days')::integer,previous_date);
      -- Spread deficiencies across sections with a permutation of the answered
      -- positions (37 is coprime with 18, 150 and 158). Null rows stay untouched.
      with responses as (
        select c.key,c.template_version,
          case
            when mod((c.position-1)*37,(audit_spec->>'answered')::integer)<(audit_spec->>'at')::integer then 'AT'
            when mod((c.position-1)*37,(audit_spec->>'answered')::integer)<(audit_spec->>'at')::integer+(audit_spec->>'ap')::integer then 'AP'
            when mod((c.position-1)*37,(audit_spec->>'answered')::integer)<(audit_spec->>'at')::integer+(audit_spec->>'ap')::integer+(audit_spec->>'nat')::integer then 'NAT'
            else 'NAP'
          end response
        from audit.checklist_items c join audit.inspections i on i.template_version=c.template_version
        where i.id=demo_inspection_id and c.position<=(audit_spec->>'answered')::integer
      )
      update audit.inspection_answers a set response=r.response,observation=case r.response
        when 'AP' then 'Demonstração: rotina implantada parcialmente; revisar orientação da equipe e registro de acompanhamento.'
        when 'NAT' then 'Demonstração: controle ainda não implantado; definir responsável, prazo e verificação da correção.'
        when 'NAP' then 'Demonstração: atividade não executada nesta unidade.'
        else '' end
      from responses r where a.inspection_id=demo_inspection_id and a.item_key=r.key and a.template_version=r.template_version;
      get diagnostics n=row_count;
      if n<>(audit_spec->>'answered')::integer then
        raise exception 'Quantidade de respostas inesperada; operação revertida';
      end if;
      if (audit_spec->>'finalize')::boolean then
        select version into inspection_version from audit.inspections where id=demo_inspection_id;
        perform audit.finalize_inspection(demo_inspection_id,inspection_version,'{}'::uuid[]);
      end if;
      previous_date := base_date-(audit_spec->>'days')::integer;
    end loop;
  end loop;
  -- Source plans are created by the existing AP/NAT trigger, never inserted here.
  -- Keep the first pending; advance three other plans through the public RPCs.
  for plan_row in select p.* from action_plans.plans p
    where p.unit_id=(select id from core.units where code='DEMO-AUD-BAIXA') order by p.source_item_key limit 4 loop
    plan_index := plan_index+1;
    if plan_index=1 then continue; end if;
    perform action_plans.update_plan(plan_row.id,plan_row.version,plan_row.improvement_point,
      'Padronizar a rotina e orientar a equipe responsável',
      'Revisar o procedimento, realizar orientação e acompanhar o registro diário por sete dias',
      'Equipe de Nutrição — demonstração',
      case when plan_index=2 then base_date+7 else base_date-1 end,
      '100% dos registros preenchidos corretamente durante o acompanhamento',
      base_date-7,base_date,
      'Lista de orientação e registros de acompanhamento (exemplo, sem anexos)');
    select * into plan_row from action_plans.plans where id=plan_row.id;
    perform action_plans.set_plan_status(plan_row.id,plan_row.version,'in_progress');
    if plan_index>=3 then
      select * into plan_row from action_plans.plans where id=plan_row.id;
      perform action_plans.set_plan_status(plan_row.id,plan_row.version,'completed');
    end if;
    if plan_index=4 then
      select * into plan_row from action_plans.plans where id=plan_row.id;
      perform action_plans.verify_plan(plan_row.id,plan_row.version,'effective',base_date,
        'Demonstração: registros acompanhados e orientação verificada; critério de eficácia atendido.','{}'::uuid[]);
    end if;
  end loop;
  perform set_config('audit_demo.result','criada',true);
end $demo$;
select jsonb_build_object(
  'result',current_setting('audit_demo.result'),
  'user_id',auth.uid(),
  'user_name',(select display_name from core.profiles where id=auth.uid()),
  'units',(select jsonb_agg(jsonb_build_object('id',u.id,'code',u.code,'name',u.name) order by u.code)
    from core.units u where u.code like 'DEMO-AUD-%'),
  'inspections',(select jsonb_agg(to_jsonb(s) order by s.unit_name,s.applied_on)
    from audit.inspection_summaries() s where s.unit_id in (select id from core.units where code like 'DEMO-AUD-%')),
  'plans',(select jsonb_agg(to_jsonb(s)) from (
    select p.status,p.effectiveness,count(*)::integer count from action_plans.plans p
    where p.unit_id in (select id from core.units where code like 'DEMO-AUD-%')
    group by p.status,p.effectiveness order by p.status,p.effectiveness nulls first) s)
);
commit;
