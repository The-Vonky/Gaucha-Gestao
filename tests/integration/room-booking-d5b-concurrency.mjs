// Duas sessões no banco local existente; nenhuma alteração é confirmada.
import assert from "node:assert/strict";
import { connect, identity } from "./room-booking-local.mjs";
const a = await connect();
const b = await connect();
const observer = await connect();
let pending;
try {
  const user = await identity(a);
  const pid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
  await a.query("begin");
  await a.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
  await a.query("set local role authenticated");
  await a.query("select public.room_booking_schedule('2096-08-04','2096-08-04')");
  await b.query("begin");
  await b.query("set local statement_timeout='10s'");
  pending = b.query("update core.user_role_assignments set active=false where user_id=$1 and active",[user]);
  // Observar o bloqueio real; não inferir concorrência apenas do tempo decorrido.
  let blocked=false;
  for(let i=0;i<50;i++) {
    blocked=(await observer.query("select cardinality(pg_blocking_pids($1))>0 blocked",[pid])).rows[0].blocked;
    if(blocked) break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.equal(blocked,true,"Revogação aguarda autorização em andamento");
  await a.query("rollback");
  await pending;
  await b.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
  await b.query("set local role authenticated");
  await b.query("savepoint check_denial");
  await assert.rejects(b.query("select public.room_booking_schedule('2096-08-04','2096-08-04')"),{code:"42501"});
  await b.query("rollback to check_denial");
  await b.query("rollback");
  assert.equal(await identity(observer),user);
  console.log("PASS concorrência: revogação bloqueada pela autorização; acesso negado após revogar na transação; ROLLBACK preserva atribuições");
} finally {
  await a.query("rollback");
  await pending?.catch(()=>{});
  await b.query("rollback");
  await Promise.all([a.end(),b.end(),observer.end()]);
}
