-- Somente dados sintéticos em banco descartável.
insert into auth.users(id,email,email_confirmed_at) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'ag01-'||n||'@example.test',now() from generate_series(1,5) n;
select private.bootstrap_administrator('00000000-0000-0000-0000-000000000001');
create function public.ag01_assert(ok boolean) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'AG01 assertion failed'; end if; end $$;
create function public.ag01_error(command text, expected text) returns void language plpgsql as $$
begin
 begin execute command; exception when others then
  if sqlstate=expected then return; end if;
  raise exception 'Expected %, got %: %',expected,sqlstate,sqlerrm;
 end;
 raise exception 'Expected error %, command succeeded: %',expected,command;
end $$;
select public.ag01_assert((select count(*)=3 and bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='room_booking' and relkind='r'));
select public.ag01_assert((select count(*)=4 from core.permissions where domain='room_booking'));
select public.ag01_assert((select count(*)=0 from core.user_role_assignments a join core.roles r on r.id=a.role_id where r.key like 'room_booking_%'));
select set_config('ag01.manager',(select id::text from core.roles where key='room_booking_manager'),false);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.ag01_assert(not private.has_global_permission('room_booking.manage'));
insert into core.user_role_assignments(user_id,role_id,scope_type) select '00000000-0000-0000-0000-000000000002',id,'global' from core.roles where key='room_booking_requester';
select public.ag01_error($q$insert into core.user_role_assignments(user_id,role_id,scope_type) select '00000000-0000-0000-0000-000000000003',id,'global' from core.roles where key='room_booking_manager';$q$,'42501');
reset role;
select set_config('request.jwt.claim.sub','',false);
insert into core.user_role_assignments(user_id,role_id,scope_type) select '00000000-0000-0000-0000-000000000003',id,'global' from core.roles where key='room_booking_manager';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.ag01_assert(private.has_global_permission('room_booking.schedule.read') and not private.has_global_permission('room_booking.manage'));
select public.ag01_error($q$insert into core.user_role_assignments(user_id,role_id,scope_type) values ('00000000-0000-0000-0000-000000000004',current_setting('ag01.manager')::uuid,'global')$q$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.ag01_assert(private.has_global_permission('room_booking.manage'));
-- Mesmo o gestor não tem leitura/escrita bruta.
select public.ag01_error('select * from room_booking.requests','42501');
select public.ag01_error('select * from room_booking.bookings','42501');
select public.ag01_error('insert into room_booking.rooms(name) values (''Indevida'')','42501');
select public.ag01_error('update room_booking.bookings set booked_for=''Indevido''','42501');
select public.ag01_error('delete from room_booking.requests','42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select public.ag01_assert(not private.has_global_permission('room_booking.schedule.read'));
set role anon;
select set_config('request.jwt.claim.sub','',false);
select public.ag01_error('select * from room_booking.rooms','42501');
reset role;
-- Defesa RLS mesmo diante de concessão acidental: revogada ao fim do teste.
grant usage on schema room_booking to authenticated;
grant select on all tables in schema room_booking to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.ag01_assert((select count(*)=0 from room_booking.rooms));
reset role;
revoke all on schema room_booking from authenticated;
revoke all on all tables in schema room_booking from authenticated;
-- Revogação na mesma sessão e auditoria Core.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
reset role;
select set_config('request.jwt.claim.sub','',false);
update core.user_role_assignments set active=false where user_id='00000000-0000-0000-0000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select public.ag01_assert(not private.has_global_permission('room_booking.manage'));
reset role;
select public.ag01_assert((select count(*)>=3 from core.system_audit_log where entity_type='user_role_assignments' and action in ('grant','revoke')));
update core.profiles set active=false where id='00000000-0000-0000-0000-000000000002';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select public.ag01_assert(not private.has_global_permission('room_booking.schedule.read'));
reset role;
select set_config('request.jwt.claim.sub','',false);
insert into core.units(code,name) values('AG01','Unidade sintética');
select public.ag01_error($q$insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id) select '00000000-0000-0000-0000-000000000004',r.id,'unit',u.id from core.roles r cross join core.units u where r.key='room_booking_manager' and u.code='AG01'$q$,'23514');

insert into room_booking.requests(room_id,requester_user_id,booked_for,starts_at,ends_at,idempotency_key)
select id,'00000000-0000-0000-0000-000000000004','Sintético','2030-01-01 14:07-03','2030-01-01 14:23-03',gen_random_uuid() from room_booking.rooms cross join generate_series(1,2);
select public.ag01_assert((select count(*)=2 from room_booking.requests));
create function public.ag01_booking(s timestamptz,e timestamptz) returns void language sql as $$
 insert into room_booking.bookings(room_id,booked_for,starts_at,ends_at,created_by,updated_by)
 select id,'Sintético',s,e,'00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001' from room_booking.rooms where name='Sala de Reunião'
$$;
select public.ag01_booking('2030-01-01 14:07-03','2030-01-01 14:23-03');
select public.ag01_error($q$select public.ag01_booking('2030-01-01 14:07-03','2030-01-01 14:23-03')$q$,'23P01');
select public.ag01_error($q$select public.ag01_booking('2030-01-01 14:10-03','2030-01-01 15:00-03')$q$,'23P01');
select public.ag01_booking('2030-01-01 14:23-03','2030-01-01 15:00-03');
select public.ag01_booking('2030-01-01 23:00-03','2030-01-01 23:59-03');
select public.ag01_error($q$select public.ag01_booking('2030-01-02 23:00-03','2030-01-03 00:00-03')$q$,'23514');
select public.ag01_error($q$select public.ag01_booking('2030-01-02 23:00-03','2030-01-02 23:59:01-03')$q$,'23514');
select public.ag01_error($q$select public.ag01_booking('2030-01-02 14:00-03','2030-01-02 14:00-03')$q$,'23514');
select public.ag01_error($q$select public.ag01_booking('2030-01-02 14:00:01-03','2030-01-02 15:00-03')$q$,'23514');
select public.ag01_error($q$select public.ag01_booking('-infinity','infinity')$q$,'23514');
select public.ag01_error($q$update room_booking.bookings set room_id='ffffffff-ffff-ffff-ffff-ffffffffffff'$q$,'23503');
select public.ag01_error('delete from room_booking.rooms','23503');
select public.ag01_error($q$update room_booking.bookings set created_by='ffffffff-ffff-ffff-ffff-ffffffffffff'$q$,'23503');
select public.ag01_error('update room_booking.requests set version=0','23514');
select public.ag01_error($q$update room_booking.requests set status='approved'$q$,'23514');
select public.ag01_error($q$update room_booking.bookings set status='cancelled'$q$,'23514');
select public.ag01_error($q$insert into room_booking.requests(room_id,requester_user_id,booked_for,starts_at,ends_at,idempotency_key) select room_id,requester_user_id,booked_for,starts_at,ends_at,idempotency_key from room_booking.requests limit 1$q$,'23505');
update room_booking.bookings set request_id=(select id from room_booking.requests limit 1) where starts_at='2030-01-01 14:07-03';
select public.ag01_error($q$update room_booking.bookings set request_id=(select id from room_booking.requests limit 1) where starts_at='2030-01-01 14:23-03'$q$,'23505');
update room_booking.bookings set status='cancelled',cancelled_by=created_by,cancelled_at=now() where starts_at='2030-01-01 14:07-03';
select public.ag01_booking('2030-01-01 14:07-03','2030-01-01 14:23-03');
set timezone='Asia/Tokyo';
select public.ag01_booking('2030-01-03 23:00-03','2030-01-03 23:59-03');
set timezone='UTC';
select public.ag01_booking('2030-01-04 23:00-03','2030-01-04 23:59-03');
-- Pedido não pode apontar para outra sala, nem aceitar data/finalidade inválida.
insert into room_booking.rooms(name) values('Sala sintética de integridade');
select public.ag01_error($q$update room_booking.bookings set room_id=(select id from room_booking.rooms where name='Sala sintética de integridade') where request_id is not null$q$,'23503');
select public.ag01_error($q$update room_booking.requests set ends_at=starts_at$q$,'23514');
select public.ag01_error($q$update room_booking.requests set starts_at='2030-02-30 09:00-03'$q$,'22008');
select public.ag01_error($q$update room_booking.requests set ends_at='2030-01-02 00:00-03'$q$,'23514');
select public.ag01_error($q$update room_booking.requests set requester_user_id='ffffffff-ffff-ffff-ffff-ffffffffffff'$q$,'23503');
select public.ag01_error($q$update room_booking.requests set status='expired'$q$,'23514');
-- Fundacão não expõe RPCs; tempo passado é dado histórico válido para constraints.
select public.ag01_booking('2020-01-01 09:00-03','2020-01-01 10:00-03');
