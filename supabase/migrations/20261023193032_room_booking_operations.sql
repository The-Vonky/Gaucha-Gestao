begin;
-- AG-02: API pública apenas de funções; tabelas e helpers permanecem privados.
create function room_booking.authorize(p_permission text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from core.profiles where id=auth.uid() and active for share;
 perform 1 from core.user_role_assignments where user_id=auth.uid() and active and scope_type='global' order by id for share;
 perform 1 from core.roles where id in (select role_id from core.user_role_assignments where user_id=auth.uid() and active and scope_type='global') order by id for share;
 perform 1 from core.role_permissions where permission_key=p_permission and role_id in (select role_id from core.user_role_assignments where user_id=auth.uid() and active and scope_type='global') order by role_id for share;
 perform 1 from core.permissions where key=p_permission for share;
 if not private.has_global_permission(p_permission) then raise exception 'Forbidden' using errcode='42501'; end if;
end $$;
create function room_booking.lock_room() returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 select id into v_id from room_booking.rooms where active order by id limit 1 for update;
 if v_id is null then raise exception 'Sala indisponível.' using errcode='23514'; end if;
 return v_id;
end $$;
create function room_booking.validate_slot(p_start timestamptz,p_end timestamptz,p_room uuid,p_except uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
 or p_start<=clock_timestamp() or p_end<=p_start
 or (p_start at time zone 'America/Sao_Paulo')::date<>(p_end at time zone 'America/Sao_Paulo')::date
 or (p_end at time zone 'America/Sao_Paulo')::time>time '23:59'
 or date_trunc('minute',p_start)<>p_start or date_trunc('minute',p_end)<>p_end then
 raise exception 'Informe minutos inteiros, início futuro e término no mesmo dia até 23:59.' using errcode='23514'; end if;
 if exists(select 1 from room_booking.bookings where room_id=p_room and status='confirmed'
 and (p_except is null or id<>p_except) and tstzrange(starts_at,ends_at,'[)') && tstzrange(p_start,p_end,'[)')) then
 raise exception 'Horário ocupado. Atualize a agenda.' using errcode='23P01'; end if;
end $$;
create function room_booking.log_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into core.system_audit_log(actor_user_id,module,action,entity_type,entity_id,before_data,after_data)
 values(auth.uid(),'room_booking',lower(TG_OP),TG_TABLE_NAME,new.id::text,
 case when TG_OP='UPDATE' then jsonb_build_object('status',old.status,'version',old.version,'starts_at',old.starts_at,'ends_at',old.ends_at) end,
 jsonb_build_object('status',new.status,'version',new.version,'starts_at',new.starts_at,'ends_at',new.ends_at));
 return new;
end $$;
create trigger requests_audit after insert or update on room_booking.requests for each row execute function room_booking.log_change();
create trigger bookings_audit after insert or update on room_booking.bookings for each row execute function room_booking.log_change();

create function public.room_booking_schedule(p_from date,p_to date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform room_booking.authorize('room_booking.schedule.read');
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>30 then raise exception 'Consulte até 31 dias por vez.' using errcode='23514'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'room_id',room_id,'booked_for',booked_for,'secretary_notes',secretary_notes,'starts_at',starts_at,'ends_at',ends_at,'version',version) order by starts_at,id),'[]') into result
 from room_booking.bookings where status='confirmed' and starts_at>=p_from::timestamp at time zone 'America/Sao_Paulo' and starts_at<(p_to+1)::timestamp at time zone 'America/Sao_Paulo';
 return result;
end $$;
create function public.room_booking_summary() returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=clock_timestamp(); v_today date; result jsonb;
begin
 perform room_booking.authorize('room_booking.schedule.read');
 v_today:=(v_now at time zone 'America/Sao_Paulo')::date;
 select jsonb_build_object('name',r.name,'server_now',v_now,
 'in_use',exists(select 1 from room_booking.bookings where room_id=r.id and status='confirmed' and starts_at<=v_now and ends_at>v_now),
 'today_count',(select count(*) from room_booking.bookings where room_id=r.id and status='confirmed' and (starts_at at time zone 'America/Sao_Paulo')::date=v_today),
 'next_start',(select min(starts_at) from room_booking.bookings where room_id=r.id and status='confirmed' and starts_at>v_now)) into result
 from room_booking.rooms r where active order by id limit 1;
 if private.has_global_permission('room_booking.manage') then
 perform room_booking.authorize('room_booking.manage');
 result:=result || jsonb_build_object('pending_count',(select count(*) from room_booking.requests where status='pending'));
 end if;
 return result;
end $$;
create function public.room_booking_requests(p_queue boolean default false,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_queue is null or p_offset is null or p_offset<0 then raise exception 'Invalid page' using errcode='23514'; end if;
 perform room_booking.authorize(case when p_queue then 'room_booking.manage' else 'room_booking.request.read_own' end);
 select coalesce(jsonb_agg(to_jsonb(q)),'[]') into result from (
 select r.id,r.booked_for,r.purpose,r.starts_at,r.ends_at,r.status,r.version,r.decision_reason,b.status as booking_status
 from room_booking.requests r left join room_booking.bookings b on b.request_id=r.id
 where (p_queue and r.status='pending') or (not p_queue and r.requester_user_id=auth.uid())
 order by r.created_at desc,r.id limit 50 offset p_offset) q;
 return result;
end $$;
create function public.room_booking_create_request(p_start timestamptz,p_end timestamptz,p_booked_for text,p_purpose text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_room uuid; r room_booking.requests;
begin
 v_room:=room_booking.lock_room();
 perform room_booking.authorize('room_booking.request.create');
 select * into r from room_booking.requests where requester_user_id=auth.uid() and idempotency_key=p_key;
 if found then
 if r.starts_at is distinct from p_start or r.ends_at is distinct from p_end or r.booked_for is distinct from btrim(p_booked_for) or r.purpose is distinct from p_purpose then raise exception 'Chave reutilizada para outro pedido.' using errcode='23514'; end if;
 return r.id;
 end if;
 perform room_booking.validate_slot(p_start,p_end,v_room);
 insert into room_booking.requests(room_id,requester_user_id,booked_for,purpose,starts_at,ends_at,idempotency_key)
 values(v_room,auth.uid(),btrim(p_booked_for),p_purpose,p_start,p_end,p_key) returning * into r;
 return r.id;
end $$;
create function public.room_booking_decide_request(p_id uuid,p_version integer,p_action text,p_reason text default null,p_notes text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_room uuid; r room_booking.requests; v_booking uuid;
begin
 v_room:=room_booking.lock_room();
 perform room_booking.authorize(case when p_action='cancel' then 'room_booking.request.read_own' else 'room_booking.manage' end);
 select * into r from room_booking.requests where id=p_id and (p_action<>'cancel' or requester_user_id=auth.uid()) for update;
 if not found then raise exception 'Forbidden' using errcode='42501'; end if;
 if r.version is distinct from p_version then raise exception 'Version conflict' using errcode='40001'; end if;
 if r.status<>'pending' then raise exception 'Terminal state' using errcode='55000'; end if;
 if p_action='approve' then
 perform room_booking.validate_slot(r.starts_at,r.ends_at,v_room);
 insert into room_booking.bookings(room_id,request_id,booked_for,secretary_notes,starts_at,ends_at,created_by,updated_by)
 values(r.room_id,r.id,r.booked_for,p_notes,r.starts_at,r.ends_at,auth.uid(),auth.uid()) returning id into v_booking;
 elsif p_action='cancel' then
 if r.starts_at<=clock_timestamp() then raise exception 'Pedido vencido: aguarde recusa pela secretaria.' using errcode='23514'; end if;
 elsif p_action is distinct from 'reject' then raise exception 'Invalid action' using errcode='23514';
 end if;
 update room_booking.requests set status=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'cancelled' end,
 decided_by=case when p_action<>'cancel' then auth.uid() end,decided_at=case when p_action<>'cancel' then clock_timestamp() end,
 decision_reason=case when p_action='reject' then p_reason end,cancelled_by=case when p_action='cancel' then auth.uid() end,
 cancelled_at=case when p_action='cancel' then clock_timestamp() end,version=version+1,updated_at=clock_timestamp() where id=r.id;
 return coalesce(v_booking,r.id);
end $$;
create function public.room_booking_save_booking(p_start timestamptz,p_end timestamptz,p_booked_for text,p_notes text default null,p_id uuid default null,p_version integer default null,p_cancel boolean default false,p_reason text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_room uuid; b room_booking.bookings;
begin
 v_room:=room_booking.lock_room();
 perform room_booking.authorize('room_booking.manage');
 if p_cancel is null then raise exception 'Invalid action' using errcode='23514'; end if;
 if p_id is null then
 if p_cancel then raise exception 'Invalid action' using errcode='23514'; end if;
 perform room_booking.validate_slot(p_start,p_end,v_room);
 insert into room_booking.bookings(room_id,booked_for,secretary_notes,starts_at,ends_at,created_by,updated_by)
 values(v_room,btrim(p_booked_for),p_notes,p_start,p_end,auth.uid(),auth.uid()) returning * into b;
 else
 select * into b from room_booking.bookings where id=p_id for update;
 if not found or b.version is distinct from p_version then raise exception 'Version conflict' using errcode='40001'; end if;
 if b.status<>'confirmed' then raise exception 'Terminal state' using errcode='55000'; end if;
 if b.starts_at<=clock_timestamp() then
 if p_cancel or p_start is distinct from b.starts_at or p_end is distinct from b.ends_at then
 raise exception 'Reunião iniciada: corrija apenas nome e observações.' using errcode='23514'; end if;
 elsif not p_cancel then perform room_booking.validate_slot(p_start,p_end,b.room_id,b.id);
 end if;
 update room_booking.bookings set booked_for=case when p_cancel then booked_for else btrim(p_booked_for) end,
 secretary_notes=case when p_cancel then secretary_notes else p_notes end,
 starts_at=case when p_cancel then starts_at else p_start end,ends_at=case when p_cancel then ends_at else p_end end,
 status=case when p_cancel then 'cancelled' else 'confirmed' end,
 cancelled_by=case when p_cancel then auth.uid() end,cancelled_at=case when p_cancel then clock_timestamp() end,
 cancel_reason=case when p_cancel then p_reason end,version=version+1,updated_by=auth.uid(),updated_at=clock_timestamp() where id=b.id;
 end if;
 return b.id;
end $$;
revoke all on all functions in schema room_booking from public,anon,authenticated;
-- Apenas os endpoints enumerados recebem EXECUTE; schema privado sem USAGE.
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('room_booking_schedule','room_booking_summary','room_booking_requests','room_booking_create_request','room_booking_decide_request','room_booking_save_booking') loop
 execute format('revoke all on function %s from public,anon,authenticated',f);
 execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
