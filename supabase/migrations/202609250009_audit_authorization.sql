begin;
-- 0004 checked Audit permissions from a snapshot taken before waiting on row locks (create
-- checked before the unit lock; answer writes relied on RLS evaluated at statement start),
-- so a revocation committed during the wait was not observed, and no Audit write held the
-- caller's authorization rows, so a revocation never waited for an authorized write.
-- Same hardening as 0007 for Action Plans, kept inside Audit (modules do not share internals):
-- lock the target rows, then the caller's authorization rows, then check with a fresh snapshot.

-- Locks the caller's profile, candidate assignments and their roles FOR SHARE until commit.
-- Profile deactivation, assignment revocation, role deactivation and save_role (which locks
-- the role FOR UPDATE before changing role_permissions) therefore either committed before
-- the check below, and are observed, or wait for this transaction. RBAC stays in Core.
create function audit_private.authorize(p_permission text,p_unit uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from core.profiles where id=auth.uid() and active for share;
 if found then
  perform 1 from core.user_role_assignments a where a.user_id=auth.uid() and a.active
   and (a.scope_type='global' or a.unit_id=p_unit) order by a.id for share;
  perform 1 from core.roles r where r.active and r.id in (select a.role_id from core.user_role_assignments a
   where a.user_id=auth.uid() and a.active and (a.scope_type='global' or a.unit_id=p_unit)) order by r.id for share;
 end if;
 -- Separate statement: a fresh READ COMMITTED snapshot taken after the locks above.
 if not private.has_unit_permission(p_permission,p_unit) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
end $$;

create or replace function audit.create_inspection(p_unit uuid,p_applied_on date,p_previous_visit_on date default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare t audit.checklist_templates; r audit.inspections; n integer;
begin
 -- Target row first, without revealing its state before authorization.
 perform 1 from core.units where id=p_unit for share;
 perform audit_private.authorize('audit.inspection.create',p_unit);
 perform 1 from core.units where id=p_unit and active;
 if not found then raise exception 'Inactive unit' using errcode='23514'; end if;
 -- Template row FOR SHARE until commit: mutually exclusive with catalog inserts (0010), so the
 -- answers below always materialize the complete, final item set of the template.
 select * into t from audit.checklist_templates where active for share;
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

create or replace function audit.finalize_inspection(p_id uuid,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare r audit.inspections; b audit.inspections; t integer; c record; s numeric;
begin
 select * into b from audit.inspections where id=p_id for update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 perform audit_private.authorize('audit.inspection.finalize',b.unit_id);
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

create or replace function audit.reopen_inspection(p_id uuid,p_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare r audit.inspections; b audit.inspections;
begin
 select * into b from audit.inspections where id=p_id for update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 perform audit_private.authorize('audit.inspection.reopen',b.unit_id);
 if b.version is distinct from p_version or b.status<>'finalized' then raise exception 'Concurrent change' using errcode='40001'; end if;
 update audit.inspections set status='draft',final_score=null,final_classification=null,finalized_at=null,finalized_by=null
 where id=p_id returning * into r;
 perform audit_private.log('reopen',r,to_jsonb(b));
end $$;

-- Direct Data API answer writes: RLS is evaluated with the statement snapshot, before the
-- answer row lock and this parent lock are acquired. Re-authorize here, after both waits.
-- Sessions without a caller identity (operators/migrations) bypass RLS and are not authorized here.
create or replace function audit_private.guard_answer() returns trigger language plpgsql security definer set search_path='' as $$
declare i audit.inspections;
begin
 select * into i from audit.inspections where id=new.inspection_id for share;
 if auth.uid() is not null then perform audit_private.authorize('audit.inspection.edit',i.unit_id); end if;
 if i.status is distinct from 'draft' then raise exception 'Inspection is not editable' using errcode='40001'; end if;
 new.updated_at=clock_timestamp(); new.updated_by=auth.uid(); new.version=old.version+1;
 return new;
end $$;

revoke all on function audit_private.authorize(text,uuid) from public,anon,authenticated;
commit;
