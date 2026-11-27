begin;

-- Preserva a conclusão já exercida pelos papéis personalizados da linha principal.
-- Se complete já existia, conserva a separação adotada pelo hotfix.
with new_completion as (
 insert into core.permissions(key,domain,resource,action,description)
 values ('action_plan.complete','action_plan','plan','complete','Concluir ou reabrir planos de ação')
 on conflict (key) do nothing returning key
)
insert into core.role_permissions(role_id,permission_key)
select rp.role_id,n.key from core.role_permissions rp
cross join new_completion n join core.roles r on r.id=rp.role_id
where rp.permission_key='action_plan.write' and not r.system
on conflict do nothing;

insert into core.permissions(key,domain,resource,action,description)
values ('action_plan.execute','action_plan','plan','execute','Executar planos atribuídos no escopo autorizado')
on conflict (key) do update set description=excluded.description;

insert into core.roles(key,name,description,system,global_only)
values ('quality_executor','Executor de planos de ação','Executa planos atribuídos dentro do escopo autorizado',true,false)
on conflict (key) do update set name=excluded.name, description=excluded.description;

delete from core.role_permissions rp using core.roles r
where r.id=rp.role_id and r.key='quality_executor' and rp.permission_key<>'action_plan.execute';

insert into core.role_permissions(role_id,permission_key)
select r.id,p.key from core.roles r cross join core.permissions p
where (r.key in ('quality','platform_administrator') and p.key in ('action_plan.complete','action_plan.execute'))
   or (r.key='quality_executor' and p.key='action_plan.execute')
on conflict do nothing;

alter table action_plans.plans
 add column responsible_id uuid references core.profiles(id),
 drop constraint plans_ready,
 add constraint plans_ready check(status='pending' or (
  btrim(action)<>'' and btrim(how_to)<>''
  and (responsible_id is not null or btrim(responsible)<>'')
  and due_date is not null and btrim(effectiveness_criterion)<>'' and btrim(expected_evidence)<>''));
create index plans_responsible on action_plans.plans(responsible_id) where responsible_id is not null;

create table action_plans_private.execution_reports (
 plan_id uuid not null references action_plans.plans(id) on delete cascade,
 version integer not null,
 report text not null check(char_length(report)<=2000),
 saved_by uuid not null references core.profiles(id),
 saved_at timestamptz not null default clock_timestamp(),
 primary key(plan_id,version)
);
alter table action_plans_private.execution_reports enable row level security;
revoke all on action_plans_private.execution_reports from public,anon,authenticated;

create function action_plans_private.can_read_plan(p_unit uuid,p_sector uuid,p_responsible uuid)
returns boolean language sql stable set search_path='' as $$
 select private.has_scoped_permission('action_plan.read',p_unit,p_sector)
    or (p_responsible is not null and p_responsible=auth.uid()
        and private.has_scoped_permission('action_plan.execute',p_unit,p_sector))
$$;

-- Projeção dos grants do Core para o perfil candidato, sem acesso ao diretório administrativo.
create function action_plans_private.eligible_assignees(p_unit uuid,p_sector uuid)
returns table(id uuid,name text) language sql stable set search_path='' as $$
 select pr.id,pr.display_name from core.profiles pr
 where pr.active and exists (
  select from core.user_role_assignments a
  join core.roles r on r.id=a.role_id and r.active
  join core.role_permissions rp on rp.role_id=r.id
  join core.permissions perm on perm.key=rp.permission_key and perm.active
  where a.user_id=pr.id and a.active
  and perm.key in ('action_plan.execute','action_plan.read','action_plan.write')
  and private.permission_assignment_allowed(perm.key)
  and (a.scope_type='global' or
      (a.unit_id=p_unit and (a.scope_type='unit' or (a.scope_type='sector' and a.sector_id=p_sector))))
  having bool_or(perm.key='action_plan.execute')
      or (bool_or(perm.key='action_plan.read') and bool_or(perm.key='action_plan.write'))
 )
$$;

create function action_plans.search_assignees(p_unit uuid,p_sector uuid,p_query text default '',p_plan uuid default null)
returns table(id uuid,name text) language plpgsql stable security definer set search_path='' as $$
begin
 if p_plan is null then
  if not exists(select from action_plans.creation_scopes() s
    where s.unit_id=p_unit and s.sector_id is not distinct from p_sector) then
   raise exception 'Forbidden' using errcode='42501';
  end if;
 elsif not private.has_scoped_permission('action_plan.write',p_unit,p_sector)
   or not exists(select from action_plans.plans p where p.id=p_plan and p.unit_id=p_unit
     and p.sector_id is not distinct from p_sector and p.effectiveness is null
     and action_plans_private.plan_is_intact(p.id,p.source_inspection_id)) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 return query select a.id,a.name from action_plans_private.eligible_assignees(p_unit,p_sector) a
 where strpos(lower(a.name),lower(btrim(coalesce(p_query,''))))>0 order by a.name,a.id limit 50;
end $$;

create function action_plans_private.check_assignee(p_responsible uuid,p_unit uuid,p_sector uuid)
returns void language plpgsql set search_path='' as $$
begin
 if p_responsible is null or not exists(
  select from action_plans_private.eligible_assignees(p_unit,p_sector) a where a.id=p_responsible
 ) then
  raise exception 'plans_ready: eligible assignee required' using errcode='23514';
 end if;
end $$;

-- A sobrecarga aceita o UUID. A assinatura anterior continua atendendo clientes antigos,
-- preservando texto legado e a delegação atual em edições.
create function action_plans.create_manual_plan(p_unit uuid,p_sector uuid,p_improvement_point text,
 p_responsible_id uuid,p_action text default '',p_how_to text default '',p_due_date date default null,
 p_effectiveness_criterion text default '',p_monitoring_start date default null,p_monitoring_end date default null,
 p_expected_evidence text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare r action_plans.plans;
begin
 perform 1 from core.units where id=p_unit for share;
 if p_sector is not null then perform 1 from core.sectors where id=p_sector for share; end if;
 perform action_plans_private.authorize('action_plan.create_manual',p_unit,p_sector);
 perform 1 from core.units where id=p_unit and active;
 if not found then raise exception 'Inactive unit' using errcode='23514'; end if;
 if p_sector is not null then
  perform 1 from core.sectors s join core.unit_sectors us on us.sector_id=s.id and us.unit_id=p_unit where s.id=p_sector and s.active;
  if not found then raise exception 'Invalid sector for unit' using errcode='23514'; end if;
 end if;
 if p_responsible_id is not null then perform action_plans_private.check_assignee(p_responsible_id,p_unit,p_sector); end if;
 insert into action_plans.plans(unit_id,sector_id,source_type,improvement_point,action,how_to,responsible_id,due_date,
  effectiveness_criterion,monitoring_start,monitoring_end,expected_evidence)
 values(p_unit,p_sector,'manual',btrim(p_improvement_point),coalesce(btrim(p_action),''),coalesce(btrim(p_how_to),''),p_responsible_id,p_due_date,
  coalesce(btrim(p_effectiveness_criterion),''),p_monitoring_start,p_monitoring_end,coalesce(btrim(p_expected_evidence),''))
 returning * into r;
 perform action_plans_private.log('create',r,null,'{"source":"manual"}');
 return r.id;
end $$;

create or replace function action_plans.create_manual_plan(p_unit uuid,p_sector uuid,p_improvement_point text,
 p_action text default '',p_how_to text default '',p_responsible text default '',p_due_date date default null,
 p_effectiveness_criterion text default '',p_monitoring_start date default null,p_monitoring_end date default null,
 p_expected_evidence text default '') returns uuid
language sql security invoker set search_path='' as $$
 select action_plans.create_manual_plan(p_unit,p_sector,p_improvement_point,null::uuid,p_action,p_how_to,p_due_date,
  p_effectiveness_criterion,p_monitoring_start,p_monitoring_end,p_expected_evidence)
$$;

create function action_plans.update_plan(p_id uuid,p_version integer,p_improvement_point text,p_action text,p_how_to text,
 p_responsible_id uuid,p_due_date date,p_effectiveness_criterion text,p_monitoring_start date,p_monitoring_end date,p_expected_evidence text)
returns void language plpgsql security definer set search_path='' as $$
declare b action_plans.plans; r action_plans.plans;
begin
 b=action_plans_private.lock_plan(p_id,p_version,'action_plan.write',false);
 if p_responsible_id is distinct from b.responsible_id and (p_responsible_id is not null or b.status<>'pending') then
  perform action_plans_private.check_assignee(p_responsible_id,b.unit_id,b.sector_id);
 end if;
 update action_plans.plans set
  improvement_point=case when b.source_type='manual' then btrim(p_improvement_point) else improvement_point end,
  action=coalesce(btrim(p_action),''),how_to=coalesce(btrim(p_how_to),''),responsible_id=p_responsible_id,
  due_date=p_due_date,effectiveness_criterion=coalesce(btrim(p_effectiveness_criterion),''),
  monitoring_start=p_monitoring_start,monitoring_end=p_monitoring_end,expected_evidence=coalesce(btrim(p_expected_evidence),'')
 where id=p_id returning * into r;
 perform action_plans_private.log('update',r,to_jsonb(b));
end $$;

create or replace function action_plans.update_plan(p_id uuid,p_version integer,p_improvement_point text,p_action text,p_how_to text,
 p_responsible text,p_due_date date,p_effectiveness_criterion text,p_monitoring_start date,p_monitoring_end date,p_expected_evidence text)
returns void language plpgsql security definer set search_path='' as $$
declare b action_plans.plans;
begin
 b=action_plans_private.lock_plan(p_id,p_version,'action_plan.write',false);
 perform action_plans.update_plan(p_id,p_version,p_improvement_point,p_action,p_how_to,b.responsible_id,p_due_date,
  p_effectiveness_criterion,p_monitoring_start,p_monitoring_end,p_expected_evidence);
end $$;

-- A capacidade write conserva a execução gerencial, inclusive para papéis personalizados.
-- execute dá capacidade apenas sobre o plano atribuído, sem elevar outros grants.
create function action_plans_private.authorize_execution(p action_plans.plans)
returns void language plpgsql set search_path='' as $$
begin
 if private.has_scoped_permission('action_plan.write',p.unit_id,p.sector_id) then
  perform action_plans_private.authorize('action_plan.write',p.unit_id,p.sector_id);
 else
  if p.responsible_id is null or p.responsible_id is distinct from auth.uid() then
   raise exception 'Forbidden' using errcode='42501';
  end if;
  perform action_plans_private.authorize('action_plan.execute',p.unit_id,p.sector_id);
 end if;
end $$;

create or replace function action_plans.set_plan_status(p_id uuid,p_version integer,p_status text)
returns void language plpgsql security definer set search_path='' as $$
declare b action_plans.plans; r action_plans.plans;
begin
 select * into b from action_plans.plans where id=p_id for update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_status='completed' or b.status='completed' then
  perform action_plans_private.authorize_execution(b);
  perform action_plans_private.authorize('action_plan.complete',b.unit_id,b.sector_id);
 elsif b.status='pending' and p_status='in_progress' then
  perform action_plans_private.authorize_execution(b);
 else
  perform action_plans_private.authorize('action_plan.write',b.unit_id,b.sector_id);
 end if;
 if b.version is distinct from p_version then raise exception 'Concurrent change' using errcode='40001'; end if;
 if b.effectiveness is not null then raise exception 'Verified plan is locked' using errcode='55000'; end if;
 if p_status is null or p_status not in ('pending','in_progress','completed') or p_status=b.status then
  raise exception 'Invalid status transition' using errcode='23514';
 end if;
 if b.status='pending' then perform action_plans_private.check_assignee(b.responsible_id,b.unit_id,b.sector_id); end if;
 update action_plans.plans set status=p_status,
  completed_at=case when p_status='completed' then clock_timestamp() end,
  completed_by=case when p_status='completed' then auth.uid() end
 where id=p_id returning * into r;
 perform action_plans_private.log('status',r,to_jsonb(b));
end $$;

create function action_plans.save_execution_report(p_plan uuid,p_version integer,p_report text)
returns void language plpgsql security definer set search_path='' as $$
declare p action_plans.plans; report text:=btrim(coalesce(p_report,''));
begin
 select * into p from action_plans.plans where id=p_plan for update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 perform action_plans_private.authorize_execution(p);
 if p.version is distinct from p_version then raise exception 'Concurrent change' using errcode='40001'; end if;
 if p.status<>'in_progress' then raise exception 'Plan is not in progress' using errcode='55000'; end if;
 if char_length(p_report)>2000 then raise exception 'Execution report exceeds 2000 characters' using errcode='23514'; end if;
 -- Incremento da versão e barreiras de ambas as operações de exclusão.
 update action_plans.plans set version=p.version where id=p.id returning * into p;
 insert into action_plans_private.execution_reports(plan_id,version,report,saved_by) values (p.id,p.version,report,auth.uid());
 insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,unit_id,sector_id,metadata)
 values(auth.uid(),'action_plans','execution_report_save','plan',p.id::text,p.unit_id,p.sector_id,jsonb_build_object('version',p.version));
end $$;

create function action_plans.execution_report_history(p_plan uuid,p_before_version integer default null)
returns table(version integer,report text,saved_by uuid,saved_by_name text,saved_at timestamptz)
language sql stable security definer set search_path='' as $$
 select e.version,e.report,e.saved_by,pr.display_name,e.saved_at
 from action_plans_private.execution_reports e join action_plans.plans p on p.id=e.plan_id
 join core.profiles pr on pr.id=e.saved_by
 where p.id=p_plan and (p_before_version is null or e.version<p_before_version)
 and action_plans_private.can_read_plan(p.unit_id,p.sector_id,p.responsible_id)
 and action_plans_private.plan_is_intact(p.id,p.source_inspection_id)
 order by e.version desc
$$;

-- Substitui a função paginada para acrescentar o nome resolvido no Core.
drop function action_plans.plan_summaries_page(timestamptz,uuid,uuid,uuid);
create function action_plans.plan_summaries_page(
 p_before_created_at timestamptz,p_before_id uuid,
 p_plan uuid default null,p_inspection uuid default null)
returns table(plan action_plans.plans,unit_name text,sector_name text,inspection_applied_on date,item_number integer,verified_by_name text,completed_by_name text,responsible_name text)
language sql stable security definer set search_path='' as $$
 select p,u.name,s.name,i.applied_on,c.number,vp.display_name,cp.display_name,rp.display_name
 from action_plans.plans p join core.units u on u.id=p.unit_id
 left join core.sectors s on s.id=p.sector_id
 left join audit.inspections i on i.id=p.source_inspection_id
 left join audit.checklist_items c on c.template_version=i.template_version and c.key=p.source_item_key
 left join core.profiles vp on vp.id=p.verified_by
 left join core.profiles cp on cp.id=p.completed_by
 left join core.profiles rp on rp.id=p.responsible_id
 where action_plans_private.plan_is_intact(p.id,p.source_inspection_id)
 and action_plans_private.can_read_plan(p.unit_id,p.sector_id,p.responsible_id)
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
 and action_plans_private.can_read_plan(p.unit_id,p.sector_id,p.responsible_id)
 and action_plans_private.plan_is_intact(p.id,p.source_inspection_id)
 order by e.kind,e.verification_round nulls first,e.uploaded_at,e.id
$$;

create or replace function action_plans.plan_summaries(p_plan uuid default null,p_inspection uuid default null)
returns table(plan action_plans.plans,unit_name text,sector_name text,inspection_applied_on date,item_number integer,verified_by_name text,completed_by_name text)
language sql stable security definer set search_path='' as $$
 select s.plan,s.unit_name,s.sector_name,s.inspection_applied_on,s.item_number,s.verified_by_name,s.completed_by_name
 from action_plans.plan_summaries_page(null,null,p_plan,p_inspection) s
$$;

create or replace function action_plans_private.lock_evidence_plan(p_plan uuid,p_kind text) returns action_plans.plans
language plpgsql security definer set search_path='' as $$
declare p action_plans.plans;
begin
 select * into p from action_plans.plans where id=p_plan for update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_kind='execution' then
  perform action_plans_private.authorize_execution(p);
  if p.status<>'in_progress' and not private.has_scoped_permission('action_plan.write',p.unit_id,p.sector_id) then
   raise exception 'Plan is not in progress' using errcode='55000';
  end if;
 else
  perform action_plans_private.authorize('action_plan.verify',p.unit_id,p.sector_id);
 end if;
 return p;
end $$;
create or replace function action_plans.remove_evidence(p_evidence uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e action_plans.evidence; r action_plans.evidence; p action_plans.plans;
begin
 select * into e from action_plans.evidence where id=p_evidence;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 p=action_plans_private.lock_evidence_plan(e.plan_id,e.kind);
 select * into e from action_plans.evidence where id=p_evidence for update;
 if e.kind='execution' and e.created_by is distinct from auth.uid()
   and not private.has_scoped_permission('action_plan.write',p.unit_id,p.sector_id) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 if e.status='pending' then raise exception 'Forbidden' using errcode='42501'; end if;
 if e.status='removed' then return; end if;
 perform action_plans_private.check_evidence_change(p,e.kind,e.verification_round,false);
 update action_plans.evidence set status='removed',removed_by=auth.uid(),removed_at=clock_timestamp() where id=e.id returning * into r;
 perform action_plans_private.log_evidence('evidence_remove',p,r,action_plans_private.evidence_snapshot(e));
end $$;

-- Available evidence of a readable plan, with uploader names the reader may lack Core access to.
create or replace function action_plans_private.can_upload_evidence_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from action_plans.evidence e join action_plans.plans p on p.id=e.plan_id
  where e.object_key=p_name and e.status='pending' and e.created_by=auth.uid() and e.created_at>now()-interval '1 hour'
  and action_plans_private.plan_is_intact(p.id,p.source_inspection_id)
  and case when e.kind='execution' then
    private.has_scoped_permission('action_plan.write',p.unit_id,p.sector_id)
    or (p.status='in_progress' and p.responsible_id=auth.uid()
      and private.has_scoped_permission('action_plan.execute',p.unit_id,p.sector_id)
      and storage.allow_only_operation('storage.object.upload'))
   else private.has_scoped_permission('action_plan.verify',p.unit_id,p.sector_id) end
  and action_plans_private.evidence_change_error(p,e.kind,e.verification_round,true) is null)
$$;

create or replace function action_plans_private.can_read_evidence_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from action_plans.evidence e join action_plans.plans p on p.id=e.plan_id
  where e.object_key=p_name and e.status='available'
  and action_plans_private.plan_is_intact(p.id,p.source_inspection_id)
  and (
   private.has_scoped_permission('action_plan.read',p.unit_id,p.sector_id)
   or (p.responsible_id=auth.uid()
       and private.has_scoped_permission('action_plan.execute',p.unit_id,p.sector_id)
       and storage.allow_only_operation('storage.object.get_authenticated'))
  ))
$$;

alter policy plans_read on action_plans.plans using (
  action_plans_private.can_read_plan(unit_id,sector_id,responsible_id)
  and action_plans_private.plan_is_intact(id,source_inspection_id)
);

-- A política de plans também filtra o escopo e as duas operações de exclusão.
alter policy evidence_read on action_plans.evidence using (
 status='available' and exists(select from action_plans.plans p where p.id=plan_id)
);

revoke all on function action_plans_private.can_read_plan(uuid,uuid,uuid),
 action_plans_private.eligible_assignees(uuid,uuid),action_plans_private.check_assignee(uuid,uuid,uuid),
 action_plans_private.authorize_execution(action_plans.plans),
 action_plans.plan_summaries_page(timestamptz,uuid,uuid,uuid),
 action_plans.search_assignees(uuid,uuid,text,uuid),
 action_plans.create_manual_plan(uuid,uuid,text,uuid,text,text,date,text,date,date,text),
 action_plans.update_plan(uuid,integer,text,text,text,uuid,date,text,date,date,text),
 action_plans.save_execution_report(uuid,integer,text),action_plans.execution_report_history(uuid,integer)
 from public,anon,authenticated;
grant execute on function action_plans_private.can_read_plan(uuid,uuid,uuid),
 action_plans.plan_summaries_page(timestamptz,uuid,uuid,uuid),
 action_plans.search_assignees(uuid,uuid,text,uuid),
 action_plans.create_manual_plan(uuid,uuid,text,uuid,text,text,date,text,date,date,text),
 action_plans.update_plan(uuid,integer,text,text,text,uuid,date,text,date,date,text),
 action_plans.save_execution_report(uuid,integer,text),action_plans.execution_report_history(uuid,integer)
 to authenticated;

commit;
