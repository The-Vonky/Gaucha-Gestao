begin;

insert into core.permissions(key,domain,resource,action,description)
values ('action_plan.delete','action_plan','plan','delete','Excluir planos de ação');
insert into core.role_permissions(role_id,permission_key)
select id,'action_plan.delete' from core.roles where system and key in ('quality','platform_administrator');

-- Uma marca por ciclo ativo. A exclusão da resposta de origem também remove a marca.
create table action_plans_private.deleted_active_sources (
  inspection_id uuid not null,
  item_key text not null,
  primary key(inspection_id,item_key),
  foreign key(inspection_id,item_key) references audit.inspection_answers(inspection_id,item_key) on delete cascade
);
create table action_plans_private.plan_deletions (
  plan_id uuid primary key,
  unit_id uuid not null,
  sector_id uuid,
  authorized_by uuid not null,
  started_at timestamptz not null default clock_timestamp(),
  snapshot text not null,
  counts jsonb not null,
  previous_status text not null,
  reconciliation_required boolean not null,
  verified_at timestamptz,
  completed_at timestamptz
);
alter table action_plans_private.deleted_active_sources enable row level security;
alter table action_plans_private.plan_deletions enable row level security;
revoke all on action_plans_private.deleted_active_sources,action_plans_private.plan_deletions from public,anon,authenticated;

-- O mesmo inventário e a mesma barreira de publicação da AUD-DELETE-01.
alter table audit_private.deletion_objects alter column inspection_id drop not null,
  add column plan_id uuid references action_plans_private.plan_deletions,
  add check(num_nonnulls(inspection_id,plan_id)=1);
alter table audit_private.deletion_namespaces alter column inspection_id drop not null,
  add column plan_id uuid references action_plans_private.plan_deletions,
  add check(num_nonnulls(inspection_id,plan_id)=1);
create index deletion_objects_plan on audit_private.deletion_objects(plan_id) where plan_id is not null;
create index deletion_namespaces_plan on audit_private.deletion_namespaces(plan_id) where plan_id is not null;
create index evidence_by_plan on action_plans.evidence(plan_id);

create function action_plans_private.authorize_deletion(p_unit uuid,p_sector uuid) returns void
language plpgsql set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Forbidden' using errcode='42501'; end if;
  if private.identity_enabled() then perform private.identity_lock(auth.uid(), true); end if;
  perform action_plans_private.authorize('action_plan.read',p_unit,p_sector);
  perform action_plans_private.authorize('action_plan.delete',p_unit,p_sector);
end $$;

create function action_plans_private.plan_is_intact(p_plan uuid,p_inspection uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(select from action_plans_private.plan_deletions where plan_id=p_plan)
     and not exists(select from audit_private.inspection_deletions where inspection_id=p_inspection)
$$;

create function action_plans_private.guard_plan_deletion_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if tg_table_name='plans' then target := new.id;
  else target := new.plan_id;
  end if;
  perform audit_private.deletion_lock('plan/' || target::text,false);
  if exists(select from action_plans_private.plan_deletions where plan_id=target) then
    raise exception 'Plan deletion in progress' using errcode='55000';
  end if;
  return new;
end $$;
create trigger plan_deletion_guard before insert or update on action_plans.plans
for each row execute function action_plans_private.guard_plan_deletion_write();
create trigger plan_deletion_guard before insert or update on action_plans.evidence
for each row execute function action_plans_private.guard_plan_deletion_write();

create function action_plans_private.plan_storage_objects(p_plan uuid)
returns table(bucket text,name text,id uuid,revision text)
language sql stable set search_path='' as $$
  select o.bucket_id,o.name,o.id,to_jsonb(o)->>'version'
  from storage.objects o
  where o.bucket_id='action-plan-evidence' and o.name like p_plan::text || '/%'
    and substr(o.name,38) ~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
$$;

create function action_plans.plan_delete_impact(p_plan uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target action_plans.plans; impact jsonb;
begin
  select * into target from action_plans.plans where id=p_plan;
  if not found or not private.has_scoped_permission('action_plan.read',target.unit_id,target.sector_id)
    or not private.has_scoped_permission('action_plan.delete',target.unit_id,target.sector_id) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  if not action_plans_private.plan_is_intact(target.id,target.source_inspection_id) then
    raise exception 'Deletion in progress' using errcode='55000';
  end if;
  with e as (
    select count(*) filter(where kind='execution' and status<>'pending') as execution_evidence,
      count(*) filter(where kind='verification' and status<>'pending') as verification_evidence,
      count(*) filter(where status='removed') as removed_evidence,
      count(*) filter(where status='pending') as reservations,
      jsonb_agg(jsonb_build_array(id,status,verification_round) order by id) as revisions
    from action_plans.evidence where plan_id=p_plan
  ), o as (
    select count(*) as objects,jsonb_agg(to_jsonb(o) order by name) as revisions
    from action_plans_private.plan_storage_objects(p_plan) o
  )
  select jsonb_build_object(
    'title',target.improvement_point,'unit',u.name,'sector',s.name,'status',target.status,
    'source',target.source_type,'verified',target.verified_at is not null,
    'rounds',target.verification_round,'counts',(to_jsonb(e)-'revisions') || (to_jsonb(o)-'revisions'),
    'snapshot',encode(sha256(convert_to(jsonb_build_array(target.id,target.version,u.name,s.name,
      e.revisions,o.revisions)::text,'UTF8')),'hex'))
  into strict impact
  from e,o,core.units u left join core.sectors s on s.id=target.sector_id
  where u.id=target.unit_id;
  return impact;
end $$;

-- Bloqueia início e conclusão contra respostas da origem e contra AUD-DELETE-01.
-- O lock próprio também abrange planos manuais. Ambos usam tentativa sem espera.
create function action_plans_private.lock_plan_deletion(p_plan uuid,p_inspection uuid) returns void
language plpgsql set search_path='' as $$
begin
  if p_inspection is not null then
    perform audit_private.deletion_lock(p_inspection::text,true);
    if exists(select from audit_private.inspection_deletions where inspection_id=p_inspection) then
      raise exception 'Inspection deletion in progress' using errcode='55000';
    end if;
  end if;
  perform audit_private.deletion_lock('plan/' || p_plan::text,true);
end $$;

create function action_plans.begin_plan_delete(p_plan uuid,p_snapshot text,p_confirmation text)
returns void language plpgsql security definer set search_path='' as $$
declare target action_plans.plans; impact jsonb; reconcile boolean;
begin
  select * into target from action_plans.plans where id=p_plan;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  perform action_plans_private.authorize_deletion(target.unit_id,target.sector_id);
  if p_confirmation is distinct from 'excluir plano de ação' then
    raise exception 'Invalid confirmation' using errcode='22023';
  end if;
  perform action_plans_private.lock_plan_deletion(p_plan,target.source_inspection_id);
  if exists(select from action_plans_private.plan_deletions where plan_id=p_plan and snapshot=p_snapshot) then return; end if;
  perform audit_private.deletion_lock('action-plan-evidence/' || p_plan::text,true);
  impact := action_plans.plan_delete_impact(p_plan);
  if p_snapshot is distinct from impact->>'snapshot' then raise exception 'Impact changed' using errcode='40001'; end if;

  select exists(select from action_plans.evidence e where e.plan_id=p_plan and
    (e.status='pending' or not exists(select from storage.objects o where o.bucket_id='action-plan-evidence' and o.name=e.object_key)))
  into reconcile;
  insert into action_plans_private.plan_deletions(plan_id,unit_id,sector_id,authorized_by,snapshot,counts,previous_status,reconciliation_required)
  values(p_plan,target.unit_id,target.sector_id,auth.uid(),p_snapshot,impact->'counts',target.status,reconcile);
  insert into audit_private.deletion_namespaces(bucket,prefix,plan_id)
  values('action-plan-evidence',p_plan::text,p_plan);
  insert into audit_private.deletion_objects(plan_id,bucket,name,object_id)
  select p_plan,bucket,name,id from action_plans_private.plan_storage_objects(p_plan);
  insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,unit_id,sector_id,metadata)
  values(auth.uid(),'action_plans','plan_delete_start','plan',p_plan::text,target.unit_id,target.sector_id,
    jsonb_build_object('status',target.status,'counts',impact->'counts','result','started'));
end $$;

create function audit_private.deletion_batch(p_inspection uuid,p_plan uuid) returns jsonb
language sql stable set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(b) order by b.bucket,b.name),'[]') from (
    select d.bucket,d.name from audit_private.deletion_objects d
    join storage.objects o on o.bucket_id=d.bucket and o.name=d.name and o.id=d.object_id
    where d.inspection_id=p_inspection or d.plan_id=p_plan order by d.bucket,d.name limit 100
  ) b
$$;

create function action_plans.plan_delete_state(p_plan uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j action_plans_private.plan_deletions;
begin
  select * into j from action_plans_private.plan_deletions where plan_id=p_plan;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  perform action_plans_private.authorize_deletion(j.unit_id,j.sector_id);
  return jsonb_build_object('objects',audit_private.deletion_batch(null,p_plan),'completed',j.completed_at is not null,
    'reconcile',j.reconciliation_required and j.verified_at is null);
end $$;

create function action_plans.finish_plan_delete(p_plan uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j action_plans_private.plan_deletions; target action_plans.plans;
begin
  select * into j from action_plans_private.plan_deletions where plan_id=p_plan for update;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  perform action_plans_private.authorize_deletion(j.unit_id,j.sector_id);
  if j.completed_at is not null then return; end if;
  select * into strict target from action_plans.plans where id=p_plan for update nowait;
  perform action_plans_private.lock_plan_deletion(p_plan,target.source_inspection_id);
  if (j.reconciliation_required and j.verified_at is null) or
    exists(select from action_plans_private.plan_storage_objects(p_plan)) then
    raise exception 'Physical cleanup pending' using errcode='55000';
  end if;
  if target.source_active then
    insert into action_plans_private.deleted_active_sources(inspection_id,item_key)
    values(target.source_inspection_id,target.source_item_key);
  end if;
  delete from action_plans.evidence where plan_id=p_plan;
  delete from action_plans.plans where id=p_plan;
  delete from audit_private.deletion_objects where plan_id=p_plan;
  update action_plans_private.plan_deletions set completed_at=clock_timestamp() where plan_id=p_plan;
  insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,unit_id,sector_id,metadata)
  values(auth.uid(),'action_plans','plan_delete_complete','plan',p_plan::text,j.unit_id,j.sector_id,
    jsonb_build_object('authorized_by',j.authorized_by,'started_at',j.started_at,
      'status',j.previous_status,'counts',j.counts,'result','completed'));
end $$;

create function action_plans.pending_plan_deletions(p_plan uuid default null,p_inspection uuid default null,p_after_id uuid default null)
returns table(id uuid,title text,unit_name text)
language sql stable security definer set search_path='' as $$
  select p.id,p.improvement_point,u.name from action_plans_private.plan_deletions j
  join action_plans.plans p on p.id=j.plan_id join core.units u on u.id=j.unit_id
  where j.completed_at is null
    and private.has_scoped_permission('action_plan.read',j.unit_id,j.sector_id)
    and private.has_scoped_permission('action_plan.delete',j.unit_id,j.sector_id)
    and (p_plan is null or p.id=p_plan) and (p_inspection is null or p.source_inspection_id=p_inspection)
    and (p_after_id is null or p.id>p_after_id)
  order by p.id
$$;

create or replace function audit.can_remove_deletion_object(p_bucket text,p_name text,p_id uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare target record;
begin
  if storage.allow_only_operation('storage.object.delete_many') is not true then return false; end if;
  select i.unit_id inspection_unit,p.unit_id plan_unit,p.sector_id into target
  from audit_private.deletion_objects o
  left join audit_private.inspection_deletions i on i.inspection_id=o.inspection_id and i.completed_at is null
  left join action_plans_private.plan_deletions p on p.plan_id=o.plan_id and p.completed_at is null
  where o.bucket=p_bucket and o.name=p_name and o.object_id=p_id;
  if target.inspection_unit is not null then
    perform audit_private.authorize_deletion(target.inspection_unit);
  elsif target.plan_unit is not null then
    perform action_plans_private.authorize_deletion(target.plan_unit,target.sector_id);
  else
    return false;
  end if;
  return true;
end $$;


create or replace function audit.begin_inspection_delete(p_inspection uuid, p_snapshot text, p_confirmation text)
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
  -- A pendência independente conserva a titularidade do seu inventário.
  if exists(select from action_plans_private.inspection_plans(p_inspection) p
    join action_plans_private.plan_deletions j on j.plan_id=p.id where j.completed_at is null) then
    raise exception 'Related plan deletion in progress' using errcode='55000';
  end if;
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
  insert into audit_private.deletion_objects(inspection_id,bucket,name,object_id) select p_inspection,bucket,name,id from audit_private.inspection_storage_objects(p_inspection);
  insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,unit_id,metadata)
  values(auth.uid(),'audit','inspection_delete_start','inspection',p_inspection::text,unit,
    jsonb_build_object('status',impact->>'status','counts',impact->'counts','result','started'));
end $$;

create or replace function audit.inspection_delete_state(p_inspection uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j audit_private.inspection_deletions;
begin
  select * into j from audit_private.inspection_deletions where inspection_id=p_inspection;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  perform audit_private.authorize_deletion(j.unit_id);
  return jsonb_build_object('objects',audit_private.deletion_batch(p_inspection,null),'completed',j.completed_at is not null,
    'reconcile',j.reconciliation_required and j.verified_at is null);
end $$;

create or replace function action_plans_private.sync_checklist_source() returns trigger language plpgsql security definer set search_path='' as $$
declare p action_plans.plans; b action_plans.plans; eligible boolean=coalesce(new.response in ('AP','NAT'),false);
begin
 if not eligible then
  if old.response in ('AP','NAT') then
   delete from action_plans_private.deleted_active_sources where inspection_id=new.inspection_id and item_key=new.item_key;
  end if;
 elsif exists(select from action_plans_private.deleted_active_sources
   where inspection_id=new.inspection_id and item_key=new.item_key) then
  return null;
 end if;
 select * into b from action_plans.plans where source_inspection_id=new.inspection_id and source_item_key=new.item_key for update;
 if not found then
  if not eligible then return null; end if;
  insert into action_plans.plans(unit_id,source_type,source_inspection_id,source_item_key,source_active,source_response,source_observation,improvement_point,created_by,updated_by)
  select i.unit_id,'checklist',new.inspection_id,new.item_key,true,new.response,new.observation,c.text,auth.uid(),auth.uid()
  from audit.inspections i join audit.checklist_items c on c.template_version=i.template_version and c.key=new.item_key
  where i.id=new.inspection_id
  on conflict(source_inspection_id,source_item_key) do nothing returning * into p;
  if p.id is not null then perform action_plans_private.log('create',p,null,'{"source":"checklist"}'); return null; end if;
  -- A concurrent answer write created it first: continue with the existing row.
  select * into b from action_plans.plans where source_inspection_id=new.inspection_id and source_item_key=new.item_key for update;
 end if;
 if eligible then
  if (b.source_active,b.source_response,b.source_observation) is not distinct from (true,new.response,new.observation) then return null; end if;
  update action_plans.plans set source_active=true,source_response=new.response,source_observation=new.observation,
   source_reactivated_after_verification=source_reactivated_after_verification or (not b.source_active and b.effectiveness is not null)
  where id=b.id returning * into p;
  if not b.source_active then perform action_plans_private.log('source_activate',p,to_jsonb(b));
  elsif b.source_response<>new.response then perform action_plans_private.log('source_update',p,to_jsonb(b)); end if;
 elsif b.source_active then
  update action_plans.plans set source_active=false where id=b.id returning * into p;
  perform action_plans_private.log('source_deactivate',p,to_jsonb(b));
 end if;
 return null;
end $$;

create or replace function action_plans.plan_summaries_page(
 p_before_created_at timestamptz,p_before_id uuid,
 p_plan uuid default null,p_inspection uuid default null)
returns table(plan action_plans.plans,unit_name text,sector_name text,inspection_applied_on date,item_number integer,verified_by_name text,completed_by_name text)
language sql stable security definer set search_path='' as $$
 select p,u.name,s.name,i.applied_on,c.number,vp.display_name,cp.display_name
 from action_plans.plans p join core.units u on u.id=p.unit_id
 left join core.sectors s on s.id=p.sector_id
 left join audit.inspections i on i.id=p.source_inspection_id
 left join audit.checklist_items c on c.template_version=i.template_version and c.key=p.source_item_key
 left join core.profiles vp on vp.id=p.verified_by
 left join core.profiles cp on cp.id=p.completed_by
 where action_plans_private.plan_is_intact(p.id,p.source_inspection_id)
 and private.has_scoped_permission('action_plan.read',p.unit_id,p.sector_id)
 and (p_plan is null or p.id=p_plan) and (p_inspection is null or p.source_inspection_id=p_inspection)
 and (p_before_id is null or p.created_at<p_before_created_at
   or (p.created_at=p_before_created_at and p.id>p_before_id))
 order by p.created_at desc,p.id
$$;
create or replace function action_plans.plan_evidence(p_plan uuid)
returns table(id uuid,plan_id uuid,kind text,verification_round integer,object_key text,original_name text,content_type text,
 size_bytes bigint,created_by uuid,uploaded_by_name text,uploaded_at timestamptz)
language sql stable security definer set search_path='' as $$
 select e.id,e.plan_id,e.kind,e.verification_round,e.object_key,e.original_name,e.content_type,e.size_bytes,e.created_by,pr.display_name,e.uploaded_at
 from action_plans.evidence e join action_plans.plans p on p.id=e.plan_id join core.profiles pr on pr.id=e.created_by
 where e.plan_id=p_plan and e.status='available'
 and private.has_scoped_permission('action_plan.read',p.unit_id,p.sector_id)
 and action_plans_private.plan_is_intact(p.id,p.source_inspection_id)
 order by e.kind,e.verification_round nulls first,e.uploaded_at,e.id
$$;

create or replace function action_plans_private.can_upload_evidence_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from action_plans.evidence e join action_plans.plans p on p.id=e.plan_id
  where e.object_key=p_name and e.status='pending' and e.created_by=auth.uid() and e.created_at>now()-interval '1 hour'
  and action_plans_private.plan_is_intact(p.id,p.source_inspection_id)
  and private.has_scoped_permission(action_plans_private.evidence_permission(e.kind),p.unit_id,p.sector_id)
  and action_plans_private.evidence_change_error(p,e.kind,e.verification_round,true) is null)
$$;

create or replace function action_plans_private.can_read_evidence_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from action_plans.evidence e join action_plans.plans p on p.id=e.plan_id
  where e.object_key=p_name and e.status='available'
  and action_plans_private.plan_is_intact(p.id,p.source_inspection_id)
  and private.has_scoped_permission('action_plan.read',p.unit_id,p.sector_id))
$$;

alter policy plans_read on action_plans.plans using (
  private.has_scoped_permission('action_plan.read',unit_id,sector_id)
  and action_plans_private.plan_is_intact(id,source_inspection_id)
);

revoke all on function action_plans_private.authorize_deletion(uuid,uuid),
  action_plans_private.plan_is_intact(uuid,uuid),action_plans_private.guard_plan_deletion_write(),
  action_plans_private.plan_storage_objects(uuid),action_plans_private.lock_plan_deletion(uuid,uuid),
  audit_private.deletion_batch(uuid,uuid),
  action_plans.plan_delete_impact(uuid),action_plans.begin_plan_delete(uuid,text,text),
  action_plans.plan_delete_state(uuid),action_plans.finish_plan_delete(uuid),
  action_plans.pending_plan_deletions(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function action_plans_private.plan_is_intact(uuid,uuid),
  action_plans.plan_delete_impact(uuid),action_plans.begin_plan_delete(uuid,text,text),
  action_plans.plan_delete_state(uuid),action_plans.finish_plan_delete(uuid),
  action_plans.pending_plan_deletions(uuid,uuid,uuid) to authenticated;
commit;
