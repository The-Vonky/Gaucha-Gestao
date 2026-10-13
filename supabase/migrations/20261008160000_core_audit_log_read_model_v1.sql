begin;
-- Human-readable read model of core.system_audit_log for Administration Logs. Additive: no table,
-- column, policy or event changes; the log stays append-only and is never written here.
--
-- SECURITY INVOKER on purpose: every row comes through the caller's own RLS. Events through
-- logs_read (admin.audit_log.read covering the event's unit/sector); actor names through
-- profiles_read; unit and sector labels through units_read/sectors_read. A reference the caller
-- cannot read comes back as an id with label_source 'unavailable', the same shape as one without a
-- name, so the projection never confirms what RLS hides. Events carry no name snapshot, so labels
-- are always the current authorized ones ('current'); old events are not rewritten.
--
-- The actor name search only matches profiles the caller already reads: it narrows visible events
-- and cannot reach the directory (no e-mail, no Auth data, no users without visible events).
-- Interval is [p_from,p_to). For stable pages the client pins p_to on the first page.
create function core.audit_log_page(
 p_limit integer default 25,p_offset integer default 0,
 p_from timestamptz default null,p_to timestamptz default null,
 p_actor uuid default null,p_actor_search text default null,
 p_module text default null,p_action text default null,
 p_entity_type text default null,p_entity_id text default null)
returns table(id uuid,occurred_at timestamptz,actor_user_id uuid,actor_display_name text,actor_active boolean,
 actor_label_source text,module text,action text,entity_type text,entity_id text,
 unit_id uuid,unit_code text,unit_name text,unit_active boolean,unit_label_source text,
 sector_id uuid,sector_code text,sector_name text,sector_active boolean,sector_label_source text,
 before_data jsonb,after_data jsonb,metadata jsonb,correlation_id text,total_count bigint)
language plpgsql stable security invoker set search_path='' as $$
declare
 v_search text=nullif(btrim(p_actor_search),'');
 v_module text=nullif(btrim(p_module),'');
 v_action text=nullif(btrim(p_action),'');
 v_entity_type text=nullif(btrim(p_entity_type),'');
 v_entity_id text=nullif(btrim(p_entity_id),'');
 v_pattern text;
begin
 if not exists(select 1 from core.my_access() a where a.permission='admin.audit_log.read') then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0
  or (p_from is not null and p_to is not null and p_from>=p_to)
  or greatest(length(v_search),length(v_module),length(v_action),length(v_entity_type),length(v_entity_id))>160 then
  raise exception 'Invalid filter' using errcode='22023';
 end if;
 -- LIKE wildcards typed by the user are matched literally.
 if v_search is not null then
  v_pattern='%'||replace(replace(replace(v_search,'\','\\'),'%','\%'),'_','\_')||'%';
 end if;
 return query
 select l.id,l.occurred_at,l.actor_user_id,p.display_name,p.active,
  case when l.actor_user_id is null then null when p.id is null then 'unavailable' else 'current' end,
  l.module,l.action,l.entity_type,l.entity_id,
  l.unit_id,u.code,u.name,u.active,
  case when l.unit_id is null then null when u.id is null then 'unavailable' else 'current' end,
  l.sector_id,s.code,s.name,s.active,
  case when l.sector_id is null then null when s.id is null then 'unavailable' else 'current' end,
  l.before_data,l.after_data,l.metadata,l.correlation_id,count(*) over()
 from core.system_audit_log l
 left join core.profiles p on p.id=l.actor_user_id
 left join core.units u on u.id=l.unit_id
 left join core.sectors s on s.id=l.sector_id
 where (p_from is null or l.occurred_at>=p_from)
  and (p_to is null or l.occurred_at<p_to)
  and (p_actor is null or l.actor_user_id=p_actor)
  and (v_pattern is null or p.display_name ilike v_pattern)
  and (v_module is null or l.module=v_module)
  and (v_action is null or l.action=v_action)
  and (v_entity_type is null or l.entity_type=v_entity_type)
  and (v_entity_id is null or l.entity_id=v_entity_id)
 order by l.occurred_at desc,l.id desc
 limit p_limit offset p_offset;
end $$;
revoke all on function core.audit_log_page(integer,integer,timestamptz,timestamptz,uuid,text,text,text,text,text) from public,anon;
grant execute on function core.audit_log_page(integer,integer,timestamptz,timestamptz,uuid,text,text,text,text,text) to authenticated;

-- "Logs of this record" filters by exact entity; keep it off a full log scan.
create index audit_log_entity on core.system_audit_log(entity_type,entity_id,occurred_at desc);
commit;
