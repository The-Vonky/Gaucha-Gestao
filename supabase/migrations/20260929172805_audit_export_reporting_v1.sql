begin;

-- Each report is built by one SELECT in a SECURITY DEFINER function. All joins,
-- permission predicates, counts and JSON aggregates see that statement's snapshot.
-- No client-visible intermediate rows or service credential are involved.
create function audit.inspection_export(p_inspection uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare payload jsonb;
begin
 with target as (
  select i.*, u.code unit_code, u.name unit_name, p.display_name responsible_name,
         f.display_name finalized_by_name, caller.display_name generated_by_name
  from audit.inspections i
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

create function audit.unit_history_export(p_unit uuid,p_from date default null,p_to date default null)
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
  select i.* from audit.inspections i join target t on t.id=i.unit_id
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
    select old.final_score from audit.inspections old
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

revoke all on function audit.inspection_export(uuid),audit.unit_history_export(uuid,date,date)
from public,anon,authenticated;
grant execute on function audit.inspection_export(uuid),audit.unit_history_export(uuid,date,date)
to authenticated;
commit;
