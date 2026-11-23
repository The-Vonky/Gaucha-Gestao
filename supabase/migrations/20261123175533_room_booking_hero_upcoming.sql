begin;
-- Projeção pública para o hero; preserva autorização, contadores e relógio únicos.
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
 'next_start',(select min(starts_at) from room_booking.bookings where room_id=r.id and status='confirmed' and starts_at>v_now),
 'upcoming',(select coalesce(jsonb_agg(to_jsonb(upcoming) order by upcoming.starts_at),'[]'::jsonb) from (
   select booked_for,starts_at,ends_at from room_booking.bookings
   where room_id=r.id and status='confirmed' and starts_at>v_now
   order by starts_at,id limit 2
 ) upcoming)) into result
 from room_booking.rooms r where active order by id limit 1;
 if private.has_global_permission('room_booking.manage') then
 perform room_booking.authorize('room_booking.manage');
 result:=result || jsonb_build_object('pending_count',(select count(*) from room_booking.requests where status='pending'));
 end if;
 return result;
end $$;

-- CREATE OR REPLACE conserva owner e ACL; não amplia EXECUTE nem grants de tabelas.
commit;
