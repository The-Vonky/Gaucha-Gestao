begin;
-- As projeções normais e os relatórios só leem auditorias íntegras.
-- O histórico da unidade consulta as operações em curso por contrato separado.
create view audit_private.intact_inspections as
select i.* from audit.inspections i where not exists
  (select from audit_private.inspection_deletions j where j.inspection_id=i.id);
revoke all on audit_private.intact_inspections from public,anon,authenticated;

create or replace function audit.inspection_summaries(p_unit uuid default null,p_inspection uuid default null,p_overview boolean default false)
returns table(id uuid,unit_id uuid,unit_name text,template_version text,applied_on date,previous_visit_on date,
 responsible_id uuid,responsible_name text,status text,final_score numeric,final_classification text,
 finalized_at timestamptz,version integer,created_at timestamptz,total_items integer,answered integer,
 at_count integer,ap_count integer,nat_count integer,nap_count integer)
language sql stable security definer set search_path='' as $$
 select s.id,s.unit_id,s.unit_name,s.template_version,s.applied_on,s.previous_visit_on,s.responsible_id,s.responsible_name,
 s.status,s.final_score,s.final_classification,s.finalized_at,s.version,s.created_at,
 c.total_items,c.answered,c.at_count,c.ap_count,c.nat_count,c.nap_count
 from (
  select i.*,u.name unit_name,p.display_name responsible_name,
  row_number() over(partition by i.unit_id,i.status order by i.applied_on desc,i.created_at desc) status_rank
  from audit_private.intact_inspections i join core.units u on u.id=i.unit_id join core.profiles p on p.id=i.responsible_id
  where private.has_unit_permission('audit.inspection.read',i.unit_id)
  and (p_unit is null or i.unit_id=p_unit) and (p_inspection is null or i.id=p_inspection)
 ) s
 cross join lateral (
  select count(*)::integer total_items,count(a.response)::integer answered,
  count(*) filter(where a.response='AT')::integer at_count,count(*) filter(where a.response='AP')::integer ap_count,
  count(*) filter(where a.response='NAT')::integer nat_count,count(*) filter(where a.response='NAP')::integer nap_count
  from audit.inspection_answers a where a.inspection_id=s.id
 ) c
 where not p_overview or s.status='draft' or s.status_rank<=2
 order by s.applied_on desc,s.created_at desc
$$;

create or replace function action_plans.plan_summaries(p_plan uuid default null,p_inspection uuid default null)
returns table(plan action_plans.plans,unit_name text,sector_name text,inspection_applied_on date,item_number integer,verified_by_name text,completed_by_name text)
language sql stable security definer set search_path='' as $$
 select p,u.name,s.name,i.applied_on,c.number,vp.display_name,cp.display_name
 from action_plans.plans p join core.units u on u.id=p.unit_id
 left join core.sectors s on s.id=p.sector_id
 left join audit.inspections i on i.id=p.source_inspection_id
 left join audit.checklist_items c on c.template_version=i.template_version and c.key=p.source_item_key
 left join core.profiles vp on vp.id=p.verified_by
 left join core.profiles cp on cp.id=p.completed_by
 where not exists(select from audit_private.inspection_deletions j where j.inspection_id=p.source_inspection_id)
 and private.has_scoped_permission('action_plan.read',p.unit_id,p.sector_id)
 and (p_plan is null or p.id=p_plan) and (p_inspection is null or p.source_inspection_id=p_inspection)
 order by p.created_at desc,p.id
$$;

create or replace function audit.inspection_export(p_inspection uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare payload jsonb;
begin
 with target as (
  select i.*, u.code unit_code, u.name unit_name, p.display_name responsible_name,
         f.display_name finalized_by_name, caller.display_name generated_by_name
  from audit_private.intact_inspections i
  join core.units u on u.id=i.unit_id
  join core.profiles p on p.id=i.responsible_id
  join core.profiles caller on caller.id=auth.uid() and caller.active
  left join core.profiles f on f.id=i.finalized_by
  where i.id=p_inspection
    and private.has_unit_permission('audit.inspection.read',i.unit_id)
    and private.has_unit_permission('audit.inspection.export',i.unit_id)
 ), criteria as (
  select s.key section_key, s.position section_position, s.name section_name,
         c.key, c.position, c.number, c.text,
         a.response, a.observation, a.version answer_version, a.updated_at answer_updated_at
  from target t
  join audit.checklist_sections s on s.template_version=t.template_version
  join audit.checklist_items c on c.template_version=s.template_version and c.section_key=s.key
  left join audit.inspection_answers a on a.inspection_id=t.id and a.item_key=c.key
 ), section_counts as (
  select section_key, section_position, section_name,
         count(*)::integer total,
         count(response)::integer answered,
         count(*) filter(where response='AT')::integer at_count,
         count(*) filter(where response='AP')::integer ap_count,
         count(*) filter(where response='NAT')::integer nat_count,
         count(*) filter(where response='NAP')::integer nap_count,
         jsonb_agg(jsonb_build_object(
           'key',key,'position',position,'number',number,'text',text,
           'response',response,'observation',observation,
           'version',answer_version,'updated_at',answer_updated_at
         ) order by position,key) items
  from criteria group by section_key,section_position,section_name
 ), sections as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'key',section_key,'position',section_position,'name',section_name,
    'counts',jsonb_build_object('total',total,'answered',answered,'unanswered',total-answered,
      'applicable',at_count+ap_count+nat_count,'at',at_count,'ap',ap_count,'nat',nat_count,'nap',nap_count),
    'score',audit_private.conformity(at_count,ap_count,nat_count),
    'complete',answered=total,
    'classification',case when answered=total then
      audit_private.classify(audit_private.conformity(at_count,ap_count,nat_count)) else null end,
    'items',items
  ) order by section_position,section_key),'[]'::jsonb) data from section_counts
 ), counts as (
  select count(*)::integer total, count(response)::integer answered,
         count(*) filter(where response='AT')::integer at_count,
         count(*) filter(where response='AP')::integer ap_count,
         count(*) filter(where response='NAT')::integer nat_count,
         count(*) filter(where response='NAP')::integer nap_count
  from criteria
 )
 select jsonb_build_object(
   'schema_version',1,'kind','inspection','generated_at',
     to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'display_timezone','America/Sao_Paulo',
   'generated_by',jsonb_build_object('id',auth.uid(),'name',t.generated_by_name),
   'record_count',1,
   'unit',jsonb_build_object('id',t.unit_id,'code',t.unit_code,'name',t.unit_name),
   'inspection',jsonb_build_object(
     'id',t.id,'template_version',t.template_version,'applied_on',t.applied_on,
     'previous_visit_on',t.previous_visit_on,'responsible_id',t.responsible_id,
     'responsible_name',t.responsible_name,'status',t.status,
     'counts',jsonb_build_object('total',c.total,'answered',c.answered,'unanswered',c.total-c.answered,
       'applicable',c.at_count+c.ap_count+c.nat_count,
       'at',c.at_count,'ap',c.ap_count,'nat',c.nat_count,'nap',c.nap_count),
     'progress_percent',case when c.total=0 then 0 else 100*c.answered::numeric/c.total end,
     'score',case when t.status='finalized' then t.final_score else
       audit_private.conformity(c.at_count,c.ap_count,c.nat_count) end,
     'classification',case when t.status='finalized' then t.final_classification else null end,
     'finalized_at',t.finalized_at,'finalized_by',t.finalized_by,
     'finalized_by_name',t.finalized_by_name,
     'version',t.version,'created_at',t.created_at,'updated_at',t.updated_at
   ),'sections',s.data
 ) into payload
 from target t cross join counts c cross join sections s;
 if payload is null then raise exception 'Forbidden' using errcode='42501'; end if;
 return payload;
end $$;

create or replace function audit.unit_history_export(p_unit uuid,p_from date default null,p_to date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare payload jsonb; total integer;
begin
 with target as (
  select u.id,u.code,u.name,caller.display_name generated_by_name
  from core.units u
  join core.profiles caller on caller.id=auth.uid() and caller.active
  where u.id=p_unit
    and private.has_unit_permission('audit.inspection.read',u.id)
    and private.has_unit_permission('audit.inspection.export',u.id)
 ), filtered as (
  select i.* from audit_private.intact_inspections i join target t on t.id=i.unit_id
  where (p_from is null or i.applied_on>=p_from)
    and (p_to is null or i.applied_on<=p_to)
 ), bound as (select count(*)::integer n from filtered),
 summary as (
  select i.*, p.display_name responsible_name,
         c.total_items,c.answered,c.at_count,c.ap_count,c.nat_count,c.nap_count,
         previous.final_score previous_final_score
  from filtered i cross join bound b
  join core.profiles p on p.id=i.responsible_id
  cross join lateral (
    select count(*)::integer total_items,count(a.response)::integer answered,
      count(*) filter(where a.response='AT')::integer at_count,
      count(*) filter(where a.response='AP')::integer ap_count,
      count(*) filter(where a.response='NAT')::integer nat_count,
      count(*) filter(where a.response='NAP')::integer nap_count
    from audit.inspection_answers a where a.inspection_id=i.id
  ) c
  left join lateral (
    select old.final_score from audit_private.intact_inspections old
    where old.unit_id=i.unit_id and old.status='finalized' and old.final_score is not null
      and (old.applied_on,old.created_at,old.id)<(i.applied_on,i.created_at,i.id)
      and (p_from is null or old.applied_on>=p_from)
      and (p_to is null or old.applied_on<=p_to)
    order by old.applied_on desc,old.created_at desc,old.id desc limit 1
  ) previous on i.status='finalized'
  where b.n<=5000
 ), assembled as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'unit_id',s.unit_id,'template_version',s.template_version,
    'applied_on',s.applied_on,'previous_visit_on',s.previous_visit_on,
    'responsible_id',s.responsible_id,'responsible_name',s.responsible_name,
    'status',s.status,'counts',jsonb_build_object(
      'total',s.total_items,'answered',s.answered,'unanswered',s.total_items-s.answered,
      'applicable',s.at_count+s.ap_count+s.nat_count,
      'at',s.at_count,'ap',s.ap_count,'nat',s.nat_count,'nap',s.nap_count),
    'progress_percent',case when s.total_items=0 then 0 else 100*s.answered::numeric/s.total_items end,
    'score',case when s.status='finalized' then s.final_score else
       audit_private.conformity(s.at_count,s.ap_count,s.nat_count) end,
    'classification',case when s.status='finalized' then s.final_classification else null end,
    'finalized_at',s.finalized_at,'version',s.version,'created_at',s.created_at,
    'delta_pp',case when s.status='finalized' and s.final_score is not null
      and s.previous_final_score is not null then s.final_score-s.previous_final_score else null end
  ) order by s.applied_on desc,s.created_at desc,s.id desc),'[]'::jsonb) data from summary s
 )
 select jsonb_build_object(
   'schema_version',1,'kind','unit_history','generated_at',
     to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
   'display_timezone','America/Sao_Paulo',
   'generated_by',jsonb_build_object('id',auth.uid(),'name',t.generated_by_name),
   'unit',jsonb_build_object('id',t.id,'code',t.code,'name',t.name),
   'filters',jsonb_build_object('from',p_from,'to',p_to),
   'ordering','applied_on DESC, created_at DESC, id DESC',
   'record_count',b.n,'records',a.data
 ),b.n into payload,total
 from target t cross join bound b cross join assembled a;
 if payload is null then raise exception 'Forbidden' using errcode='42501'; end if;
 if total>5000 then raise exception 'Narrow the date range' using errcode='22023'; end if;
 return payload;
end $$;

create or replace function audit_private.claim_evidence_derivative() returns jsonb
language plpgsql security definer set search_path='' as $$
declare d audit.checklist_evidence_derivatives; e audit.checklist_evidence; decision timestamptz;
 queue_mode text:=nullif(current_setting('audit_derivative.queue_mode',true),'');
 scope_after timestamptz:=nullif(current_setting('audit_derivative.created_after',true),'')::timestamptz;
 scope_inspection uuid:=nullif(current_setting('audit_derivative.inspection_id',true),'')::uuid;
begin
 if queue_mode='global_new' then
  if scope_after is null or scope_inspection is not null or not isfinite(scope_after) or scope_after>clock_timestamp() then
   raise exception 'Invalid global new-upload scope' using errcode='42501'; end if;
 elsif queue_mode is null or queue_mode='inspection_new' then
  if (scope_after is null)<>(scope_inspection is null) or (queue_mode='inspection_new' and scope_after is null) then
   raise exception 'Invalid queue scope' using errcode='42501'; end if;
 else raise exception 'Unknown queue mode' using errcode='42501';
 end if;
 if not pg_try_advisory_xact_lock(16482002) then return null; end if;
 decision=clock_timestamp();
 update audit.checklist_evidence_derivatives set state='failed',lease_id=null,lease_until=null,error_code='derivative_generation_failed'
 where evidence_id not in (select frozen.id from audit.checklist_evidence frozen join audit_private.inspection_deletions j on j.inspection_id=frozen.inspection_id)
 and state='processing' and lease_until<=decision and attempts=5
 and (scope_after is null or (created_at>=scope_after and evidence_id in
 (select id from audit.checklist_evidence where (queue_mode='global_new' or inspection_id=scope_inspection) and created_at>=scope_after)));
 if exists(select 1 from audit.checklist_evidence_derivatives
 where state='processing' and lease_until>decision) then return null; end if;
 -- Primeiro trava evidência; mesma ordem da confirmação/remoção e do complete.
 select x.* into e from audit.checklist_evidence x
 join audit.checklist_evidence_derivatives j on j.evidence_id=x.id
 where not exists(select from audit_private.inspection_deletions j where j.inspection_id=x.inspection_id)
 and (scope_after is null or ((queue_mode='global_new' or x.inspection_id=scope_inspection) and x.created_at>=scope_after and j.created_at>=scope_after))
 and x.status='available' and x.content_type in ('image/jpeg','image/png')
 and j.state<>'ready' and j.attempts<5 and j.next_attempt_at<=decision
 and (j.lease_until is null or j.lease_until<=decision)
 order by j.next_attempt_at,j.created_at,x.id for update of x skip locked limit 1;
 if not found then return null; end if;
 update audit.checklist_evidence_derivatives set state='processing',attempts=attempts+1,
 lease_id=gen_random_uuid(),lease_until=decision+interval '2 minutes',error_code=null,
 original_sha256=null,derived_sha256=null,derived_object_key=null,mime=null,width=null,height=null,bytes=null,ready_at=null
 where evidence_id=e.id and encoder_version='img-480-v1' returning * into d;
 return jsonb_build_object('evidence',jsonb_build_object('id',e.id,'inspection_id',e.inspection_id,
 'object_key',e.object_key,'content_type',e.content_type,'size_bytes',e.size_bytes,'status',e.status),
 'lease',d.lease_id,'version',d.encoder_version);
end $$;
commit;
