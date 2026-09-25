begin;
-- Evidence / Storage v1 (docs/briefs/EVIDENCE_STORAGE_V1.md). Bytes live only in Supabase Storage;
-- Action Plans owns metadata, ownership and lifecycle. Clients never write storage.objects rows
-- other than through the Storage API INSERT gated by the policies below.

-- Verification rounds: round n is the n-th recorded verification (verify, then each re_verify).
alter table action_plans.plans add column verification_round integer not null default 0;
-- Deterministic backfill without touching version/updated_* of existing plans: the number of
-- verify/re_verify events already recorded (at least 1 for a verified plan; 0 otherwise).
alter table action_plans.plans disable trigger touch_plan;
update action_plans.plans p set verification_round=greatest(1,(select count(*) from core.system_audit_log l
 where l.module='action_plans' and l.entity_type='plan' and l.entity_id=p.id::text and l.action in ('verify','re_verify')))
where p.effectiveness is not null;
alter table action_plans.plans enable trigger touch_plan;
alter table action_plans.plans add constraint plans_verification_round
 check(verification_round>=0 and (verification_round=0)=(effectiveness is null));

-- Replaces 0006's verify_plan. The five-argument signature is dropped (not overloaded) so no
-- function can record a verification without naming the evidence set the verifier confirmed.
-- Recording a verification also closes its evidence round.
drop function action_plans.verify_plan(uuid,integer,text,date,text);
create function action_plans.verify_plan(p_id uuid,p_version integer,p_effectiveness text,p_verified_on date,p_notes text,
 p_expected_evidence_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare b action_plans.plans; r action_plans.plans; actual uuid[]; expected uuid[];
begin
 b=action_plans_private.lock_plan(p_id,p_version,'action_plan.verify',true);
 if b.status<>'completed' then raise exception 'Only completed plans can be verified' using errcode='23514'; end if;
 -- Business date may not be in the future (one day of tolerance for UTC vs local date).
 if p_verified_on is null or p_verified_on>current_date+1 or coalesce(btrim(p_notes),'')='' then
  raise exception 'Verification date and analysis are required' using errcode='23514';
 end if;
 if p_expected_evidence_ids is null then raise exception 'Expected evidence set is required' using errcode='23514'; end if;
 -- Every evidence confirm/remove takes this plan lock, so under it this is exactly the set the
 -- round freezes: available execution evidence plus available evidence of the open round.
 -- Compared as sets (sorted, distinct): order and repetition are irrelevant; nulls never match.
 select coalesce(array_agg(e.id order by e.id),'{}') into actual from action_plans.evidence e
 where e.plan_id=p_id and e.status='available'
  and (e.kind='execution' or e.verification_round=b.verification_round+1);
 select coalesce(array_agg(distinct x order by x),'{}') into expected from unnest(p_expected_evidence_ids) x;
 if actual is distinct from expected then raise exception 'Evidence set changed' using errcode='40001'; end if;
 update action_plans.plans set effectiveness=p_effectiveness,verified_on=p_verified_on,verification_notes=btrim(p_notes),
  verified_by=auth.uid(),verified_at=clock_timestamp(),source_reactivated_after_verification=false,
  verification_round=verification_round+1
 where id=p_id returning * into r;
 perform action_plans_private.log(case when b.effectiveness is null then 'verify' else 're_verify' end,r,to_jsonb(b));
end $$;

-- Display/download name and type rules; null when valid, otherwise the rejection reason.
create function action_plans_private.evidence_file_error(p_name text,p_type text,p_size bigint) returns text
language sql immutable set search_path='' as $$
 select case
  when p_type is null or p_type not in ('image/jpeg','image/png','application/pdf',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then 'Evidence type not allowed'
  when p_size is null or p_size<1 or p_size>10485760 then 'Evidence size not allowed'
  when p_name is null or char_length(p_name) not between 1 and 180 or not (p_name is nfc normalized)
   or p_name ~ '[\u0001-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069/\\:*?"<>|]'
   or left(p_name,1)='.' or right(p_name,1) in (' ','.') then 'Evidence name not allowed'
  when case lower(substring(p_name from '\.([^.]+)$'))
   when 'jpg' then 'image/jpeg' when 'jpeg' then 'image/jpeg' when 'png' then 'image/png' when 'pdf' then 'application/pdf'
   when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
   when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' end
   is distinct from p_type then 'Evidence extension does not match type'
 end
$$;

create table action_plans.evidence (
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null references action_plans.plans(id),
 kind text not null check(kind in ('execution','verification')),
 verification_round integer,
 object_key text generated always as (plan_id::text||'/'||id::text) stored unique,
 original_name text not null,
 content_type text not null,
 size_bytes bigint not null check(size_bytes between 1 and 10485760),
 status text not null default 'pending' check(status in ('pending','available','removed')),
 created_by uuid not null default auth.uid() references core.profiles(id),
 created_at timestamptz not null default now(),
 uploaded_at timestamptz,
 removed_by uuid references core.profiles(id), removed_at timestamptz,
 constraint evidence_file check(action_plans_private.evidence_file_error(original_name,content_type,size_bytes) is null),
 constraint evidence_round check((kind='execution' and verification_round is null)
  or (kind='verification' and verification_round is not null and verification_round>=1)),
 constraint evidence_lifecycle check(
  (status='pending' and uploaded_at is null and removed_by is null and removed_at is null)
  or (status='available' and uploaded_at is not null and removed_by is null and removed_at is null)
  or (status='removed' and uploaded_at is not null and removed_by is not null and removed_at is not null))
);
create index evidence_available on action_plans.evidence(plan_id,kind,created_at) where status='available';
create index evidence_pending on action_plans.evidence(plan_id) where status='pending';

-- Identity/file facts never change; status only moves pending -> available -> removed.
create function action_plans_private.guard_evidence() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.plan_id,new.kind,new.verification_round,new.original_name,new.content_type,new.size_bytes,new.created_by,new.created_at)
  is distinct from (old.id,old.plan_id,old.kind,old.verification_round,old.original_name,old.content_type,old.size_bytes,old.created_by,old.created_at)
  or not ((old.status='pending' and new.status='available') or (old.status='available' and new.status='removed')) then
  raise exception 'Evidence metadata is immutable' using errcode='55000';
 end if;
 return new;
end $$;
create trigger guard_evidence before update on action_plans.evidence for each row execute function action_plans_private.guard_evidence();

create function action_plans_private.evidence_permission(p_kind text) returns text language sql immutable set search_path='' as $$
 select case p_kind when 'execution' then 'action_plan.write' when 'verification' then 'action_plan.verify' end
$$;
-- Whether the plan state still accepts a change to evidence of this kind/round.
create function action_plans_private.evidence_change_error(p action_plans.plans,p_kind text,p_round integer,p_adding boolean) returns text
language sql immutable set search_path='' as $$
 select case
  when p_kind='execution' and p.effectiveness is not null then 'Verified plan is locked'
  when p_kind='verification' and p_round is distinct from p.verification_round+1 then 'Verification round is closed'
  when p_kind='verification' and p_adding and p.status<>'completed' then 'Only completed plans accept verification evidence'
 end
$$;
create function action_plans_private.check_evidence_change(p action_plans.plans,p_kind text,p_round integer,p_adding boolean) returns void
language plpgsql set search_path='' as $$
declare err text=action_plans_private.evidence_change_error(p,p_kind,p_round,p_adding);
begin
 if err is not null then
  raise exception '%',err using errcode=case when err like 'Only completed%' then '23514' else '55000' end;
 end if;
end $$;
-- Lock order shared by every evidence mutation (0007): plan row, then caller authorization rows.
create function action_plans_private.lock_evidence_plan(p_plan uuid,p_kind text) returns action_plans.plans
language plpgsql security definer set search_path='' as $$
declare p action_plans.plans;
begin
 select * into p from action_plans.plans where id=p_plan for update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 perform action_plans_private.authorize(action_plans_private.evidence_permission(p_kind),p.unit_id,p.sector_id);
 return p;
end $$;
-- Safe audit projection: no object key, URL, bytes or credentials.
create function action_plans_private.evidence_snapshot(e action_plans.evidence) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id',e.id,'plan_id',e.plan_id,'kind',e.kind,'verification_round',e.verification_round,
  'original_name',e.original_name,'content_type',e.content_type,'size_bytes',e.size_bytes,'status',e.status,
  'created_by',e.created_by,'uploaded_at',e.uploaded_at,'removed_by',e.removed_by,'removed_at',e.removed_at)
$$;
create function action_plans_private.log_evidence(p_action text,p action_plans.plans,e action_plans.evidence,p_before jsonb) returns void
language sql security definer set search_path='' as $$
 insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,unit_id,sector_id,before_data,after_data,metadata)
 values(auth.uid(),'action_plans',p_action,'evidence',e.id::text,p.unit_id,p.sector_id,p_before,action_plans_private.evidence_snapshot(e),
  jsonb_build_object('plan_id',e.plan_id,'kind',e.kind,'verification_round',e.verification_round))
$$;

create function action_plans.begin_evidence_upload(p_plan uuid,p_kind text,p_original_name text,p_content_type text,p_size bigint)
returns table(evidence_id uuid,object_key text) language plpgsql security definer set search_path='' as $$
declare p action_plans.plans; r action_plans.evidence; err text; n integer;
begin
 if p_kind is null or p_kind not in ('execution','verification') then raise exception 'Invalid evidence kind' using errcode='23514'; end if;
 p=action_plans_private.lock_evidence_plan(p_plan,p_kind);
 perform action_plans_private.check_evidence_change(p,p_kind,case when p_kind='verification' then p.verification_round+1 end,true);
 err=action_plans_private.evidence_file_error(p_original_name,p_content_type,p_size);
 if err is not null then raise exception '%',err using errcode='23514'; end if;
 -- Active = available + non-expired pending; the plan row lock serializes concurrent begins.
 select count(*) into n from action_plans.evidence e where e.plan_id=p.id
  and (e.status='available' or (e.status='pending' and e.created_at>now()-interval '1 hour'));
 if n>=20 then raise exception 'Evidence limit reached' using errcode='23514'; end if;
 insert into action_plans.evidence(plan_id,kind,verification_round,original_name,content_type,size_bytes)
 values(p.id,p_kind,case when p_kind='verification' then p.verification_round+1 end,p_original_name,p_content_type,p_size)
 returning * into r;
 return query select r.id,r.object_key;
end $$;

-- Marks an upload available only after Storage holds the matching object. Idempotent.
create function action_plans.confirm_evidence_upload(p_evidence uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e action_plans.evidence; r action_plans.evidence; p action_plans.plans; m jsonb;
begin
 select * into e from action_plans.evidence where id=p_evidence;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 p=action_plans_private.lock_evidence_plan(e.plan_id,e.kind);
 select * into e from action_plans.evidence where id=p_evidence for update;
 if e.created_by is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501'; end if;
 if e.status='available' then return; end if;
 -- Decision time, not transaction start: the lock wait above must not extend the window.
 if e.status<>'pending' or e.created_at<=clock_timestamp()-interval '1 hour' then raise exception 'Upload expired' using errcode='55000'; end if;
 perform action_plans_private.check_evidence_change(p,e.kind,e.verification_round,true);
 select o.metadata into m from storage.objects o
 where o.bucket_id='action-plan-evidence' and o.name=e.object_key and o.owner_id=auth.uid()::text;
 if not found or (m->>'size') is distinct from e.size_bytes::text or (m->>'mimetype') is distinct from e.content_type then
  raise exception 'Uploaded object does not match' using errcode='23514';
 end if;
 update action_plans.evidence set status='available',uploaded_at=clock_timestamp() where id=e.id returning * into r;
 perform action_plans_private.log_evidence('evidence_add',p,r,null);
end $$;

-- Logical removal; the object is kept and becomes unreadable through the app. Idempotent.
create function action_plans.remove_evidence(p_evidence uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e action_plans.evidence; r action_plans.evidence; p action_plans.plans;
begin
 select * into e from action_plans.evidence where id=p_evidence;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 p=action_plans_private.lock_evidence_plan(e.plan_id,e.kind);
 select * into e from action_plans.evidence where id=p_evidence for update;
 if e.status='pending' then raise exception 'Forbidden' using errcode='42501'; end if;
 if e.status='removed' then return; end if;
 perform action_plans_private.check_evidence_change(p,e.kind,e.verification_round,false);
 update action_plans.evidence set status='removed',removed_by=auth.uid(),removed_at=clock_timestamp() where id=e.id returning * into r;
 perform action_plans_private.log_evidence('evidence_remove',p,r,action_plans_private.evidence_snapshot(e));
end $$;

-- Available evidence of a readable plan, with uploader names the reader may lack Core access to.
create function action_plans.plan_evidence(p_plan uuid)
returns table(id uuid,plan_id uuid,kind text,verification_round integer,object_key text,original_name text,content_type text,
 size_bytes bigint,created_by uuid,uploaded_by_name text,uploaded_at timestamptz)
language sql stable security definer set search_path='' as $$
 select e.id,e.plan_id,e.kind,e.verification_round,e.object_key,e.original_name,e.content_type,e.size_bytes,e.created_by,pr.display_name,e.uploaded_at
 from action_plans.evidence e join action_plans.plans p on p.id=e.plan_id join core.profiles pr on pr.id=e.created_by
 where e.plan_id=p_plan and e.status='available' and private.has_scoped_permission('action_plan.read',p.unit_id,p.sector_id)
 order by e.kind,e.verification_round nulls first,e.uploaded_at,e.id
$$;

-- Storage policy predicates. Evaluated by Storage as the calling user, so this schema gets USAGE
-- and these two side-effect-free functions (only) get EXECUTE. The schema is not in the Data API.
create function action_plans_private.can_upload_evidence_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from action_plans.evidence e join action_plans.plans p on p.id=e.plan_id
  where e.object_key=p_name and e.status='pending' and e.created_by=auth.uid() and e.created_at>now()-interval '1 hour'
  and private.has_scoped_permission(action_plans_private.evidence_permission(e.kind),p.unit_id,p.sector_id)
  and action_plans_private.evidence_change_error(p,e.kind,e.verification_round,true) is null)
$$;
create function action_plans_private.can_read_evidence_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from action_plans.evidence e join action_plans.plans p on p.id=e.plan_id
  where e.object_key=p_name and e.status='available'
  and private.has_scoped_permission('action_plan.read',p.unit_id,p.sector_id))
$$;

-- Operator-only consistency report between metadata and Storage (never granted to clients).
create function action_plans_private.evidence_reconciliation()
returns table(issue text,evidence_id uuid,object_key text,detail text) language sql stable security definer set search_path='' as $$
 select * from (
  select 'expired_pending'::text,e.id,e.object_key,case when o.id is null then 'no object' else 'object present' end
  from action_plans.evidence e left join storage.objects o on o.bucket_id='action-plan-evidence' and o.name=e.object_key
  where e.status='pending' and e.created_at<=now()-interval '1 hour'
  union all
  select 'available_missing_object',e.id,e.object_key,null from action_plans.evidence e
  where e.status='available' and not exists(select 1 from storage.objects o where o.bucket_id='action-plan-evidence' and o.name=e.object_key)
  union all
  select 'orphan_object',null,o.name,null from storage.objects o
  where o.bucket_id='action-plan-evidence' and not exists(select 1 from action_plans.evidence e where e.object_key=o.name)
 ) x order by 1,3
$$;

grant select on action_plans.evidence to authenticated;
alter table action_plans.evidence enable row level security;
create policy evidence_read on action_plans.evidence for select to authenticated
 using(status='available' and exists(select 1 from action_plans.plans p
  where p.id=plan_id and private.has_scoped_permission('action_plan.read',p.unit_id,p.sector_id)));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('action-plan-evidence','action-plan-evidence',false,10485760,array['image/jpeg','image/png','application/pdf',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
-- No UPDATE/DELETE policies: objects are write-once and never deleted by clients.
create policy action_plan_evidence_insert on storage.objects for insert to authenticated
 with check(bucket_id='action-plan-evidence' and action_plans_private.can_upload_evidence_object(name));
create policy action_plan_evidence_read on storage.objects for select to authenticated
 using(bucket_id='action-plan-evidence' and action_plans_private.can_read_evidence_object(name));

revoke all on function action_plans_private.evidence_file_error(text,text,bigint),action_plans_private.guard_evidence(),
 action_plans_private.evidence_permission(text),action_plans_private.evidence_change_error(action_plans.plans,text,integer,boolean),
 action_plans_private.check_evidence_change(action_plans.plans,text,integer,boolean),action_plans_private.lock_evidence_plan(uuid,text),
 action_plans_private.evidence_snapshot(action_plans.evidence),action_plans_private.log_evidence(text,action_plans.plans,action_plans.evidence,jsonb),
 action_plans_private.can_upload_evidence_object(text),action_plans_private.can_read_evidence_object(text),
 action_plans_private.evidence_reconciliation(),
 action_plans.begin_evidence_upload(uuid,text,text,text,bigint),action_plans.confirm_evidence_upload(uuid),
 action_plans.remove_evidence(uuid),action_plans.plan_evidence(uuid),
 action_plans.verify_plan(uuid,integer,text,date,text,uuid[]) from public,anon,authenticated;
grant usage on schema action_plans_private to authenticated;
grant execute on function action_plans_private.can_upload_evidence_object(text),action_plans_private.can_read_evidence_object(text) to authenticated;
grant execute on function action_plans.begin_evidence_upload(uuid,text,text,text,bigint),action_plans.confirm_evidence_upload(uuid),
 action_plans.remove_evidence(uuid),action_plans.plan_evidence(uuid),
 action_plans.verify_plan(uuid,integer,text,date,text,uuid[]) to authenticated;
commit;
