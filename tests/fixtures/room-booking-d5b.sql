-- Executar depois do fixture AG02; identidades existem somente no PGlite.
reset role;
select set_config('request.jwt.claim.sub','',false);
insert into core.user_role_assignments(user_id,role_id,scope_type)
select 'a9020000-0000-0000-0000-000000000004',id,'global' from core.roles where key='platform_administrator';
select pg_temp.check((select name='Room Booking Manager' and description='Gestão de pedidos e reservas.' from core.roles where key='room_booking_manager'));
select pg_temp.check((select name='Room Booking Requester' and description='Solicitações individuais e consulta da agenda.' from core.roles where key='room_booking_requester'));
select pg_temp.check((select count(*)=4 from core.role_permissions rp join core.roles r on r.id=rp.role_id where r.key='room_booking_manager'));
set role authenticated;
select set_config('request.jwt.claim.sub','a9020000-0000-0000-0000-000000000004',false);
select pg_temp.check((select count(*)=3 from core.my_access() where permission like 'room_booking.%'));
select pg_temp.check(public.room_booking_schedule('2097-01-02','2097-01-02')='[]'::jsonb);
select set_config('d5b.request',public.room_booking_create_request('2097-01-02 14:07-03','2097-01-02 14:23-03','Admin solicitante',null,gen_random_uuid())::text,false);
select pg_temp.check(public.room_booking_requests(false)->0->>'id'=current_setting('d5b.request'));
select pg_temp.check(not (public.room_booking_summary() ? 'pending_count'));
select pg_temp.fails($q$select public.room_booking_requests(true)$q$,'42501');
select pg_temp.fails($q$select public.room_booking_decide_request(current_setting('ag02.second')::uuid,1,'approve')$q$,'42501');
select pg_temp.fails($q$select public.room_booking_decide_request(current_setting('ag02.second')::uuid,1,'reject')$q$,'42501');
select pg_temp.fails($q$select public.room_booking_save_booking('2097-01-02 15:00-03','2097-01-02 16:00-03','Forjado')$q$,'42501');
select pg_temp.fails($q$select public.room_booking_save_booking(null,null,'Forjado',null,current_setting('ag02.booking')::uuid,3)$q$,'42501');
select pg_temp.fails($q$select public.room_booking_save_booking(null,null,null,null,current_setting('ag02.booking')::uuid,3,true)$q$,'42501');
select pg_temp.fails($q$insert into core.user_role_assignments(user_id,role_id,scope_type) select 'a9020000-0000-0000-0000-000000000003',id,'global' from core.roles where key='room_booking_manager'$q$,'42501');
-- Conflito legado é preservado, porém não autoriza gestão nem sua delegação.
reset role;
select set_config('request.jwt.claim.sub','',false);
insert into core.user_role_assignments(user_id,role_id,scope_type)
select 'a9020000-0000-0000-0000-000000000004',id,'global' from core.roles where key='room_booking_manager';
set role authenticated;
select set_config('request.jwt.claim.sub','a9020000-0000-0000-0000-000000000004',false);
select pg_temp.check(not private.has_global_permission('room_booking.manage'));
select pg_temp.check(not exists(select 1 from core.my_access() where permission='room_booking.manage'));
select pg_temp.check(not (public.room_booking_summary() ? 'pending_count'));
select pg_temp.fails($q$select public.room_booking_requests(true)$q$,'42501');
select pg_temp.fails($q$select public.room_booking_decide_request(current_setting('d5b.request')::uuid,1,'approve')$q$,'42501');
select pg_temp.fails($q$select public.room_booking_decide_request(current_setting('d5b.request')::uuid,1,'reject')$q$,'42501');
select pg_temp.fails($q$select public.room_booking_save_booking('2097-01-02 15:00-03','2097-01-02 16:00-03','Forjado')$q$,'42501');
select pg_temp.fails($q$select public.room_booking_save_booking(null,null,null,null,current_setting('ag02.booking')::uuid,3,true)$q$,'42501');
select public.room_booking_decide_request(current_setting('d5b.request')::uuid,1,'cancel');
reset role;
