begin;
-- Melhorias autorizadas em 26/10: resumo temporal, histórico privado e foto da sala.
create or replace function public.room_booking_summary() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_now timestamptz; v_today date; result jsonb;
begin
 perform room_booking.authorize('room_booking.schedule.read');
 v_now:=clock_timestamp();
 v_today:=(v_now at time zone 'America/Sao_Paulo')::date;
 select jsonb_build_object('name',r.name,'server_now',v_now,
 'in_use',exists(select 1 from room_booking.bookings where room_id=r.id and status='confirmed' and starts_at<=v_now and ends_at>v_now),
 'in_use_until',(select ends_at from room_booking.bookings where room_id=r.id and status='confirmed' and starts_at<=v_now and ends_at>v_now limit 1),
 'today_count',(select count(*) from room_booking.bookings where room_id=r.id and status='confirmed' and (starts_at at time zone 'America/Sao_Paulo')::date=v_today),
 'next_start',(select min(starts_at) from room_booking.bookings where room_id=r.id and status='confirmed' and starts_at>v_now)) into result
 from room_booking.rooms r where active order by id limit 1;
 if private.has_global_permission('room_booking.manage') then
 perform room_booking.authorize('room_booking.manage');
 result:=result || jsonb_build_object('pending_count',(select count(*) from room_booking.requests where status='pending'));
 end if;
 return result;
end $$;

create index requests_history_order on room_booking.requests(starts_at desc,id desc);
create function public.room_booking_history(p_status text default null,p_from date default null,p_to date default null,
 p_before_start timestamptz default null,p_before_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform room_booking.authorize('room_booking.manage');
 if (p_status is not null and p_status not in ('pending','approved','rejected','cancelled'))
 or (p_from is not null and not isfinite(p_from)) or (p_to is not null and not isfinite(p_to))
 or p_to<p_from or (p_before_start is null)<>(p_before_id is null)
 or (p_before_start is not null and not isfinite(p_before_start)) then
 raise exception 'Filtros de histórico inválidos.' using errcode='23514'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.starts_at desc,q.id desc),'[]') into result from (
 select r.id,r.starts_at,r.ends_at,r.booked_for,r.status,r.created_at,r.decided_at,r.decision_reason,
 requester.display_name as requester_name,decider.display_name as decided_by_name,
 b.status as booking_status,b.cancelled_at as booking_cancelled_at
 from room_booking.requests r join core.profiles requester on requester.id=r.requester_user_id
 left join core.profiles decider on decider.id=r.decided_by
 left join room_booking.bookings b on b.request_id=r.id
 where (p_status is null or r.status=p_status)
 and (p_from is null or r.starts_at>=p_from::timestamp at time zone 'America/Sao_Paulo')
 and (p_to is null or r.starts_at<(p_to+1)::timestamp at time zone 'America/Sao_Paulo')
 and (p_before_start is null or (r.starts_at,r.id)<(p_before_start,p_before_id))
 order by r.starts_at desc,r.id desc limit 26) q;
 -- 25 itens e uma sentinela; cursor composto evita deslocamento por novas inserções.
 return jsonb_build_object('items',case when jsonb_array_length(result)>25 then result-25 else result end,
 'has_more',jsonb_array_length(result)>25);
end $$;

create table room_booking.cover_assets(
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references room_booking.rooms(id),
 object_key text generated always as ('rooms/'||room_id::text||'/'||id::text||'.jpg') stored unique,
 status text not null default 'pending' check(status in ('pending','ready','retired')),
 byte_size integer not null check(byte_size between 1 and 1048576),
 width integer not null check(width between 1 and 2560),
 height integer not null check(height between 1 and 2560),
 created_by uuid not null references core.profiles(id) default auth.uid(),
 created_at timestamptz not null default clock_timestamp(),
 ready_at timestamptz,
 retired_at timestamptz,
 unique(room_id,id),
 check((status='pending' and ready_at is null and retired_at is null)
 or (status='ready' and ready_at is not null and retired_at is null)
 or (status='retired' and retired_at is not null))
);
create index cover_assets_live on room_booking.cover_assets(room_id,status,created_at);
create table room_booking.room_covers(
 room_id uuid primary key references room_booking.rooms(id),
 asset_id uuid,
 position_x numeric(5,2) not null default 50 check(position_x between 0 and 100),
 position_y numeric(5,2) not null default 50 check(position_y between 0 and 100),
 version integer not null default 1 check(version>0),
 foreign key(room_id,asset_id) references room_booking.cover_assets(room_id,id)
);
insert into room_booking.room_covers(room_id) select id from room_booking.rooms;
alter table room_booking.cover_assets enable row level security;
alter table room_booking.room_covers enable row level security;
revoke all on room_booking.cover_assets,room_booking.room_covers from public,anon,authenticated;
create policy cover_assets_deny on room_booking.cover_assets as restrictive for all to authenticated using(false) with check(false);
create policy room_covers_deny on room_booking.room_covers as restrictive for all to authenticated using(false) with check(false);
create function room_booking.guard_cover_asset() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.room_id,new.byte_size,new.width,new.height,new.created_by,new.created_at)
 is distinct from (old.id,old.room_id,old.byte_size,old.width,old.height,old.created_by,old.created_at)
 or (old.status,new.status) not in (('pending','ready'),('pending','retired'),('ready','retired'))
 or (old.status='ready' and new.ready_at is distinct from old.ready_at) then
 raise exception 'Metadados da foto são imutáveis.' using errcode='55000'; end if;
 return new;
end $$;
create trigger guard_cover_asset before update on room_booking.cover_assets for each row execute function room_booking.guard_cover_asset();
create function room_booking.check_cover() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from room_booking.room_covers c left join room_booking.cover_assets a on a.id=c.asset_id
 where c.asset_id is not null and a.status is distinct from 'ready')
 or exists(select 1 from room_booking.cover_assets a join room_booking.room_covers c on c.room_id=a.room_id
 where a.status='ready' and c.asset_id is distinct from a.id) then
 raise exception 'Foto deve referenciar o único arquivo pronto da sala.' using errcode='23514'; end if;
 return null;
end $$;
create constraint trigger room_cover_consistency after insert or update on room_booking.room_covers
 deferrable initially deferred for each row execute function room_booking.check_cover();
create constraint trigger room_cover_asset_consistency after insert or update on room_booking.cover_assets
 deferrable initially deferred for each row execute function room_booking.check_cover();
create function room_booking.log_cover() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,before_data,after_data)
 values(auth.uid(),'room_booking','cover_'||lower(tg_op),tg_table_name,
 coalesce(to_jsonb(new)->>'id',to_jsonb(new)->>'room_id'),
 case when tg_op='UPDATE' then to_jsonb(old)-'object_key' end,to_jsonb(new)-'object_key');
 return null;
end $$;
create trigger log_cover after insert or update on room_booking.cover_assets for each row execute function room_booking.log_cover();
create trigger log_cover after update on room_booking.room_covers for each row execute function room_booking.log_cover();

create function public.room_booking_cover() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform room_booking.authorize('room_booking.schedule.read');
 select jsonb_build_object('version',c.version,'asset_id',a.id,'object_key',a.object_key,
 'position_x',c.position_x,'position_y',c.position_y,'width',a.width,'height',a.height) into result
 from room_booking.rooms r join room_booking.room_covers c on c.room_id=r.id
 left join room_booking.cover_assets a on a.id=c.asset_id and a.status='ready'
 where r.active order by r.id limit 1;
 return result;
end $$;
create function public.room_booking_begin_cover_upload(p_byte_size integer,p_width integer,p_height integer,p_mime_type text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_room uuid; a room_booking.cover_assets;
begin
 v_room:=room_booking.lock_room();
 perform room_booking.authorize('room_booking.manage');
 if p_mime_type is distinct from 'image/jpeg' or p_byte_size is null or p_byte_size not between 1 and 1048576
 or p_width is null or p_height is null or p_width not between 1 and 2560 or p_height not between 1 and 2560 then
 raise exception 'Formato, tamanho ou dimensões da foto inválidos.' using errcode='23514'; end if;
 if (select count(*) from room_booking.cover_assets where room_id=v_room and status='pending' and created_at>clock_timestamp()-interval '1 hour')>=5 then
 raise exception 'Há envios demais em andamento. Aguarde e tente novamente.' using errcode='23514'; end if;
 insert into room_booking.cover_assets(room_id,byte_size,width,height) values(v_room,p_byte_size,p_width,p_height) returning * into a;
 return jsonb_build_object('asset_id',a.id,'object_key',a.object_key);
end $$;
create function public.room_booking_save_cover(p_action text,p_asset uuid,p_version integer,p_x numeric default 50,p_y numeric default 50)
returns void language plpgsql security definer set search_path='' as $$
declare v_room uuid; c room_booking.room_covers; a room_booking.cover_assets; m jsonb;
begin
 v_room:=room_booking.lock_room();
 perform room_booking.authorize('room_booking.manage');
 select * into c from room_booking.room_covers where room_id=v_room for update;
 if p_action='cancel' then
 select * into a from room_booking.cover_assets where id=p_asset and room_id=v_room for update;
 if not found or a.created_by is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501'; end if;
 if a.status='retired' and a.ready_at is null then return; end if;
 if a.status<>'pending' then raise exception 'Envio já confirmado.' using errcode='55000'; end if;
 update room_booking.cover_assets set status='retired',retired_at=clock_timestamp() where id=a.id;
 return;
 end if;
 if c.version is distinct from p_version then raise exception 'Version conflict' using errcode='40001'; end if;
 if p_x is null or p_y is null or p_x not between 0 and 100 or p_y not between 0 and 100 then
 raise exception 'Enquadramento inválido.' using errcode='23514'; end if;
 if p_action='confirm' then
 select * into a from room_booking.cover_assets where id=p_asset and room_id=v_room for update;
 if not found or a.created_by is distinct from auth.uid() then raise exception 'Forbidden' using errcode='42501'; end if;
 if a.status<>'pending' or a.created_at<=clock_timestamp()-interval '1 hour' then raise exception 'Envio expirado.' using errcode='55000'; end if;
 select metadata into m from storage.objects where bucket_id='room-covers' and name=a.object_key and owner_id=auth.uid()::text;
 if not found or m->>'size' is distinct from a.byte_size::text or m->>'mimetype' is distinct from 'image/jpeg' then
 raise exception 'A foto enviada não confere com o registro.' using errcode='23514'; end if;
 if c.asset_id is not null then update room_booking.cover_assets set status='retired',retired_at=clock_timestamp() where id=c.asset_id; end if;
 update room_booking.cover_assets set status='ready',ready_at=clock_timestamp() where id=a.id;
 update room_booking.room_covers set asset_id=a.id,position_x=p_x,position_y=p_y,version=version+1 where room_id=v_room;
 elsif p_action in ('position','remove') then
 if c.asset_id is null or c.asset_id is distinct from p_asset then raise exception 'Version conflict' using errcode='40001'; end if;
 if p_action='remove' then
 update room_booking.cover_assets set status='retired',retired_at=clock_timestamp() where id=c.asset_id;
 update room_booking.room_covers set asset_id=null,position_x=50,position_y=50,version=version+1 where room_id=v_room;
 else update room_booking.room_covers set position_x=p_x,position_y=p_y,version=version+1 where room_id=v_room;
 end if;
 else raise exception 'Ação inválida.' using errcode='23514'; end if;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('room-covers','room-covers',false,1048576,array['image/jpeg']);
-- Helpers em private: políticas Storage não concedem USAGE no schema de negócio.
create function private.can_upload_room_cover_object(p_name text) returns boolean
language sql volatile security definer set search_path='' as $$
 select private.has_global_permission('room_booking.manage') and exists(
 select 1 from room_booking.cover_assets a where a.object_key=p_name and a.status='pending'
 and a.created_by=auth.uid() and a.created_at>clock_timestamp()-interval '1 hour')
$$;
create function private.can_read_room_cover_object(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.has_global_permission('room_booking.schedule.read') and exists(
 select 1 from room_booking.cover_assets a join room_booking.room_covers c on c.asset_id=a.id
 join room_booking.rooms r on r.id=c.room_id and r.active where a.object_key=p_name and a.status='ready')
$$;
create policy room_covers_insert on storage.objects for insert to authenticated
with check(bucket_id='room-covers' and current_setting('storage.operation',true)='storage.object.upload' and private.can_upload_room_cover_object(name));
create policy room_covers_read on storage.objects for select to authenticated
using(bucket_id='room-covers' and private.can_read_room_cover_object(name));
-- Sem UPDATE/DELETE, upsert, move ou copy; aposentados retidos, expurgo fora do escopo.
revoke all on function private.can_upload_room_cover_object(text),private.can_read_room_cover_object(text) from public,anon,authenticated;
grant execute on function private.can_upload_room_cover_object(text),private.can_read_room_cover_object(text) to authenticated;
revoke all on all functions in schema room_booking from public,anon,authenticated;
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('room_booking_history','room_booking_cover','room_booking_begin_cover_upload','room_booking_save_cover') loop
 execute format('revoke all on function %s from public,anon,authenticated',f);
 execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
