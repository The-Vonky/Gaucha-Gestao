begin;
-- AG-01: fundação privada; RPCs e regras temporais transacionais pertencem ao AG-02.
create schema room_booking;
revoke all on schema room_booking from public, anon, authenticated;
create extension if not exists btree_gist with schema room_booking;
-- Inclui o schema real da extensão, mesmo se já instalada em outro schema.
do $$ declare extension_schema text; begin
 select n.nspname into strict extension_schema from pg_extension e
 join pg_namespace n on n.oid=e.extnamespace where e.extname='btree_gist';
 perform set_config('search_path',format('pg_catalog,%I',extension_schema),true);
end $$;

create table room_booking.rooms (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check(length(btrim(name)) between 1 and 160),
 active boolean not null default true,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp()
);
insert into room_booking.rooms(name) values ('Sala de Reunião');

create table room_booking.requests (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references room_booking.rooms(id),
 requester_user_id uuid not null references core.profiles(id),
 booked_for text not null check(length(btrim(booked_for)) between 1 and 160),
 purpose text check(length(purpose)<=2000),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
 decided_by uuid references core.profiles(id),
 decided_at timestamptz,
 decision_reason text check(length(decision_reason)<=2000),
 cancelled_by uuid references core.profiles(id),
 cancelled_at timestamptz,
 idempotency_key uuid not null,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(requester_user_id,idempotency_key),
 unique(id,room_id),
 check(isfinite(starts_at) and isfinite(ends_at) and ends_at>starts_at),
 check((starts_at at time zone 'America/Sao_Paulo')::date=(ends_at at time zone 'America/Sao_Paulo')::date),
 check((ends_at at time zone 'America/Sao_Paulo')::time<=time '23:59'),
 check(date_trunc('minute',starts_at at time zone 'America/Sao_Paulo')=starts_at at time zone 'America/Sao_Paulo'
   and date_trunc('minute',ends_at at time zone 'America/Sao_Paulo')=ends_at at time zone 'America/Sao_Paulo'),
 check((status in ('approved','rejected') and decided_by is not null and decided_at is not null)
   or (status in ('pending','cancelled') and decided_by is null and decided_at is null)),
 check(decision_reason is null or status='rejected'),
 check((status='cancelled' and cancelled_by is not null and cancelled_at is not null and cancelled_by=requester_user_id)
   or (status<>'cancelled' and cancelled_by is null and cancelled_at is null))
);
create index requests_queue on room_booking.requests(status,starts_at,created_at,id);
create index requests_own on room_booking.requests(requester_user_id,created_at desc,id);
create index requests_room on room_booking.requests(room_id);
create index requests_decider on room_booking.requests(decided_by) where decided_by is not null;
create index requests_canceller on room_booking.requests(cancelled_by) where cancelled_by is not null;

create table room_booking.bookings (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references room_booking.rooms(id),
 request_id uuid unique,
 booked_for text not null check(length(btrim(booked_for)) between 1 and 160),
 secretary_notes text check(length(secretary_notes)<=2000),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 status text not null default 'confirmed' check(status in ('confirmed','cancelled')),
 created_by uuid not null references core.profiles(id),
 updated_by uuid not null references core.profiles(id),
 cancelled_by uuid references core.profiles(id),
 cancelled_at timestamptz,
 cancel_reason text check(length(cancel_reason)<=2000),
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 foreign key(request_id,room_id) references room_booking.requests(id,room_id),
 check(isfinite(starts_at) and isfinite(ends_at) and ends_at>starts_at),
 check((starts_at at time zone 'America/Sao_Paulo')::date=(ends_at at time zone 'America/Sao_Paulo')::date),
 check((ends_at at time zone 'America/Sao_Paulo')::time<=time '23:59'),
 check(date_trunc('minute',starts_at at time zone 'America/Sao_Paulo')=starts_at at time zone 'America/Sao_Paulo'
   and date_trunc('minute',ends_at at time zone 'America/Sao_Paulo')=ends_at at time zone 'America/Sao_Paulo'),
 check((status='cancelled' and cancelled_by is not null and cancelled_at is not null)
   or (status='confirmed' and cancelled_by is null and cancelled_at is null and cancel_reason is null)),
 exclude using gist(room_id with =,tstzrange(starts_at,ends_at,'[)') with &&) where(status='confirmed')
);
create index bookings_room on room_booking.bookings(room_id);
create index bookings_schedule on room_booking.bookings(room_id,starts_at,id) where status='confirmed';
create index bookings_creator on room_booking.bookings(created_by);
create index bookings_updater on room_booking.bookings(updated_by);
create index bookings_canceller on room_booking.bookings(cancelled_by) where cancelled_by is not null;

-- Sem políticas permissivas: até AG-02 nenhum cliente lê tabelas brutas.
-- RLS não oculta colunas; liberar SELECT aqui vazaria dados privados.
alter table room_booking.rooms enable row level security;
alter table room_booking.requests enable row level security;
alter table room_booking.bookings enable row level security;
create policy rooms_client_deny on room_booking.rooms as restrictive for all to anon,authenticated using(false) with check(false);
create policy requests_client_deny on room_booking.requests as restrictive for all to anon,authenticated using(false) with check(false);
create policy bookings_client_deny on room_booking.bookings as restrictive for all to anon,authenticated using(false) with check(false);
revoke all on all tables in schema room_booking from public,anon,authenticated;
revoke all on all sequences in schema room_booking from public,anon,authenticated;
revoke all on all functions in schema room_booking from public,anon,authenticated;

insert into core.permissions(key,domain,resource,action,description) values
('room_booking.schedule.read','room_booking','schedule','read','Consultar agenda confirmada'),
('room_booking.request.create','room_booking','request','create','Solicitar uso de sala'),
('room_booking.request.read_own','room_booking','request','read_own','Consultar e cancelar pedido próprio elegível'),
('room_booking.manage','room_booking','booking','manage','Gerenciar pedidos e reservas');
insert into core.roles(key,name,description,system,global_only) values
('room_booking_requester','Solicitante de sala','Solicitações individuais e consulta da agenda',true,true),
('room_booking_manager','Gestor de sala','Gestão de pedidos e reservas',true,true);
insert into core.role_permissions(role_id,permission_key)
select r.id,p.key from core.roles r cross join core.permissions p
where p.domain='room_booking' and r.system and
 (r.key in ('room_booking_manager','platform_administrator')
 or (r.key='room_booking_requester' and p.key<>'room_booking.manage'));
-- Não atribuir papéis a usuários. Delegação/revogação usam o Core auditado.
-- F2, transições, versão esperada, autoria por auth.uid(), auditoria de negócio
-- e validação do instante após travas serão implementadas nas RPCs de AG-02.
commit;
