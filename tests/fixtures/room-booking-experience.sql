-- Identidades existentes fornecidas pelo runner; dados de ensaio sempre sintéticos.
create or replace function pg_temp.check(ok boolean) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'Experience assertion failed'; end if; end $$;
create or replace function pg_temp.fails(command text,expected text) returns void language plpgsql as $$ begin
 begin execute command; exception when others then if sqlstate=expected then return; end if; raise exception 'Expected %, got %',expected,sqlstate; end;
 raise exception 'Expected %, command succeeded: %',expected,command;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.admin'),true);
select pg_temp.fails($q$select public.room_booking_history()$q$,'42501');
select pg_temp.fails($q$select public.room_booking_begin_cover_upload(3,1,1,'image/jpeg')$q$,'42501');
select pg_temp.fails($q$select public.room_booking_save_cover('remove',gen_random_uuid(),1)$q$,'42501');
select set_config('request.jwt.claim.sub',current_setting('test.requester'),true);
select pg_temp.fails($q$select public.room_booking_history()$q$,'42501');
select pg_temp.fails($q$select public.room_booking_begin_cover_upload(3,1,1,'image/jpeg')$q$,'42501');
-- Não omite passado, estado terminal ou cancelamento posterior de reserva.
select set_config('test.request',public.room_booking_create_request('2095-07-11 12:00-03','2095-07-11 13:00-03','Teste experiência',null,gen_random_uuid())::text,true);
select public.room_booking_create_request('2095-07-11 14:00-03','2095-07-11 15:00-03','Teste página '||n,null,gen_random_uuid()) from generate_series(1,28) n;
select set_config('test.reject',public.room_booking_create_request('2095-07-11 16:00-03','2095-07-11 17:00-03','Teste recusa',null,gen_random_uuid())::text,true);
select set_config('test.cancel',public.room_booking_create_request('2095-07-11 18:00-03','2095-07-11 19:00-03','Teste cancelamento',null,gen_random_uuid())::text,true);
select public.room_booking_decide_request(current_setting('test.cancel')::uuid,1,'cancel');
select set_config('request.jwt.claim.sub',current_setting('test.manager'),true);
select set_config('test.booking',public.room_booking_decide_request(current_setting('test.request')::uuid,1,'approve')::text,true);
select public.room_booking_save_booking(null,null,null,null,current_setting('test.booking')::uuid,1,true);
select public.room_booking_decide_request(current_setting('test.reject')::uuid,1,'reject','Motivo sintético');
select set_config('test.page',public.room_booking_history(null,'2095-07-11','2095-07-11')::text,true);
select pg_temp.check(jsonb_array_length(current_setting('test.page')::jsonb->'items')=25 and (current_setting('test.page')::jsonb->>'has_more')::boolean);
select pg_temp.check(jsonb_array_length(public.room_booking_history(null,'2095-07-11','2095-07-11',
 (current_setting('test.page')::jsonb->'items'->24->>'starts_at')::timestamptz,
 (current_setting('test.page')::jsonb->'items'->24->>'id')::uuid)->'items')=6);
select pg_temp.check(public.room_booking_history('approved','2095-07-11','2095-07-11')->'items'->0->>'booking_status'='cancelled');
select pg_temp.check(public.room_booking_history('rejected','2095-07-11','2095-07-11')->'items'->0->>'decision_reason'='Motivo sintético');
select pg_temp.check(jsonb_array_length(public.room_booking_history('cancelled','2095-07-11','2095-07-11')->'items')=1);
select pg_temp.fails($q$select public.room_booking_history('invalid')$q$,'23514');
select pg_temp.fails($q$select public.room_booking_history(null,'2095-07-12','2095-07-11')$q$,'23514');
select pg_temp.check(jsonb_array_length(public.room_booking_schedule('2095-07-11','2095-07-11'))=0);
reset role;
insert into room_booking.requests(room_id,requester_user_id,booked_for,starts_at,ends_at,idempotency_key)
select id,current_setting('test.requester')::uuid,'Teste passado','2000-01-02 12:00-03','2000-01-02 13:00-03',gen_random_uuid() from room_booking.rooms where active;
set local role authenticated;
select pg_temp.check(jsonb_array_length(public.room_booking_history('pending','2000-01-02','2000-01-02')->'items')>=1);
-- Foto: tamanho/formato, confirmação só do objeto existente, leitura restrita e concorrência.
select pg_temp.fails($q$select public.room_booking_begin_cover_upload(1048577,1,1,'image/jpeg')$q$,'23514');
select pg_temp.fails($q$select public.room_booking_begin_cover_upload(3,1,1,'image/png')$q$,'23514');
select pg_temp.fails($q$select public.room_booking_begin_cover_upload(3,3000,1,'image/jpeg')$q$,'23514');
select set_config('test.version',(public.room_booking_cover()->>'version'),true);
select set_config('test.asset',public.room_booking_begin_cover_upload(3,1,1,'image/jpeg')::text,true);
select pg_temp.fails($q$select public.room_booking_save_cover('confirm',(current_setting('test.asset')::jsonb->>'asset_id')::uuid,current_setting('test.version')::int)$q$,'23514');
select set_config('storage.operation','storage.object.upload',true);
insert into storage.objects(bucket_id,name,owner_id,metadata) values('room-covers',current_setting('test.asset')::jsonb->>'object_key',auth.uid()::text,'{"size":3,"mimetype":"image/jpeg"}');
select public.room_booking_save_cover('confirm',(current_setting('test.asset')::jsonb->>'asset_id')::uuid,current_setting('test.version')::int,25,75);
select pg_temp.check(public.room_booking_cover()->>'position_x'='25.00');
select pg_temp.check(exists(select 1 from storage.objects where name=current_setting('test.asset')::jsonb->>'object_key'));
select pg_temp.fails($q$select public.room_booking_save_cover('position',(current_setting('test.asset')::jsonb->>'asset_id')::uuid,current_setting('test.version')::int,80,20)$q$,'40001');
select public.room_booking_save_cover('position',(current_setting('test.asset')::jsonb->>'asset_id')::uuid,(public.room_booking_cover()->>'version')::int,80,20);
select pg_temp.check(public.room_booking_cover()->>'position_y'='20.00');
select set_config('test.asset2',public.room_booking_begin_cover_upload(3,1,1,'image/jpeg')::text,true);
insert into storage.objects(bucket_id,name,owner_id,metadata) values('room-covers',current_setting('test.asset2')::jsonb->>'object_key',auth.uid()::text,'{"size":3,"mimetype":"image/jpeg"}');
select public.room_booking_save_cover('confirm',(current_setting('test.asset2')::jsonb->>'asset_id')::uuid,(public.room_booking_cover()->>'version')::int);
select pg_temp.check(not exists(select 1 from storage.objects where name=current_setting('test.asset')::jsonb->>'object_key'));
select set_config('request.jwt.claim.sub',current_setting('test.requester'),true);
select pg_temp.check(public.room_booking_cover()->>'asset_id'=current_setting('test.asset2')::jsonb->>'asset_id');
select pg_temp.check(exists(select 1 from storage.objects where name=current_setting('test.asset2')::jsonb->>'object_key'));
select pg_temp.fails($q$insert into storage.objects(bucket_id,name,owner_id,metadata) values('room-covers','forged.jpg',auth.uid()::text,'{}')$q$,'42501');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.check(not exists(select 1 from storage.objects where bucket_id='room-covers'));
select pg_temp.fails($q$select public.room_booking_cover()$q$,'42501');
select set_config('request.jwt.claim.sub',current_setting('test.manager'),true);
select public.room_booking_save_cover('remove',(current_setting('test.asset2')::jsonb->>'asset_id')::uuid,(public.room_booking_cover()->>'version')::int);
select pg_temp.check(public.room_booking_cover()->>'asset_id' is null);
select set_config('test.cancel_asset',public.room_booking_begin_cover_upload(3,1,1,'image/jpeg')::text,true);
select public.room_booking_save_cover('cancel',(current_setting('test.cancel_asset')::jsonb->>'asset_id')::uuid,1);
reset role;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.check((select count(*)>=8 from core.system_audit_log where module='room_booking' and action like 'cover_%'));
-- Resumo usa relógio do servidor e expõe apenas término, nunca dados privados.
insert into room_booking.bookings(room_id,booked_for,starts_at,ends_at,created_by,updated_by)
select id,'Teste resumo',date_trunc('minute',clock_timestamp()),date_trunc('minute',clock_timestamp())+interval '1 minute',current_setting('test.manager')::uuid,current_setting('test.manager')::uuid from room_booking.rooms r where active and not exists(select 1 from room_booking.bookings b where b.room_id=r.id and b.status='confirmed' and tstzrange(b.starts_at,b.ends_at,'[)') && tstzrange(date_trunc('minute',clock_timestamp()),date_trunc('minute',clock_timestamp())+interval '1 minute','[)'));
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.requester'),true);
select pg_temp.check((public.room_booking_summary()->>'in_use')::boolean and public.room_booking_summary()->>'in_use_until' is not null);
select pg_temp.check(not(public.room_booking_summary() ? 'requester_name') and not(public.room_booking_summary() ? 'pending_count'));
reset role;
