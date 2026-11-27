// CI descartável. Reutiliza Auth real, usuário por unidade, Storage API e duas sessões PostgreSQL.
import { A, B, api, attach, bucket, clients, db, fails, inspection, must, session, setup, users } from "./audit-evidence-fixture.mjs";
import assert from "node:assert/strict";
let phase = "fixture";
try {
  await setup();
  await db.query(`insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
    select $1,id,'unit',$2 from core.roles where key='quality'`, [users.unit,A]);
  const oldest = await inspection(A);
  const other = await inspection(A);
  const target = await inspection(A);
  // Os dois planos da outra auditoria compartilham created_at.
  await db.query("update audit.inspection_answers set response='AP' where inspection_id=$1 and item_key in ('item-001','item-002')",[other]);
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
  phase = "cursores após exclusão da primeira página";
  const auditPage = (cursor) => api("unit").rpc("inspection_summaries_page", {
    p_unit:A, p_before_applied_on:cursor?.applied_on ?? null,
    p_before_created_at:cursor?.created_at ?? null, p_before_id:cursor?.id ?? null,
  }).limit(1);
  const planPage = (cursor) => clients.unit.schema("action_plans").rpc("plan_summaries_page", {
    p_before_created_at:cursor?.created_at ?? null, p_before_id:cursor?.id ?? null,
  }).limit(1);
  const [lastAudit] = must(await auditPage());
  const [lastPlan] = must(await planPage());
  assert.equal(lastAudit.id,target);
  assert.equal(lastPlan.plan.source_inspection_id,target);
  const planRpc = (who, name, args) => clients[who].schema("action_plans").rpc(name,args);
  const planImpact = id => planRpc("unit","plan_delete_impact",{p_plan:id});
  const phrase = "excluir plano de ação";
  const beginPlan = (id,snapshot,p_confirmation=phrase) =>
    planRpc("unit","begin_plan_delete",{p_plan:id,p_snapshot:snapshot,p_confirmation});
  const beforeAuditDelete = must(await planImpact(lastPlan.plan.id));
  must(await rpc("begin_inspection_delete",confirmation));
  fails(await beginPlan(lastPlan.plan.id,beforeAuditDelete.snapshot),"55000");
  const [nextAudit] = must(await auditPage(lastAudit));
  assert.equal(nextAudit.id,other);
  assert.equal(must(await auditPage(nextAudit))[0].id,oldest);
  const [nextPlan] = must(await planPage(lastPlan.plan));
  const [followingPlan] = must(await planPage(nextPlan.plan));
  assert.equal(nextPlan.plan.source_inspection_id,other);
  assert.equal(followingPlan.plan.source_inspection_id,other);
  assert.equal(nextPlan.plan.created_at,followingPlan.plan.created_at);
  assert.ok(nextPlan.plan.id < followingPlan.plan.id);
  assert.deepEqual(must(await planPage(followingPlan.plan)),[]);
  assert.deepEqual(must(await api("other").rpc("inspection_summaries_page", {
    p_unit:A,p_before_applied_on:lastAudit.applied_on,
    p_before_created_at:lastAudit.created_at,p_before_id:lastAudit.id,
  })),[]);
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

  phase = "AP-01 escopo, bloqueio concorrente e retomada";
  await db.query(`insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
    select $1::uuid,id,'unit',$3::uuid from core.roles where key='quality'
    union all select $2::uuid,id,'unit',$4::uuid from core.roles where key='quality_viewer'`, [users.other,users.reader,B,A]);
  const ap = nextPlan.plan;
  const planArgs = {p_plan:ap.id};
  const planStorage = clients.unit.storage.from("action-plan-evidence");
  const bytes = Buffer.from("%PDF-1.4\n% AP-01\n");
  const reserve = async () => must(await planRpc("unit","begin_evidence_upload",{...planArgs,p_kind:"execution",
    p_original_name:"teste.pdf",p_content_type:"application/pdf",p_size:bytes.length}))[0];
  const snapshot = must(await planImpact(ap.id)).snapshot;
  for (const who of ["reader","other","sector","inactive","empty"]) {
    fails(await planRpc(who,"plan_delete_impact",planArgs),"42501");
  }
  fails(await beginPlan(ap.id,snapshot,"Excluir plano de ação"),"22023");
  const file = await reserve();
  must(await planStorage.upload(file.object_key,bytes,{contentType:"application/pdf"}));
  must(await planRpc("unit","confirm_evidence_upload",{p_evidence:file.evidence_id}));
  const fresh = must(await planImpact(ap.id));
  assert.equal(fresh.counts.execution_evidence,1);
  assert.equal(fresh.counts.objects,1);
  fails(await beginPlan(ap.id,snapshot),"40001");
  const auditArgs = {p_inspection:other};
  const auditSnapshot = must(await api("unit").rpc("inspection_delete_impact",auditArgs)).snapshot;
  const beginAudit = () => api("unit").rpc("begin_inspection_delete",{
    ...auditArgs,p_snapshot:auditSnapshot,p_confirmation:"excluir auditoria",
  });
  const concurrent = await session("ap-01-delete","unit");
  try {
    await concurrent.query("begin");
    await concurrent.query("select action_plans.begin_plan_delete($1,$2,$3)",[ap.id,fresh.snapshot,phrase]);
    fails(await beginAudit(),"40001");
    await concurrent.query("commit");
  } finally { await concurrent.end(); }
  fails(await beginAudit(),"55000");
  must(await beginPlan(ap.id,fresh.snapshot));
  assert.deepEqual(must(await planRpc("unit","plan_summaries",planArgs)),[]);
  assert.deepEqual(must(await planRpc("unit","plan_evidence",planArgs)),[]);
  fails(await planStorage.download(file.object_key));
  fails(await planRpc("unit","finish_plan_delete",planArgs),"55000");
  assert.equal(must(await planRpc("unit","pending_plan_deletions",planArgs)).length,1);
  await db.query("update core.user_role_assignments set active=false where user_id=$1 and role_id=(select id from core.roles where key='quality')",[users.unit]);
  fails(await planRpc("unit","plan_delete_state",planArgs),"42501");
  const denied = await planStorage.remove([file.object_key]);
  assert.ok(denied.error || denied.data.length === 0);
  await db.query("update core.user_role_assignments set active=true where user_id=$1 and role_id=(select id from core.roles where key='quality')",[users.unit]);
  assert.equal(must(await planStorage.remove([file.object_key])).length,1);
  must(await planRpc("unit","finish_plan_delete",planArgs));
  must(await planRpc("unit","finish_plan_delete",planArgs));

  phase = "AP-01 ciclo automático e preservação";
  const answerRow = () => db.query("select * from audit.inspection_answers where inspection_id=$1 and item_key=$2",[other,ap.source_item_key]);
  const [beforeAnswer] = (await answerRow()).rows;
  assert.equal(beforeAnswer.response,"AP");
  const sourcePlans = () => planRpc("unit","plan_summaries",{p_inspection:other});
  assert.deepEqual(must(await sourcePlans()).map(s => s.plan.id),[followingPlan.plan.id]);
  const setResponse = (response) => db.query("update audit.inspection_answers set response=$1, observation='AP-01' where inspection_id=$2 and item_key=$3",[response,other,ap.source_item_key]);
  await setResponse("AP");
  await setResponse("NAT");
  assert.equal(must(await sourcePlans()).length,1);
  await setResponse("AT");
  await setResponse("NAT");
  const recreated = must(await sourcePlans()).find(s => s.plan.source_item_key === ap.source_item_key).plan;
  assert.notEqual(recreated.id,ap.id);
  const newImpact = must(await planImpact(recreated.id));
  must(await beginPlan(recreated.id,newImpact.snapshot));
  must(await planRpc("unit","finish_plan_delete",{p_plan:recreated.id}));
  assert.equal((await db.query("select from action_plans_private.deleted_active_sources where inspection_id=$1",[other])).rowCount,1);
  const currentAudit = must(await api("unit").rpc("inspection_delete_impact",auditArgs));
  must(await api("unit").rpc("begin_inspection_delete",{...auditArgs,p_snapshot:currentAudit.snapshot,p_confirmation:"excluir auditoria"}));
  must(await bucket("unit").remove([saved.object_key]));
  must(await api("unit").rpc("finish_inspection_delete",auditArgs));
  assert.equal((await db.query("select from action_plans_private.deleted_active_sources where inspection_id=$1",[other])).rowCount,0);
  assert.equal((await db.query("select from core.system_audit_log where entity_id=$1 and action in ('plan_delete_start','plan_delete_complete')",[ap.id])).rowCount,2);
  console.log("PASS AP-01 JWT, escopo, instantâneo, revogação, retomada, concorrência e ciclo AP/NAT");
} catch (error) {
  console.error("Falha AUD-DELETE-01 na fase " + phase + " (" + String(error.code || "verificação") + ")");
  process.exitCode=1;
} finally { await db.end(); }
