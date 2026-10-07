begin;
-- Unit Cover v1. Core owns the unit cover image; business modules (Audit) only consume the
-- public batch contract core.unit_covers. Bytes live exclusively in the private Storage bucket
-- 'unit-covers' and are written/read only through the Storage API with the user's JWT.
-- The browser uploads only the prepared canonical JPEG; the original file is never stored.
-- Client metadata is bounded here and the stored object's size/MIME are cross-checked on
-- confirmation. Pixel content is not server-decoded (no image processing in this stack).

insert into core.permissions(key,domain,resource,action,description) values
('core.unit_cover.read','core','unit_cover','read','Visualizar capas de unidades');
-- Explicit grant to the system roles that view units today; custom roles are not changed.
insert into core.role_permissions(role_id,permission_key)
select r.id,'core.unit_cover.read' from core.roles r
where r.system and r.key in ('platform_administrator','quality','quality_viewer');

create table core.unit_cover_assets(
 id uuid primary key default gen_random_uuid(),
 unit_id uuid not null references core.units(id),
 object_key text generated always as ('units/'||unit_id::text||'/covers/'||id::text||'.jpg') stored unique,
 status text not null default 'pending' check(status in ('pending','ready','retired','purged')),
 mime_type text not null check(mime_type='image/jpeg'),
 byte_size integer not null check(byte_size between 1 and 1048576),
 width integer not null check(width between 1 and 2560),
 height integer not null check(height between 1 and 2560),
 created_by uuid not null references core.profiles(id) default auth.uid(),
 created_at timestamptz not null default clock_timestamp(),
 ready_at timestamptz,
 retired_by uuid references core.profiles(id),
 retired_at timestamptz,
 purged_at timestamptz,
 unique(unit_id,id),
 constraint unit_cover_assets_shape check(
 (status='pending' and ready_at is null and retired_by is null and retired_at is null and purged_at is null)
 or (status='ready' and ready_at is not null and retired_by is null and retired_at is null and purged_at is null)
 or (status='retired' and retired_at is not null and purged_at is null)
 or (status='purged' and retired_at is not null and purged_at is not null))
);
create index unit_cover_assets_live on core.unit_cover_assets(unit_id,status,created_at);

alter table core.units
 add column cover_asset_id uuid,
 add column cover_position_x numeric(5,2) not null default 50 check(cover_position_x between 0 and 100),
 add column cover_position_y numeric(5,2) not null default 50 check(cover_position_y between 0 and 100),
 -- Ownership: a unit can only reference an asset of its own.
 add constraint units_cover_asset foreign key(id,cover_asset_id) references core.unit_cover_assets(unit_id,id);

-- Lifecycle: pending -> ready -> retired -> purged, or pending -> retired (cancel/expiry).
-- Identity, metadata and earlier timestamps are immutable.
create function private.guard_unit_cover_asset() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.unit_id,new.mime_type,new.byte_size,new.width,new.height,new.created_by,new.created_at)
 is distinct from (old.id,old.unit_id,old.mime_type,old.byte_size,old.width,old.height,old.created_by,old.created_at)
 or (old.status,new.status) not in (('pending','ready'),('pending','retired'),('ready','retired'),('retired','purged'))
 or (old.status<>'pending' and new.ready_at is distinct from old.ready_at)
 or (old.status='retired' and (new.retired_at,new.retired_by) is distinct from (old.retired_at,old.retired_by)) then
 raise exception 'Unit cover metadata is immutable' using errcode='55000';
 end if;
 return new;
end $$;
create trigger guard_unit_cover_asset before update on core.unit_cover_assets
for each row execute function private.guard_unit_cover_asset();

-- Checked at commit: a unit references only a ready asset, and every ready asset is the
-- current cover of its unit (so at most one ready asset per unit). Deferred because a
-- replacement retires the old asset, readies the new one and repoints the unit atomically.
create function private.check_unit_cover() returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
 u=case tg_table_name when 'units' then (to_jsonb(new)->>'id')::uuid else (to_jsonb(new)->>'unit_id')::uuid end;
 if exists(select 1 from core.units x left join core.unit_cover_assets a on a.id=x.cover_asset_id
 where x.id=u and x.cover_asset_id is not null and a.status is distinct from 'ready')
 or exists(select 1 from core.unit_cover_assets a join core.units x on x.id=a.unit_id
 where a.unit_id=u and a.status='ready' and x.cover_asset_id is distinct from a.id) then
 raise exception 'Unit cover must reference its single ready asset' using errcode='23514';
 end if;
 return null;
end $$;
create constraint trigger unit_cover_consistency after insert or update of cover_asset_id on core.units
deferrable initially deferred for each row execute function private.check_unit_cover();
create constraint trigger unit_cover_asset_consistency after insert or update of status on core.unit_cover_assets
deferrable initially deferred for each row execute function private.check_unit_cover();

-- Asset lifecycle audit trail. The unit pointer/position changes are already recorded by
-- private.record_change on core.units. The object key is not logged (same as Evidence).
create function private.unit_cover_snapshot(a core.unit_cover_assets) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('id',a.id,'unit_id',a.unit_id,'status',a.status,'mime_type',a.mime_type,
 'byte_size',a.byte_size,'width',a.width,'height',a.height,'created_by',a.created_by,'created_at',a.created_at,
 'ready_at',a.ready_at,'retired_by',a.retired_by,'retired_at',a.retired_at,'purged_at',a.purged_at)
$$;
create function private.log_unit_cover_asset() returns trigger language plpgsql security definer set search_path='' as $$
declare event text; before jsonb;
begin
 if tg_op='INSERT' then event='cover_upload_begin';
 else
 before=private.unit_cover_snapshot(old);
 event=case when new.status='ready' then 'cover_ready' when new.status='purged' then 'cover_purge'
 when old.status='pending' then 'cover_cancel' else 'cover_retire' end;
 end if;
 insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,unit_id,before_data,after_data)
 values(auth.uid(),'core',event,'unit_cover_assets',new.id::text,new.unit_id,before,private.unit_cover_snapshot(new));
 return null;
end $$;
create trigger log_unit_cover_asset after insert or update on core.unit_cover_assets
for each row execute function private.log_unit_cover_asset();

-- Revocation-safe check (same pattern as the module hardening in 0007/0009, owned by Core):
-- lock the caller's profile, candidate assignments and roles FOR SHARE, then check with a
-- fresh READ COMMITTED snapshot, so a concurrent revocation is observed or waits.
create function private.authorize_unit(p_permission text,p_unit uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from core.profiles where id=auth.uid() and active for share;
 if found then
 perform 1 from core.user_role_assignments a where a.user_id=auth.uid() and a.active
 and (a.scope_type='global' or a.unit_id=p_unit) order by a.id for share;
 perform 1 from core.roles r where r.active and r.id in (select a.role_id from core.user_role_assignments a
 where a.user_id=auth.uid() and a.active and (a.scope_type='global' or a.unit_id=p_unit)) order by r.id for share;
 end if;
 if not private.has_unit_permission(p_permission,p_unit) then
 raise exception 'Forbidden' using errcode='42501';
 end if;
end $$;
-- Mutation order for every cover RPC: unit row -> caller authorization -> asset row.
-- NO KEY UPDATE keeps foreign-key readers of core.units (KEY SHARE) unblocked.
create function private.lock_unit_for_cover(p_unit uuid) returns core.units
language plpgsql security definer set search_path='' as $$
declare u core.units;
begin
 select * into u from core.units where id=p_unit for no key update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 perform private.authorize_unit('admin.unit.manage',p_unit);
 return u;
end $$;
create function private.can_read_unit_cover(p_unit uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.has_unit_permission('core.unit_cover.read',p_unit) or private.has_unit_permission('admin.unit.manage',p_unit)
$$;
create function private.check_cover_position(p_x numeric,p_y numeric) returns void
language plpgsql immutable set search_path='' as $$
begin
 -- NaN sorts above every number, so it fails the range check too.
 if p_x is null or p_y is null or p_x not between 0 and 100 or p_y not between 0 and 100 then
 raise exception 'Cover position not allowed' using errcode='23514';
 end if;
end $$;

create function core.begin_unit_cover_upload(p_unit uuid,p_mime_type text,p_byte_size integer,p_width integer,p_height integer)
returns table(asset_id uuid,object_key text) language plpgsql security definer set search_path='' as $$
declare a core.unit_cover_assets; live integer;
begin
 perform private.lock_unit_for_cover(p_unit);
 if p_mime_type is distinct from 'image/jpeg' then raise exception 'Cover type not allowed' using errcode='23514'; end if;
 if p_byte_size is null or p_byte_size not between 1 and 1048576 then raise exception 'Cover size not allowed' using errcode='23514'; end if;
 if p_width is null or p_height is null or p_width not between 1 and 2560 or p_height not between 1 and 2560 then
 raise exception 'Cover dimensions not allowed' using errcode='23514'; end if;
 select count(*) into live from core.unit_cover_assets x
 where x.unit_id=p_unit and x.status='pending' and x.created_at>clock_timestamp()-interval '1 hour';
 if live>=5 then raise exception 'Cover upload limit reached' using errcode='23514'; end if;
 insert into core.unit_cover_assets(unit_id,mime_type,byte_size,width,height)
 values(p_unit,p_mime_type,p_byte_size,p_width,p_height) returning * into a;
 return query select a.id,a.object_key;
end $$;

-- Makes an uploaded pending asset the unit cover (with its framing) and retires the previous
-- cover. A retry after success returns without effect.
create function core.confirm_unit_cover_upload(p_unit uuid,p_asset uuid,p_position_x numeric,p_position_y numeric)
returns void language plpgsql security definer set search_path='' as $$
declare u core.units; a core.unit_cover_assets; m jsonb;
begin
 u=private.lock_unit_for_cover(p_unit);
 select * into a from core.unit_cover_assets where id=p_asset for update;
 if not found or a.unit_id<>u.id or a.created_by is distinct from auth.uid() then
 raise exception 'Forbidden' using errcode='42501'; end if;
 if a.status='ready' then return; end if;
 if a.status<>'pending' or a.created_at<=clock_timestamp()-interval '1 hour' then
 raise exception 'Upload expired' using errcode='55000'; end if;
 perform private.check_cover_position(p_position_x,p_position_y);
 select o.metadata into m from storage.objects o
 where o.bucket_id='unit-covers' and o.name=a.object_key and o.owner_id=auth.uid()::text;
 if not found or m->>'size' is distinct from a.byte_size::text or m->>'mimetype' is distinct from a.mime_type then
 raise exception 'Uploaded object does not match' using errcode='23514'; end if;
 if u.cover_asset_id is not null then
 update core.unit_cover_assets set status='retired',retired_at=clock_timestamp(),retired_by=auth.uid()
 where id=u.cover_asset_id;
 end if;
 update core.unit_cover_assets set status='ready',ready_at=clock_timestamp() where id=a.id;
 update core.units set cover_asset_id=a.id,cover_position_x=p_position_x,cover_position_y=p_position_y where id=u.id;
end $$;

create function core.cancel_unit_cover_upload(p_asset uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a core.unit_cover_assets;
begin
 select * into a from core.unit_cover_assets where id=p_asset;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 perform private.lock_unit_for_cover(a.unit_id);
 select * into a from core.unit_cover_assets where id=p_asset for update;
 if a.created_by is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501'; end if;
 if a.status='retired' and a.ready_at is null then return; end if;
 if a.status<>'pending' then raise exception 'Upload already confirmed' using errcode='55000'; end if;
 update core.unit_cover_assets set status='retired',retired_at=clock_timestamp(),retired_by=auth.uid() where id=a.id;
end $$;

-- p_expected_asset: the cover the user saw. A different current cover is a concurrent change;
-- an already removed cover makes a retry succeed without effect.
create function core.remove_unit_cover(p_unit uuid,p_expected_asset uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u core.units;
begin
 u=private.lock_unit_for_cover(p_unit);
 if u.cover_asset_id is null then return; end if;
 if u.cover_asset_id is distinct from p_expected_asset then raise exception 'Concurrent change' using errcode='40001'; end if;
 update core.unit_cover_assets set status='retired',retired_at=clock_timestamp(),retired_by=auth.uid() where id=u.cover_asset_id;
 update core.units set cover_asset_id=null,cover_position_x=50,cover_position_y=50 where id=u.id;
end $$;

create function core.set_unit_cover_position(p_unit uuid,p_expected_asset uuid,p_position_x numeric,p_position_y numeric)
returns void language plpgsql security definer set search_path='' as $$
declare u core.units;
begin
 u=private.lock_unit_for_cover(p_unit);
 perform private.check_cover_position(p_position_x,p_position_y);
 if u.cover_asset_id is null or u.cover_asset_id is distinct from p_expected_asset then
 raise exception 'Concurrent change' using errcode='40001'; end if;
 update core.units set cover_position_x=p_position_x,cover_position_y=p_position_y
 where id=u.id and (cover_position_x,cover_position_y) is distinct from (p_position_x::numeric(5,2),p_position_y::numeric(5,2));
end $$;

-- Public read contract: one call resolves up to 100 units; only authorized ready covers.
create function core.unit_covers(p_units uuid[])
returns table(unit_id uuid,asset_id uuid,object_key text,position_x numeric,position_y numeric,width integer,height integer,ready_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if p_units is null or cardinality(p_units)>100 then
 raise exception 'Between 0 and 100 units per call' using errcode='22023'; end if;
 return query select u.id,a.id,a.object_key,u.cover_position_x,u.cover_position_y,a.width,a.height,a.ready_at
 from core.units u join core.unit_cover_assets a on a.id=u.cover_asset_id and a.unit_id=u.id and a.status='ready'
 where u.id=any(p_units) and private.can_read_unit_cover(u.id)
 order by u.id;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('unit-covers','unit-covers',false,1048576,array['image/jpeg']);
create function private.can_upload_unit_cover_object(p_name text) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from core.unit_cover_assets a where a.object_key=p_name and a.status='pending'
 and a.created_by=auth.uid() and a.created_at>clock_timestamp()-interval '1 hour'
 and private.has_unit_permission('admin.unit.manage',a.unit_id))
$$;
create function private.can_read_unit_cover_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from core.unit_cover_assets a join core.units u on u.cover_asset_id=a.id
 where a.object_key=p_name and a.status='ready' and private.can_read_unit_cover(a.unit_id))
$$;
create policy unit_covers_insert on storage.objects for insert to authenticated
with check(bucket_id='unit-covers' and current_setting('storage.operation',true)='storage.object.upload'
 and private.can_upload_unit_cover_object(name));
create policy unit_covers_read on storage.objects for select to authenticated
using(bucket_id='unit-covers' and private.can_read_unit_cover_object(name));
-- No client UPDATE/DELETE policies: no overwrite, upsert, move or delete. The upload-operation
-- gate also denies COPY into a pending destination. Retired covers become unreadable at once.

-- Operator-only reconciliation. Purge is intentionally NOT implemented: physical removal of
-- retired/orphan objects waits for the retention decision (>= max(7 days, recovery window)).
create function private.unit_cover_reconciliation()
returns table(issue text,asset_id uuid,unit_id uuid,object_key text,detail text)
language sql stable security definer set search_path='' as $$
 select 'expired_pending'::text,a.id,a.unit_id,a.object_key,case when o.id is null then 'no object' else 'object present' end
 from core.unit_cover_assets a left join storage.objects o on o.bucket_id='unit-covers' and o.name=a.object_key
 where a.status='pending' and a.created_at<=now()-interval '1 hour'
 union all
 select 'retired_object_retained',a.id,a.unit_id,a.object_key,'retired_at='||a.retired_at::text
 from core.unit_cover_assets a join storage.objects o on o.bucket_id='unit-covers' and o.name=a.object_key
 where a.status='retired'
 union all
 select 'ready_missing_object',a.id,a.unit_id,a.object_key,null from core.unit_cover_assets a where a.status='ready'
 and not exists(select 1 from storage.objects o where o.bucket_id='unit-covers' and o.name=a.object_key)
 union all
 select 'orphan_object',null,null,o.name,null from storage.objects o where o.bucket_id='unit-covers'
 and not exists(select 1 from core.unit_cover_assets a where a.object_key=o.name)
$$;

alter table core.unit_cover_assets enable row level security;
-- No Data API access to the table: reads go through core.unit_covers, writes through the RPCs.
revoke all on core.unit_cover_assets from public,anon,authenticated;
revoke all on function private.guard_unit_cover_asset(),private.check_unit_cover(),
private.unit_cover_snapshot(core.unit_cover_assets),private.log_unit_cover_asset(),
private.authorize_unit(text,uuid),private.lock_unit_for_cover(uuid),private.can_read_unit_cover(uuid),
private.check_cover_position(numeric,numeric),private.can_upload_unit_cover_object(text),
private.can_read_unit_cover_object(text),private.unit_cover_reconciliation(),
core.begin_unit_cover_upload(uuid,text,integer,integer,integer),core.confirm_unit_cover_upload(uuid,uuid,numeric,numeric),
core.cancel_unit_cover_upload(uuid),core.remove_unit_cover(uuid,uuid),
core.set_unit_cover_position(uuid,uuid,numeric,numeric),core.unit_covers(uuid[])
from public,anon,authenticated;
-- Storage policies run as the caller, so the object predicates need EXECUTE.
grant execute on function private.can_upload_unit_cover_object(text),private.can_read_unit_cover_object(text),
core.begin_unit_cover_upload(uuid,text,integer,integer,integer),core.confirm_unit_cover_upload(uuid,uuid,numeric,numeric),
core.cancel_unit_cover_upload(uuid),core.remove_unit_cover(uuid,uuid),
core.set_unit_cover_position(uuid,uuid,numeric,numeric),core.unit_covers(uuid[]) to authenticated;
commit;
