begin;
-- Audit business module. Depends on Core; Core never references this schema.
create schema audit;
create schema audit_private;
revoke all on schema audit, audit_private from public;
grant usage on schema audit to authenticated;

-- Immutable, versioned checklist catalog. Owned by migrations; clients only read it.
create table audit.checklist_templates (
 version text primary key, name text not null, item_count integer not null check(item_count>0),
 active boolean not null default false, created_at timestamptz not null default now()
);
create unique index checklist_single_active on audit.checklist_templates((true)) where active;
create table audit.checklist_sections (
 template_version text not null references audit.checklist_templates(version), key text not null,
 position integer not null check(position>0), name text not null,
 primary key(template_version,key), unique(template_version,position)
);
create table audit.checklist_items (
 template_version text not null, key text not null check(key ~ '^item-[0-9]{3}$'), section_key text not null,
 position integer not null check(position>0), number integer not null check(number>0), text text not null,
 primary key(template_version,key), unique(template_version,position), unique(template_version,number),
 foreign key(template_version,section_key) references audit.checklist_sections(template_version,key)
);

create table audit.inspections (
 id uuid primary key default gen_random_uuid(),
 unit_id uuid not null references core.units(id),
 template_version text not null references audit.checklist_templates(version),
 applied_on date not null, previous_visit_on date check(previous_visit_on<=applied_on),
 responsible_id uuid not null references core.profiles(id),
 status text not null default 'draft' check(status in ('draft','finalized')),
 final_score numeric check(final_score between 0 and 100),
 final_classification text check(final_classification in ('adequate','partial','inadequate')),
 finalized_at timestamptz, finalized_by uuid references core.profiles(id),
 version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 created_by uuid references core.profiles(id) default auth.uid(), updated_by uuid references core.profiles(id) default auth.uid(),
 unique(id,template_version),
 check((status='draft' and final_score is null and final_classification is null and finalized_at is null and finalized_by is null)
 or (status='finalized' and finalized_at is not null and (final_score is null)=(final_classification is null)))
);
create index inspections_unit_history on audit.inspections(unit_id,applied_on desc,created_at desc);
create index inspections_drafts on audit.inspections(unit_id) where status='draft';
create table audit.inspection_answers (
 inspection_id uuid not null, template_version text not null, item_key text not null,
 response text check(response in ('AT','AP','NAT','NAP')),
 observation text not null default '' check(length(observation)<=2000),
 version integer not null default 1,
 updated_at timestamptz not null default now(), updated_by uuid references core.profiles(id),
 primary key(inspection_id,item_key),
 foreign key(inspection_id,template_version) references audit.inspections(id,template_version),
 foreign key(template_version,item_key) references audit.checklist_items(template_version,key)
);

-- Scoring: identical to apps/web/src/modules/audit/scoring.ts.
-- Integer numerator keeps threshold comparisons exact; NAP and unanswered are excluded.
create function audit_private.conformity(p_at bigint,p_ap bigint,p_nat bigint) returns numeric language sql immutable set search_path='' as $$
 select case when p_at+p_ap+p_nat=0 then null else (100*p_at+50*p_ap)::numeric/(p_at+p_ap+p_nat) end
$$;
create function audit_private.classify(p_score numeric) returns text language sql immutable set search_path='' as $$
 select case when p_score is null then null when p_score>=76 then 'adequate' when p_score>=51 then 'partial' else 'inadequate' end
$$;
create function audit_private.log(p_action text,p_row audit.inspections,p_before jsonb) returns void language sql security definer set search_path='' as $$
 insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,unit_id,before_data,after_data)
 values(auth.uid(),'audit',p_action,'inspection',p_row.id::text,p_row.unit_id,p_before,to_jsonb(p_row))
$$;

create function audit_private.forbid_catalog_change() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='checklist_templates' and tg_op='UPDATE' and (to_jsonb(new)-'active')=(to_jsonb(old)-'active') then return new; end if;
 raise exception 'Checklist catalog is immutable; create a new template version' using errcode='55000';
end $$;
create trigger immutable_catalog before update or delete on audit.checklist_templates for each row execute function audit_private.forbid_catalog_change();
create trigger immutable_catalog before update or delete on audit.checklist_sections for each row execute function audit_private.forbid_catalog_change();
create trigger immutable_catalog before update or delete on audit.checklist_items for each row execute function audit_private.forbid_catalog_change();

create function audit_private.touch_inspection() returns trigger language plpgsql set search_path='' as $$
begin
 new.updated_at=clock_timestamp(); new.updated_by=auth.uid(); new.version=old.version+1;
 return new;
end $$;
create trigger touch_inspection before update on audit.inspections for each row execute function audit_private.touch_inspection();
-- Serializes answer writes with finalize/reopen: an answer cannot change once the parent is finalized.
create function audit_private.guard_answer() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from audit.inspections where id=new.inspection_id and status='draft' for share;
 if not found then raise exception 'Inspection is not editable' using errcode='40001'; end if;
 new.updated_at=clock_timestamp(); new.updated_by=auth.uid(); new.version=old.version+1;
 return new;
end $$;
create trigger guard_answer before update on audit.inspection_answers for each row execute function audit_private.guard_answer();

-- Grants: catalog/inspections are read-only through the Data API; answers expose only response/observation.
grant select on all tables in schema audit to authenticated;
grant update(response,observation) on audit.inspection_answers to authenticated;
do $$ declare t text; begin
 foreach t in array array['checklist_templates','checklist_sections','checklist_items','inspections','inspection_answers'] loop
 execute format('alter table audit.%I enable row level security',t);
 end loop;
end $$;
-- Catalog holds no unit data: readable by active users holding any Audit permission in any scope.
create policy catalog_read on audit.checklist_templates for select to authenticated using(exists(select 1 from core.my_access() a where a.permission like 'audit.%'));
create policy catalog_read on audit.checklist_sections for select to authenticated using(exists(select 1 from core.my_access() a where a.permission like 'audit.%'));
create policy catalog_read on audit.checklist_items for select to authenticated using(exists(select 1 from core.my_access() a where a.permission like 'audit.%'));
-- Inspections are unit-wide resources: sector-scoped assignments do not cover them (ADR-005).
create policy inspections_read on audit.inspections for select to authenticated using(private.has_unit_permission('audit.inspection.read',unit_id));
create policy answers_read on audit.inspection_answers for select to authenticated using(exists(
 select 1 from audit.inspections i where i.id=inspection_id and private.has_unit_permission('audit.inspection.read',i.unit_id)));
create policy answers_edit on audit.inspection_answers for update to authenticated
 using(exists(select 1 from audit.inspections i where i.id=inspection_id and i.status='draft' and private.has_unit_permission('audit.inspection.edit',i.unit_id)))
 with check(exists(select 1 from audit.inspections i where i.id=inspection_id and i.status='draft' and private.has_unit_permission('audit.inspection.edit',i.unit_id)));

-- Units the caller may see or create inspections for. Audit read contract over Core units.
create function audit.units() returns table(id uuid,code text,name text,active boolean)
language sql stable security definer set search_path='' as $$
 select u.id,u.code,u.name,u.active from core.units u
 where private.has_unit_permission('audit.inspection.read',u.id) or private.has_unit_permission('audit.inspection.create',u.id)
 order by u.name
$$;
-- Inspection summaries with progress/counts. p_overview keeps drafts and the two latest finalized per unit.
create function audit.inspection_summaries(p_unit uuid default null,p_inspection uuid default null,p_overview boolean default false)
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
  from audit.inspections i join core.units u on u.id=i.unit_id join core.profiles p on p.id=i.responsible_id
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

-- Atomic creation: one inspection plus one unanswered row per item of the active template.
create function audit.create_inspection(p_unit uuid,p_applied_on date,p_previous_visit_on date default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare t audit.checklist_templates; r audit.inspections; n integer;
begin
 if not private.has_unit_permission('audit.inspection.create',p_unit) then raise exception 'Forbidden' using errcode='42501'; end if;
 perform 1 from core.units where id=p_unit and active for share;
 if not found then raise exception 'Inactive unit' using errcode='23514'; end if;
 select * into t from audit.checklist_templates where active;
 if not found then raise exception 'No active checklist template' using errcode='55000'; end if;
 insert into audit.inspections(unit_id,template_version,applied_on,previous_visit_on,responsible_id)
 values(p_unit,t.version,coalesce(p_applied_on,current_date),p_previous_visit_on,auth.uid()) returning * into r;
 insert into audit.inspection_answers(inspection_id,template_version,item_key,updated_by)
 select r.id,t.version,i.key,auth.uid() from audit.checklist_items i where i.template_version=t.version;
 get diagnostics n=row_count;
 if n<>t.item_count then raise exception 'Checklist template is incomplete' using errcode='55000'; end if;
 perform audit_private.log('create',r,null);
 return r.id;
end $$;
create function audit.finalize_inspection(p_id uuid,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare r audit.inspections; b audit.inspections; t integer; c record; s numeric;
begin
 select * into b from audit.inspections where id=p_id for update;
 if not found or not private.has_unit_permission('audit.inspection.finalize',b.unit_id) then raise exception 'Forbidden' using errcode='42501'; end if;
 if b.version is distinct from p_version or b.status<>'draft' then raise exception 'Concurrent change' using errcode='40001'; end if;
 select item_count into t from audit.checklist_templates where version=b.template_version;
 select count(*) total,count(response) answered,count(*) filter(where response='AT') at,
 count(*) filter(where response='AP') ap,count(*) filter(where response='NAT') nat
 into c from audit.inspection_answers where inspection_id=p_id;
 if c.total<>t or c.answered<>t then raise exception 'Inspection incomplete' using errcode='23514'; end if;
 s=audit_private.conformity(c.at,c.ap,c.nat);
 update audit.inspections set status='finalized',final_score=s,final_classification=audit_private.classify(s),
 finalized_at=clock_timestamp(),finalized_by=auth.uid() where id=p_id returning * into r;
 perform audit_private.log('finalize',r,to_jsonb(b));
end $$;
create function audit.reopen_inspection(p_id uuid,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare r audit.inspections; b audit.inspections;
begin
 select * into b from audit.inspections where id=p_id for update;
 if not found or not private.has_unit_permission('audit.inspection.reopen',b.unit_id) then raise exception 'Forbidden' using errcode='42501'; end if;
 if b.version is distinct from p_version or b.status<>'finalized' then raise exception 'Concurrent change' using errcode='40001'; end if;
 update audit.inspections set status='draft',final_score=null,final_classification=null,finalized_at=null,finalized_by=null
 where id=p_id returning * into r;
 perform audit_private.log('reopen',r,to_jsonb(b));
end $$;

revoke all on all functions in schema audit,audit_private from public,anon,authenticated;
grant execute on function audit.units(),audit.inspection_summaries(uuid,uuid,boolean),audit.create_inspection(uuid,date,date),
 audit.finalize_inspection(uuid,integer),audit.reopen_inspection(uuid,integer) to authenticated;
commit;
