-- Usar somente em transação com ROLLBACK. Identidades e reuniões sintéticas.
create function pg_temp.check(ok boolean, description text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'Falhou: %', description; end if;
end $$;

create function pg_temp.fails(command text, expected text) returns void language plpgsql as $$
begin
  begin
    execute command;
  exception when others then
    if sqlstate = expected then return; end if;
    raise exception 'Esperado %, obtido % ao executar %', expected, sqlstate, command;
  end;
  raise exception 'Esperado %, mas o comando passou: %', expected, command;
end $$;

select set_config('gg.manager', gen_random_uuid()::text, true),
       set_config('gg.requester', gen_random_uuid()::text, true),
       set_config('gg.admin', gen_random_uuid()::text, true),
       set_config('gg.substitute', gen_random_uuid()::text, true);

insert into auth.users (id, raw_user_meta_data)
select current_setting(actor)::uuid, jsonb_build_object('display_name', name)
from (values ('gg.manager', 'Gestora Sintética'), ('gg.requester', 'Solicitante Sintético'),
             ('gg.admin', 'Admin Sintético'), ('gg.substitute', 'Substituta Sintética')) actors(actor, name);
insert into core.user_role_assignments (user_id, role_id, scope_type)
select current_setting(actors.actor)::uuid, r.id, 'global'
from (values ('gg.manager', 'room_booking_manager'), ('gg.substitute', 'room_booking_manager'),
             ('gg.requester', 'room_booking_requester'), ('gg.admin', 'platform_administrator')) actors(actor, role)
join core.roles r on r.key = actors.role;

-- GG-08: inicialização, dados normalizados, leitura e versão.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gg.manager'), true);
select set_config('gg.room', public.room_booking_contact()->>'room_id', true);
select pg_temp.check((public.room_booking_contact()->>'version')::int = 0
  and public.room_booking_contact()->>'responsible_name' is null, 'contato ainda não configurado');
select pg_temp.fails($q$select public.room_booking_save_contact(current_setting('gg.room')::uuid, '   ', '0123', 0)$q$, '23514');
select pg_temp.fails($q$select public.room_booking_save_contact(current_setting('gg.room')::uuid, '<b>Nome</b>', '0123', 0)$q$, '23514');
select pg_temp.fails($q$select public.room_booking_save_contact(current_setting('gg.room')::uuid, E'Nome\nInválido', '0123', 0)$q$, '23514');
select pg_temp.fails($q$select public.room_booking_save_contact(current_setting('gg.room')::uuid, 'nome@example.test', '0123', 0)$q$, '23514');
select pg_temp.fails($q$select public.room_booking_save_contact(current_setting('gg.room')::uuid, repeat('A', 121), '0123', 0)$q$, '23514');
select pg_temp.fails($q$select public.room_booking_save_contact(current_setting('gg.room')::uuid, 'Nome', '+55 12', 0)$q$, '23514');
select pg_temp.fails($q$select public.room_booking_save_contact(current_setting('gg.room')::uuid, 'Nome', '123456789', 0)$q$, '23514');
select pg_temp.fails($q$select public.room_booking_save_contact(gen_random_uuid(), 'Nome', '0123', 0)$q$, '40001');
select pg_temp.check(public.room_booking_save_contact(current_setting('gg.room')::uuid, '  Ágata D’Ávila-Silva  ', ' 0123 ', 0)->>'version' = '1',
  'gestora cadastra contato');
select pg_temp.fails($q$select public.room_booking_save_contact(current_setting('gg.room')::uuid, 'Versão antiga', '1000', 0)$q$, '40001');
select pg_temp.check(public.room_booking_contact()->>'responsible_name' = 'Ágata D’Ávila-Silva'
  and public.room_booking_contact()->>'extension' = '0123', 'releitura preserva nome e zero inicial');

select set_config('request.jwt.claim.sub', current_setting('gg.requester'), true);
select pg_temp.check(public.room_booking_contact()->>'extension' = '0123', 'solicitante lê contato');
select pg_temp.fails($q$select public.room_booking_save_contact(current_setting('gg.room')::uuid, 'Solicitante', '4321', 1)$q$, '42501');
select pg_temp.fails($q$select * from room_booking.room_contacts$q$, '42501');
select pg_temp.fails($q$select public.room_booking_direct_history()$q$, '42501');
select pg_temp.fails($q$select public.room_booking_history()$q$, '42501');
select set_config('request.jwt.claim.sub', current_setting('gg.admin'), true);
select pg_temp.check(public.room_booking_contact()->>'extension' = '0123', 'admin lê contato com schedule.read');
select pg_temp.fails($q$select public.room_booking_save_contact(current_setting('gg.room')::uuid, 'Admin', '4321', 1)$q$, '42501');
select pg_temp.fails($q$select public.room_booking_direct_history()$q$, '42501');

reset role;
select set_config('request.jwt.claim.sub', '', true);
insert into core.user_role_assignments (user_id, role_id, scope_type)
select current_setting('gg.admin')::uuid, id, 'global' from core.roles where key = 'room_booking_manager';
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gg.admin'), true);
select pg_temp.fails($q$select public.room_booking_save_contact(current_setting('gg.room')::uuid, 'Admin em conflito', '4321', 1)$q$, '42501');
select pg_temp.fails($q$select public.room_booking_direct_history()$q$, '42501');

select set_config('request.jwt.claim.sub', current_setting('gg.substitute'), true);
select pg_temp.check(public.room_booking_save_contact(current_setting('gg.room')::uuid, 'Nome da Substituta', '0123', 1)->>'version' = '2',
  'substituta D6 atualiza contato');
select pg_temp.fails($q$select public.room_booking_save_contact(current_setting('gg.room')::uuid, 'Versão antiga', '4321', 1)$q$, '40001');

reset role;
select pg_temp.check((
  select count(*) = 2
  from core.system_audit_log
  where module = 'room_booking' and action = 'contact_save'
    and entity_type = 'room_contacts' and entity_id = current_setting('gg.room')
    and occurred_at is not null and (
      (actor_user_id = current_setting('gg.manager')::uuid and before_data is null
        and after_data = '{"version": 1, "name_changed": true, "extension_changed": true}')
      or
      (actor_user_id = current_setting('gg.substitute')::uuid and before_data = '{"version": 1}'
        and after_data = '{"version": 2, "name_changed": true, "extension_changed": false}')
    )
), 'auditoria registra autoria, data e campos alterados');

-- GG-09: exercício das RPCs existentes e separação das origens.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gg.requester'), true);
select set_config('gg.request', public.room_booking_create_request(
  '2095-10-24 22:00-03', '2095-10-24 22:30-03', 'Solicitação sintética', 'Finalidade privada', gen_random_uuid()
)::text, true);
select set_config('request.jwt.claim.sub', current_setting('gg.manager'), true);
select public.room_booking_decide_request(current_setting('gg.request')::uuid, 1, 'approve');
select pg_temp.check(public.room_booking_history('approved', '2095-10-24', '2095-10-24')->'items'->0->>'id' = current_setting('gg.request'),
  'pedido aprovado mantém histórico existente');
select set_config('gg.direct', public.room_booking_save_booking(
  '2095-10-24 23:40-03', '2095-10-24 23:59-03', 'Direta sintética'
)::text, true);
select public.room_booking_save_booking(
  '2095-10-24 23:40-03', '2095-10-24 23:59-03', 'Direta editada', 'Observação sintética',
  current_setting('gg.direct')::uuid, 1
);
select pg_temp.check(public.room_booking_direct_history('confirmed', '2095-10-24', '2095-10-24')->'items'->0 @>
  jsonb_build_object('id', current_setting('gg.direct'), 'booked_for', 'Direta editada',
    'created_by_name', 'Gestora Sintética', 'secretary_notes', 'Observação sintética'),
  'histórico direto usa data civil de São Paulo, autoria e valor após edição');
select pg_temp.check(public.room_booking_direct_history(null, '2095-10-25', '2095-10-25')->'items' = '[]',
  'início em 25/10 UTC ainda pertence a 24/10 em São Paulo');
select public.room_booking_save_booking(null, null, null, null, current_setting('gg.direct')::uuid, 2, true, 'Cancelamento sintético');
select pg_temp.check(public.room_booking_direct_history('cancelled', '2095-10-24', '2095-10-24')->'items'->0 @>
  jsonb_build_object('id', current_setting('gg.direct'), 'cancelled_by_name', 'Gestora Sintética', 'cancel_reason', 'Cancelamento sintético'),
  'direta cancelada segue consultável');
select pg_temp.check(public.room_booking_direct_history('confirmed', '2095-10-24', '2095-10-24')->'items' = '[]'
  and jsonb_array_length(public.room_booking_history(null, '2095-10-24', '2095-10-24')->'items') = 1,
  'reserva vinculada ausente de diretas e nenhuma solicitação artificial');

-- Reservas canceladas no mesmo horário forçam o desempate por UUID.
do $$
declare id uuid;
begin
  for n in 1..27 loop
    id := public.room_booking_save_booking('2095-10-24 23:40-03', '2095-10-24 23:59-03', 'Página sintética ' || n);
    perform public.room_booking_save_booking(null, null, null, null, id, 1, true);
  end loop;
end $$;
do $$
declare
  first_page jsonb := public.room_booking_direct_history('cancelled', '2095-10-24', '2095-10-24');
  boundary jsonb := first_page->'items'->24;
  next_page jsonb := public.room_booking_direct_history('cancelled', '2095-10-24', '2095-10-24',
    (boundary->>'starts_at')::timestamptz, (boundary->>'id')::uuid);
begin
  perform pg_temp.check(jsonb_array_length(first_page->'items') = 25 and (first_page->>'has_more')::boolean,
    'primeira página tem 25 itens e sentinela');
  perform pg_temp.check(jsonb_array_length(next_page->'items') = 3 and not (next_page->>'has_more')::boolean,
    'segunda página tem as três reservas restantes');
  perform pg_temp.check((select count(distinct item->>'id') = 28
    from jsonb_array_elements((first_page->'items') || (next_page->'items')) as item),
    'desempate por UUID evita repetição na paginação');
  perform pg_temp.check(boundary->>'created_at' is not null and boundary->>'updated_at' is not null
    and boundary->>'cancelled_at' is not null and not (boundary ? 'created_by') and not (boundary ? 'request_id'),
    'timestamps persistidos sem identificadores de identidade ou pedido');
end $$;
select pg_temp.fails($q$select public.room_booking_direct_history('approved')$q$, '23514');
select pg_temp.fails($q$select public.room_booking_direct_history(null, '2095-10-25', '2095-10-24')$q$, '23514');
select pg_temp.fails($q$select public.room_booking_direct_history(null, null, null, now())$q$, '23514');
select pg_temp.fails($q$select public.room_booking_direct_history(null, '-infinity')$q$, '23514');

-- Mesmo sub após inativação e revogação. D6 segue a atribuição efetiva do Core.
reset role;
select set_config('request.jwt.claim.sub', '', true);
update core.profiles set active = false where id = current_setting('gg.substitute')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gg.substitute'), true);
select pg_temp.fails($q$select public.room_booking_contact()$q$, '42501');
select pg_temp.fails($q$select public.room_booking_save_contact(current_setting('gg.room')::uuid, 'Inativa', '0123', 2)$q$, '42501');
select pg_temp.fails($q$select public.room_booking_direct_history()$q$, '42501');
select pg_temp.fails($q$select public.room_booking_history()$q$, '42501');
reset role;
select set_config('request.jwt.claim.sub', '', true);
update core.profiles set active = true where id = current_setting('gg.substitute')::uuid;
update core.user_role_assignments set active = false where user_id = current_setting('gg.substitute')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('gg.substitute'), true);
select pg_temp.fails($q$select public.room_booking_contact()$q$, '42501');
select pg_temp.fails($q$select public.room_booking_save_contact(current_setting('gg.room')::uuid, 'Revogada', '0123', 2)$q$, '42501');
select pg_temp.fails($q$select public.room_booking_direct_history()$q$, '42501');
select pg_temp.fails($q$select public.room_booking_history()$q$, '42501');
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.fails($q$select public.room_booking_contact()$q$, '42501');
select pg_temp.fails($q$select public.room_booking_save_contact(current_setting('gg.room')::uuid, 'Anônimo', '0123', 2)$q$, '42501');
select pg_temp.fails($q$select public.room_booking_direct_history()$q$, '42501');
reset role;
