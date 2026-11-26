// CI descartável. Reutiliza Auth real, usuário por unidade, Storage API e duas sessões PostgreSQL.
import { A, api, attach, bucket, clients, db, fails, inspection, must, session, setup, users } from "./audit-evidence-fixture.mjs";
import assert from "node:assert/strict";
let phase = "fixture";
try {
  await setup();
  await db.query(`insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
    select $1,id,'unit',$2 from core.roles where key='quality'`, [users.unit,A]);
  const target = await inspection(A,"unit");
  const other = await inspection(A,"unit");
  const own = await attach("unit", target);
  const saved = await attach("unit", other);
  const args = {p_inspection:target};
  const rpc = (name, extra={}) => api("unit").rpc(name,{...args,...extra});
  const impact = must(await rpc("inspection_delete_impact"));
  phase = "autorização e concorrência";
  for (const who of ["reader","sector","other","inactive","empty"]) {
    fails(await api(who).rpc("inspection_delete_impact",args),"42501");
  }
  const confirmation = {p_snapshot:impact.snapshot,p_confirmation:"excluir auditoria"};
  const writer = await session("audit-delete-writer","unit");
  try {
    await writer.query("begin");
    await writer.query("update audit.inspection_answers set response='AP' where inspection_id=$1 and item_key='item-001'",[target]);
    fails(await rpc("begin_inspection_delete",confirmation),"40001");
    await writer.query("commit");
  } finally { await writer.end(); }
  fails(await rpc("begin_inspection_delete",confirmation),"40001");
  confirmation.p_snapshot = must(await rpc("inspection_delete_impact")).snapshot;
  must(await rpc("begin_inspection_delete",confirmation));
  phase = "inventário e retomada";
  fails(await rpc("finish_inspection_delete"),"55000");
  const objects = must(await rpc("inspection_delete_state")).objects;
  assert.equal(objects.length,1);
  const removed = must(await bucket("unit").remove([own.object_key, saved.object_key]));
  assert.equal(removed.length,1);
  assert.equal(removed[0].name,own.object_key);
  must(await clients.unit.storage.from("audit-checklist-evidence").download(saved.object_key));
  must(await rpc("finish_inspection_delete"));
  must(await rpc("finish_inspection_delete"));
  assert.equal((await db.query("select from action_plans.plans where source_inspection_id=$1",[target])).rowCount,0);
  assert.equal((await db.query("select from audit.inspections where id=$1",[other])).rowCount,1);
  console.log("PASS AUD-DELETE-01 JWT, instantâneo, concorrência, Storage e retomada no perfil base");
} catch (error) {
  console.error("Falha AUD-DELETE-01 na fase " + phase + " (" + String(error.code || "verificação") + ")");
  process.exitCode=1;
} finally { await db.end(); }
