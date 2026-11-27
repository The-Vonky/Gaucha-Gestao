begin;

create table audit_private.inspection_deletions (
  inspection_id uuid primary key,
  unit_id uuid not null,
  authorized_by uuid not null,
  started_at timestamptz not null default clock_timestamp(),
  snapshot text not null,
  counts jsonb not null,
  previous_status text not null,
  reconciliation_required boolean not null,
  verified_at timestamptz,
  completed_at timestamptz
);
create table audit_private.deletion_objects (
  inspection_id uuid not null references audit_private.inspection_deletions,
  bucket text not null, name text not null, object_id uuid not null,
  primary key (bucket, name)
);
create index deletion_objects_inspection on audit_private.deletion_objects(inspection_id);
-- Marcas mínimas impedem publicação tardia mesmo após desaparecer o registro de negócio.
create table audit_private.deletion_namespaces (
  bucket text not null, prefix text not null,
  inspection_id uuid not null references audit_private.inspection_deletions,
  primary key(bucket, prefix)
);
create index deletion_namespaces_inspection on audit_private.deletion_namespaces(inspection_id);
alter table audit_private.inspection_deletions enable row level security;
alter table audit_private.deletion_objects enable row level security;
alter table audit_private.deletion_namespaces enable row level security;
revoke all on audit_private.inspection_deletions, audit_private.deletion_objects,
  audit_private.deletion_namespaces from public, anon, authenticated;

create function audit_private.deletion_lock(p_key text, p_exclusive boolean)
returns void language plpgsql set search_path='' as $$
declare k bigint := hashtextextended('aud-delete:' || p_key, 0);
begin
  -- Nunca esperar por um escritor que já detém locks de linha em ordem diferente.
  if not (case when p_exclusive then pg_try_advisory_xact_lock(k)
              else pg_try_advisory_xact_lock_shared(k) end) then
    raise exception 'Concurrent change' using errcode='40001';
  end if;
end $$;

create function audit_private.guard_deletion_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  case tg_table_name
    when 'inspections' then target := new.id;
    when 'inspection_answers', 'checklist_evidence' then target := new.inspection_id;
    when 'plans' then target := new.source_inspection_id;
    when 'evidence' then
      select p.source_inspection_id into target from action_plans.plans p where p.id=new.plan_id;
    when 'checklist_evidence_derivatives' then
      select e.inspection_id into target from audit.checklist_evidence e where e.id=new.evidence_id;
  end case;
  if target is not null then
    perform audit_private.deletion_lock(target::text, false);
    if exists(select from audit_private.inspection_deletions where inspection_id=target) then
      raise exception 'Inspection deletion in progress' using errcode='55000';
    end if;
  end if;
  return new;
end $$;
create trigger deletion_guard before insert or update on audit.inspections
for each row execute function audit_private.guard_deletion_write();
create trigger deletion_guard before insert or update on audit.inspection_answers
for each row execute function audit_private.guard_deletion_write();
create trigger deletion_guard before insert or update on audit.checklist_evidence
for each row execute function audit_private.guard_deletion_write();
create trigger deletion_guard before insert or update on audit.checklist_evidence_derivatives
for each row execute function audit_private.guard_deletion_write();
create trigger deletion_guard before insert or update on action_plans.plans
for each row execute function audit_private.guard_deletion_write();
create trigger deletion_guard before insert or update on action_plans.evidence
for each row execute function audit_private.guard_deletion_write();

-- O Storage registra a versão depois de transmitir os bytes, inclusive com
-- identidade interna. A barreira precisa abranger esse commit além da RLS inicial.
create function audit_private.guard_storage_publication() returns trigger
language plpgsql security definer set search_path='' as $$
declare object_prefix text := split_part(new.name,'/',1);
begin
  perform audit_private.deletion_lock(new.bucket_id || '/' || object_prefix, false);
  if exists(select from audit_private.deletion_namespaces n where n.bucket=new.bucket_id and n.prefix=object_prefix) then
    raise exception 'Inspection deletion in progress' using errcode='55000';
  end if;
  return new;
end $$;
create trigger audit_deletion_publication before insert or update on storage.objects for each row
when (new.bucket_id in ('audit-checklist-evidence','audit-evidence-thumbnails','action-plan-evidence'))
execute function audit_private.guard_storage_publication();

create function audit_private.authorize_deletion(p_unit uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Forbidden' using errcode='42501'; end if;
  if private.identity_enabled() then perform private.identity_lock(auth.uid(), true); end if;
  perform audit_private.authorize('audit.inspection.read',p_unit);
  perform audit_private.authorize('audit.inspection.delete',p_unit);
end $$;

create function audit.begin_inspection_delete(p_inspection uuid, p_snapshot text, p_confirmation text)
returns void language plpgsql security definer set search_path='' as $$
declare unit uuid; impact jsonb; ns record; reconcile boolean;
begin
  select unit_id into unit from audit.inspections where id=p_inspection;
  if unit is null then raise exception 'Forbidden' using errcode='42501'; end if;
  perform audit_private.authorize_deletion(unit);
  if p_confirmation is distinct from 'excluir auditoria' then
    raise exception 'Invalid confirmation' using errcode='22023';
  end if;
  perform audit_private.deletion_lock(p_inspection::text,true);
  if exists(select from audit_private.inspection_deletions where inspection_id=p_inspection and snapshot=p_snapshot) then return; end if;
  for ns in select bucket,prefix from audit_private.inspection_object_namespaces(p_inspection) order by bucket,prefix loop
    perform audit_private.deletion_lock(ns.bucket || '/' || ns.prefix,true);
  end loop;
  impact := audit.inspection_delete_impact(p_inspection);
  if p_snapshot is distinct from impact->>'snapshot' then raise exception 'Impact changed' using errcode='40001'; end if;
  -- Reservas, originais ausentes e tentativas de derivação inconclusas podem ter deixado bytes fora do catálogo.
  select exists(
    select from audit.checklist_evidence e where e.inspection_id=p_inspection and
      (e.status='pending' or not exists(select from storage.objects o where o.bucket_id='audit-checklist-evidence' and o.name=e.object_key))
    union all
    select from action_plans.evidence e join action_plans_private.inspection_plans(p_inspection) p on p.id=e.plan_id
      where e.status='pending' or not exists(select from storage.objects o where o.bucket_id='action-plan-evidence' and o.name=e.object_key)
    union all
    select from audit.checklist_evidence_derivatives d join audit.checklist_evidence e on e.id=d.evidence_id
      where e.inspection_id=p_inspection and d.attempts>0 and (d.state<>'ready' or not exists
        (select from storage.objects o where o.bucket_id='audit-evidence-thumbnails' and o.name=d.derived_object_key))
  ) into reconcile;
  insert into audit_private.inspection_deletions(inspection_id,unit_id,authorized_by,snapshot,counts,previous_status,reconciliation_required)
  values(p_inspection,unit,auth.uid(),p_snapshot,impact->'counts',impact->>'status',reconcile);
  insert into audit_private.deletion_namespaces(bucket,prefix,inspection_id)
  select bucket,prefix,p_inspection from audit_private.inspection_object_namespaces(p_inspection);
  insert into audit_private.deletion_objects select p_inspection,bucket,name,id from audit_private.inspection_storage_objects(p_inspection);
  insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,unit_id,metadata)
  values(auth.uid(),'audit','inspection_delete_start','inspection',p_inspection::text,unit,
    jsonb_build_object('status',impact->>'status','counts',impact->'counts','result','started'));
end $$;

create function audit.can_remove_deletion_object(p_bucket text,p_name text,p_id uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare unit uuid;
begin
  if storage.allow_only_operation('storage.object.delete_many') is not true then return false; end if;
  select j.unit_id into unit from audit_private.deletion_objects o
  join audit_private.inspection_deletions j using(inspection_id)
  where o.bucket=p_bucket and o.name=p_name and o.object_id=p_id and j.completed_at is null;
  if not found then return false; end if;
  perform audit_private.authorize_deletion(unit);
  return true;
end $$;
-- SELECT estritamente durante DELETE em lote. Não expõe download, assinatura nem listagem.
create policy audit_deletion_select on storage.objects for select to authenticated
using (audit.can_remove_deletion_object(bucket_id,name,id));
create policy audit_deletion_remove on storage.objects for delete to authenticated
using (audit.can_remove_deletion_object(bucket_id,name,id));
alter policy audit_derivative_no_delete on storage.objects using (
  bucket_id not in ('audit-checklist-evidence','audit-evidence-thumbnails','action-plan-evidence')
  or audit.can_remove_deletion_object(bucket_id,name,id)
);

create function audit.inspection_delete_state(p_inspection uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j audit_private.inspection_deletions; batch jsonb;
begin
  select * into j from audit_private.inspection_deletions where inspection_id=p_inspection;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  perform audit_private.authorize_deletion(j.unit_id);
  select coalesce(jsonb_agg(to_jsonb(b)), '[]') into batch from (
    select d.bucket,d.name from audit_private.deletion_objects d
    join storage.objects o on o.bucket_id=d.bucket and o.name=d.name and o.id=d.object_id
    where d.inspection_id=p_inspection order by d.bucket,d.name limit 100
  ) b;
  return jsonb_build_object('objects',batch,'completed',j.completed_at is not null,
    'reconcile',j.reconciliation_required and j.verified_at is null);
end $$;

-- Contrato exclusivo com Planos de Ação, chamado somente na conclusão.
create function action_plans_private.delete_inspection_plans(p_inspection uuid) returns void
language plpgsql set search_path='' as $$
begin
  delete from action_plans.evidence e using action_plans_private.inspection_plans(p_inspection) p
    where e.plan_id=p.id;
  delete from action_plans.plans where source_type='checklist' and source_inspection_id=p_inspection;
end $$;

create function audit.finish_inspection_delete(p_inspection uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j audit_private.inspection_deletions;
begin
  select * into j from audit_private.inspection_deletions where inspection_id=p_inspection for update;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  perform audit_private.authorize_deletion(j.unit_id);
  if j.completed_at is not null then return; end if;
  perform audit_private.deletion_lock(p_inspection::text,true);
  if (j.reconciliation_required and j.verified_at is null) or
    exists(select from audit_private.inspection_storage_objects(p_inspection)) then
    raise exception 'Physical cleanup pending' using errcode='55000';
  end if;
  perform action_plans_private.delete_inspection_plans(p_inspection);
  delete from audit.checklist_evidence_derivatives d using audit.checklist_evidence e
    where d.evidence_id=e.id and e.inspection_id=p_inspection;
  delete from audit.checklist_evidence where inspection_id=p_inspection;
  delete from audit.inspection_answers where inspection_id=p_inspection;
  delete from audit.inspections where id=p_inspection;
  delete from audit_private.deletion_objects where inspection_id=p_inspection;
  update audit_private.inspection_deletions set completed_at=clock_timestamp() where inspection_id=p_inspection;
  insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,unit_id,metadata)
  values(auth.uid(),'audit','inspection_delete_complete','inspection',p_inspection::text,j.unit_id,
    jsonb_build_object('authorized_by',j.authorized_by,'started_at',j.started_at,
      'status',j.previous_status,'counts',j.counts,'result','completed'));
end $$;

create function audit.pending_inspection_deletions(p_unit uuid) returns table(id uuid,applied_on date)
language sql stable security definer set search_path='' as $$
  select j.inspection_id,i.applied_on from audit_private.inspection_deletions j
  join audit.inspections i on i.id=j.inspection_id
  where j.unit_id=p_unit and j.completed_at is null and private.has_unit_permission('audit.inspection.read',p_unit)
$$;
revoke all on function audit_private.deletion_lock(text,boolean),audit_private.guard_deletion_write(),
  audit_private.guard_storage_publication(),audit_private.authorize_deletion(uuid),
  action_plans_private.delete_inspection_plans(uuid),
  audit.can_remove_deletion_object(text,text,uuid),audit.pending_inspection_deletions(uuid),
  audit.begin_inspection_delete(uuid,text,text),audit.inspection_delete_state(uuid),audit.finish_inspection_delete(uuid)
from public,anon,authenticated;
grant execute on function audit.can_remove_deletion_object(text,text,uuid),audit.pending_inspection_deletions(uuid),
  audit.begin_inspection_delete(uuid,text,text),audit.inspection_delete_state(uuid),audit.finish_inspection_delete(uuid)
to authenticated;
commit;
