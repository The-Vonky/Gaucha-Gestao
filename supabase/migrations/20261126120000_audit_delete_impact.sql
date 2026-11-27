begin;

insert into core.permissions(key, domain, resource, action, description)
values ('audit.inspection.delete', 'audit', 'inspection', 'delete', 'Excluir auditorias');
insert into core.role_permissions(role_id, permission_key)
select id, 'audit.inspection.delete' from core.roles
where system and key in ('platform_administrator', 'quality');

-- Contrato de origem. A resposta atual e a situação do plano não condicionam o vínculo.
create function action_plans_private.inspection_plans(p_inspection uuid)
returns setof action_plans.plans language sql stable set search_path = '' as $$
  select p.* from action_plans.plans p
  where p.source_type = 'checklist' and p.source_inspection_id = p_inspection
$$;

-- Cada namespace é derivado de um identificador canônico. Uma chave fora da
-- gramática do domínio não identifica um arquivo exclusivo da auditoria.
create function audit_private.inspection_object_namespaces(p_inspection uuid)
returns table(bucket text, prefix text, suffix_pattern text)
language sql stable set search_path = '' as $$
  with grammar as (
    select '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'::text as uuid_pattern
  )
  select 'audit-checklist-evidence', p_inspection::text, uuid_pattern from grammar
  union all
  select 'action-plan-evidence', p.id::text, uuid_pattern
  from action_plans_private.inspection_plans(p_inspection) p cross join grammar
  union all
  select 'audit-evidence-thumbnails', e.id::text, '^img-480-v1/[a-f0-9]{64}/[a-f0-9]{64}\.(jpg|png)$'
  from audit.checklist_evidence e where e.inspection_id = p_inspection
$$;

create function audit_private.inspection_storage_objects(p_inspection uuid)
returns table(bucket text, name text, id uuid, revision text)
language sql stable set search_path = '' as $$
  select n.bucket, o.name, o.id, to_jsonb(o)->>'version'
  from audit_private.inspection_object_namespaces(p_inspection) n
  join storage.objects o on o.bucket_id = n.bucket
    and o.name like n.prefix || '/%'
    and substr(o.name, length(n.prefix) + 2) ~ n.suffix_pattern
$$;

create function audit.inspection_delete_impact(p_inspection uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  target audit.inspections;
  impact jsonb;
begin
  select * into target from audit.inspections where id = p_inspection;
  if not found or auth.uid() is null or not private.is_active_user()
     or not private.has_unit_permission('audit.inspection.read', target.unit_id)
     or not private.has_unit_permission('audit.inspection.delete', target.unit_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  -- Um snapshot MVCC inclui versões independentes. O cliente recebe somente
  -- a impressão digital e contagens, inclusive de evidências já removidas.
  with plans as materialized (select * from action_plans_private.inspection_plans(target.id)),
  a as (
    select count(*) as criteria, count(response) as answered,
      count(*) filter (where btrim(observation) <> '') as observations,
      jsonb_agg(jsonb_build_array(item_key, version) order by item_key) as revisions
    from audit.inspection_answers where inspection_id = target.id
  ), p as (
    select count(*) as plans, count(*) filter (where status = 'pending') as pending,
      count(*) filter (where status = 'in_progress') as in_progress,
      count(*) filter (where status = 'completed') as completed,
      count(*) filter (where verified_at is not null) as verified,
      count(*) filter (where not source_active) as inactive_sources,
      jsonb_agg(jsonb_build_array(id, version) order by id) as revisions from plans
  ), evidence as materialized (
    select id, status from audit.checklist_evidence where inspection_id = target.id
  ), e as (
    select count(*) as checklist_evidence, count(*) filter (where status='pending') as checklist_reservations,
      jsonb_agg(jsonb_build_array(id, status) order by id) as revisions from evidence
  ), d as (
    select count(*) as derivatives,
      jsonb_agg(to_jsonb(d) order by d.evidence_id, d.encoder_version) as revisions
    from audit.checklist_evidence_derivatives d join evidence e on e.id = d.evidence_id
  ), pe as (
    select count(*) filter (where kind='execution') as execution_evidence,
      count(*) filter (where kind='verification') as verification_evidence,
      count(*) filter (where e.status='pending') as plan_reservations,
      jsonb_agg(jsonb_build_array(e.id, e.status, e.verification_round) order by e.id) as revisions
    from action_plans.evidence e join plans on plans.id = e.plan_id
  ), o as (
    select count(*) as objects, jsonb_agg(to_jsonb(o) order by bucket, name) as revisions
    from audit_private.inspection_storage_objects(target.id) o
  )
  select jsonb_build_object(
    'id', target.id, 'unit', u.name, 'date', target.applied_on, 'responsible', pr.display_name,
    'status', target.status,
    'counts', (to_jsonb(a)-'revisions') || (to_jsonb(p)-'revisions') ||
      (to_jsonb(e)-'revisions') || (to_jsonb(d)-'revisions') ||
      (to_jsonb(pe)-'revisions') || (to_jsonb(o)-'revisions'),
    'snapshot', encode(sha256(convert_to(jsonb_build_array(target.id, target.version,
      u.name, pr.display_name, a.revisions, p.revisions, e.revisions, d.revisions,
      pe.revisions, o.revisions)::text, 'UTF8')), 'hex')
  ) into strict impact
  from a, p, e, d, pe, o, core.units u, core.profiles pr
  where u.id = target.unit_id and pr.id = target.responsible_id;
  return impact;
end $$;

revoke all on function action_plans_private.inspection_plans(uuid),
  audit_private.inspection_object_namespaces(uuid), audit_private.inspection_storage_objects(uuid),
  audit.inspection_delete_impact(uuid) from public, anon, authenticated;
grant execute on function audit.inspection_delete_impact(uuid) to authenticated;
commit;
