// Somente gaucha-gestao-local existente. Todos os ensaios são revertidos.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { connect, identity } from "./room-booking-local.mjs";
const db = await connect();
try {
  const user = await identity(db);
  const snapshot = async () => (await db.query(`select
    (select count(*) from auth.users) users,
    (select jsonb_agg(to_jsonb(a) order by id) from core.user_role_assignments a) assignments,
    (select count(*) from room_booking.requests) requests,
    (select count(*) from room_booking.bookings) bookings,
    (select count(*) from core.system_audit_log) audit`)).rows;
  const before = await snapshot();
  await db.query("begin");
  await db.query(`create function pg_temp.fails(command text) returns void language plpgsql as $$
    begin begin execute command; exception when insufficient_privilege then return; end;
    raise exception 'Operação deveria ser negada'; end $$`);
  const asUser = async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    await db.query("set local role authenticated");
  };
  const technical = async () => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',true)");
  };
  const denied = async (sql) => db.query("select pg_temp.fails($1)", [sql]);
  const rpc = async (sql, params=[]) => (await db.query(sql,params)).rows[0].result;
  await asUser();
  const access = (await db.query("select permission from core.my_access() where permission like 'room_booking.%'")).rows;
  assert.equal(access.length,3);
  assert.deepEqual(await rpc("select public.room_booking_schedule('2096-08-04','2096-08-04') result"),[]);
  const request = await rpc("select public.room_booking_create_request('2096-08-04 14:07-03','2096-08-04 14:23-03','Ensaio D5-B',null,gen_random_uuid()) result");
  assert.ok((await rpc("select public.room_booking_requests(false) result")).some(r=>r.id===request));
  const noManagement = async () => {
    assert.equal(Object.hasOwn(await rpc("select public.room_booking_summary() result"),"pending_count"),false);
    await denied("select public.room_booking_requests(true)");
    for (const action of ["approve","reject"])
      await denied(`select public.room_booking_decide_request('${request}',1,'${action}')`);
    await denied("select public.room_booking_save_booking('2096-08-04 15:00-03','2096-08-04 16:00-03','Forjado')");
    for (const cancel of [false,true])
      await denied(`select public.room_booking_save_booking(null,null,'Forjado',null,'${request}',1,${cancel})`);
    assert.equal((await db.query("select * from core.my_access() where permission='room_booking.manage'")).rowCount,0);
  };
  await noManagement();
  console.log("PASS administrador: agenda/pedido próprio; gestão/fila/contador negados");
  await technical();
  await db.query(`insert into core.user_role_assignments(user_id,role_id,scope_type)
    select $1,id,'global' from core.roles where key='room_booking_manager'
    on conflict do nothing`,[user]);
  await db.query(`update core.user_role_assignments set active=true where user_id=$1
    and role_id=(select id from core.roles where key='room_booking_manager')`,[user]);
  await asUser();
  await noManagement();
  console.log("PASS atribuição simultânea: bloqueio permanece nas RPCs e core.my_access");
  await technical();
  await db.query(`update core.user_role_assignments set active=false where user_id=$1
    and role_id in (select id from core.roles where key in ('platform_administrator','room_booking_manager'))`,[user]);
  await db.query(`select set_config('room_booking.operator_id',$1,true),set_config('room_booking.target_id',$1,true),
    set_config('room_booking.authorization_ref','PR #88 ensaio local revertido',true),set_config('room_booking.provision_action','grant',true)`,[user]);
  const procedure = readFileSync("scripts/ops/room-booking-manager.sql","utf8");
  await db.query(procedure);
  await asUser();
  const booking = await rpc("select public.room_booking_decide_request($1,1,'approve') result",[request]);
  const second = await rpc("select public.room_booking_create_request('2096-08-04 16:00-03','2096-08-04 17:00-03','Recusar',null,gen_random_uuid()) result");
  await db.query("select public.room_booking_decide_request($1,1,'reject')",[second]);
  await db.query("select public.room_booking_save_booking('2096-08-04 14:07-03','2096-08-04 14:23-03','Editado',null,$1,1)",[booking]);
  await db.query("select public.room_booking_save_booking(null,null,null,null,$1,2,true)",[booking]);
  await db.query("select public.room_booking_save_booking('2096-08-04 15:00-03','2096-08-04 16:00-03','Direta')");
  assert.ok(Object.hasOwn(await rpc("select public.room_booking_summary() result"),"pending_count"));
  console.log("PASS gestor: aprovação, recusa, reserva direta, edição e cancelamento");
  await technical();
  await db.query("select set_config('room_booking.provision_action','revoke',true)");
  await db.query(procedure);
  assert.equal((await db.query("select * from core.system_audit_log where metadata->>'authorization_ref'='PR #88 ensaio local revertido' and actor_user_id=$1",[user])).rowCount,2);
  await asUser();
  await denied("select public.room_booking_requests(true)");
  await technical();
  console.log("PASS provisionamento/revogação com autoria, referência, antes/depois e bloqueio após revogação");
  await db.query("rollback");
  assert.deepEqual(await snapshot(),before);
  console.log("PASS preservação integral: usuários, atribuições, reservas, pedidos e auditoria após ROLLBACK");
} finally { await db.query("rollback"); await db.end(); }
