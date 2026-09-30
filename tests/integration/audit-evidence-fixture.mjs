import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

// Real, disposable Supabase only. No production credentials or mocked Storage metadata.
// Never print sessions, keys, signed URLs, or response objects.
const config = JSON.parse(execFileSync("npx", ["--yes", "supabase@2.117.0", "status", "-o", "json"], {
  encoding: "utf8", shell: process.platform === "win32", stdio: ["ignore", "pipe", "ignore"],
}));
for (const url of [config.API_URL, config.DB_URL])
  assert.equal(new URL(url).hostname, "127.0.0.1", "Only the disposable local stack is allowed");
const BUCKET = "audit-checklist-evidence";
const PDF = "application/pdf";
const bytes = Buffer.from("%PDF-1.4\n% Audit criterion evidence\n");
const blob = (data = bytes, type = PDF) => new Blob([data], { type });
const db = new pg.Client({ connectionString: config.DB_URL });
await db.connect();
const password = "Local-" + randomUUID() + "-aA1!";
const tag = randomUUID().slice(0, 8);
const A = randomUUID(), B = randomUUID(), S = randomUUID();
const users = {}, clients = {};
const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const api = (user) => clients[user].schema("audit");
const bucket = (user) => clients[user].storage.from(BUCKET);
function must(result, label = "API operation") {
  assert.equal(result.error?.code ?? result.error?.statusCode ?? (result.error ? "error" : null), null, label);
  return result.data;
}
function fails(result, code, label = "Denied operation") {
  assert.ok(result.error, label);
  if (code) assert.equal(result.error.code, code, label);
}
const rpc = (user, name, args) => api(user).rpc(name, args);
const beginArgs = (inspection, item = "item-001", name = "laudo.pdf", type = PDF, size = bytes.length) => ({
  p_inspection: inspection, p_item_key: item, p_original_name: name, p_content_type: type, p_size: size,
});
async function begin(user, inspection, item = "item-001", name = "laudo.pdf", type = PDF, size = bytes.length) {
  return must(await rpc(user, "begin_checklist_evidence_upload", beginArgs(inspection, item, name, type, size)), "begin")[0];
}
const upload = (user, key, body = blob()) => bucket(user).upload(key, body, { upsert: false, cacheControl: "0" });
const confirm = (user, id) => rpc(user, "confirm_checklist_evidence_upload", { p_evidence: id });
const remove = (user, id) => rpc(user, "remove_checklist_evidence", { p_evidence: id });
async function attach(user, inspection, item = "item-001", name = "laudo.pdf") {
  const pending = await begin(user, inspection, item, name);
  must(await upload(user, pending.object_key), "Storage upload");
  must(await confirm(user, pending.evidence_id), "confirmation");
  return pending;
}
const list = async (user, inspection, item = null) =>
  must(await rpc(user, "checklist_evidence", { p_inspection: inspection, p_item_key: item }), "list");
const row = async (id) => (await db.query("select * from audit.inspections where id=$1", [id])).rows[0];
const evidenceRow = async (id) => (await db.query("select * from audit.checklist_evidence where id=$1", [id])).rows[0];
async function inspection(unit = A) {
  return must(await rpc("global", "create_inspection", {
    p_unit: unit, p_applied_on: "2026-09-30", p_previous_visit_on: null,
  }), "create inspection");
}
const fill = (id) => db.query("update audit.inspection_answers set response='AT' where inspection_id=$1", [id]);
const finalize = async (user, id, expected) => rpc(user, "finalize_inspection", {
  p_id: id, p_version: (await row(id)).version,
  p_expected_evidence_ids: expected.map((e) => typeof e === "string" ? e : e.evidence_id),
});
const reopen = async (id, user = "global") => rpc(user, "reopen_inspection", {
  p_id: id, p_version: (await row(id)).version,
});
async function authUser(name) {
  const email = "audit-evidence-" + name + "-" + randomUUID() + "@example.test";
  const response = await fetch(config.API_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: { apikey: config.SERVICE_ROLE_KEY, Authorization: "Bearer " + config.SERVICE_ROLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  assert.equal(response.status, 200, "Local Auth user creation");
  users[name] = (await response.json()).id;
  users[name + "Email"] = email;
  clients[name] = createClient(config.API_URL, config.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  must(await clients[name].auth.signInWithPassword({ email, password }), "Real Auth sign-in");
}
async function newRole(name, permissions) {
  const key = "audit-evidence-" + tag + "-" + name;
  const id = (await db.query("insert into core.roles(key,name) values($1,$1) returning id", [key])).rows[0].id;
  for (const permission of permissions)
    await db.query("insert into core.role_permissions values($1,$2)", [id, "audit.inspection." + permission]);
  return id;
}
async function assign(name, role, scope = "unit", unit = A, sector = null) {
  await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) values($1,$2,$3,$4,$5)",
    [users[name], role, scope, scope === "global" ? null : unit, sector]);
}
async function expire(id, age = "2 hours") {
  // Operator fixture setup on Audit metadata only; binary/Storage mutations always use its API.
  await db.query("begin");
  try {
    await db.query("alter table audit.checklist_evidence disable trigger guard_checklist_evidence");
    await db.query("update audit.checklist_evidence set created_at=clock_timestamp()-$2::interval where id=$1", [id, age]);
    await db.query("alter table audit.checklist_evidence enable trigger guard_checklist_evidence");
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}
const report = async (id) => (await db.query(
  "select * from audit_private.checklist_evidence_reconciliation() where object_key like $1", [id + "/%"],
)).rows;
const countEvents = async (id, action) => (await db.query(
  "select count(*)::int n from core.system_audit_log where module='audit' and entity_type='checklist_evidence' and entity_id=$1 and action=$2",
  [id, action],
)).rows[0].n;
async function download(user, key, name, expected = bytes) {
  const signed = must(await bucket(user).createSignedUrl(key, 60), "Sign available evidence").signedUrl;
  const url = new URL(signed);
  url.searchParams.set("download", name);
  assert.ok(url.origin === new URL(config.API_URL).origin, "Downloads remain on the API origin");
  const token = JSON.parse(Buffer.from(url.searchParams.get("token").split(".")[1], "base64url"));
  assert.equal(token.exp - token.iat, 60, "Signed download TTL");
  const response = await fetch(url);
  assert.equal(response.status, 200, "Signed download response");
  assert.equal(response.headers.get("content-type"), PDF);
  const disposition = response.headers.get("content-disposition") ?? "";
  assert.match(disposition, /^attachment;/, "Downloads are attachments");
  const utf8 = /filename\*=UTF-8''(.+)$/.exec(disposition);
  if (utf8) assert.equal(decodeURIComponent(utf8[1]), name);
  else assert.ok(disposition.includes(name), "Original download filename");
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(expected), "Downloaded original bytes");
  return response.headers;
}
async function waitForLock(name) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const waiting = await db.query(
      "select 1 from pg_stat_activity where application_name=$1 and wait_event_type='Lock'", [name],
    );
    if (waiting.rowCount) return;
    await new Promise((done) => setTimeout(done, 40));
  }
  throw Error("Expected a real PostgreSQL lock wait");
}
async function session(name, user) {
  const client = new pg.Client({ connectionString: config.DB_URL, application_name: name });
  await client.connect();
  await client.query("set statement_timeout='15s'");
  await client.query("set role authenticated");
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [users[user]]);
  return client;
}
const outcome = (promise) => promise.then(() => ({ allowed: true }), (error) => ({ allowed: false, code: error.code }));
async function race(firstUser, first, secondUser, second) {
  const one = await session("audit-evidence-first", firstUser);
  const two = await session("audit-evidence-second", secondUser);
  try {
    await one.query("begin");
    const held = await outcome(one.query(...first));
    assert.equal(held.allowed, true, "First transaction succeeds before holding its lock");
    const pending = outcome(two.query(...second));
    await waitForLock("audit-evidence-second");
    await one.query("commit");
    return [held, await pending];
  } finally {
    await one.query("rollback").catch(() => {});
    await one.end();
    await two.end();
  }
}
const beginSql = (id, item = "item-001") => [
  "select * from audit.begin_checklist_evidence_upload($1,$2,'race.pdf',$3,$4)", [id, item, PDF, bytes.length],
];
const confirmSql = (id) => ["select audit.confirm_checklist_evidence_upload($1)", [id]];
const removeSql = (id) => ["select audit.remove_checklist_evidence($1)", [id]];
const finalizeSql = async (id, ids) => [
  "select audit.finalize_inspection($1,$2,$3::uuid[])", [id, (await row(id)).version, ids.map((e) => e.evidence_id)],
];

const state = { phase: "fixture setup" };
async function setup() {
  await db.query("insert into core.units(id,code,name) values($1,$3,'Audit evidence A'),($2,$4,'Audit evidence B')",
    [A, B, "AE-A-" + tag, "AE-B-" + tag]);
  await db.query("insert into core.sectors(id,code,name) values($1,$2,'Audit evidence sector')", [S, "AE-S-" + tag]);
  await db.query("insert into core.unit_sectors values($1,$2)", [A, S]);
  const all = await newRole("all", ["read", "create", "edit", "finalize", "reopen"]);
  const read = await newRole("read", ["read"]);
  const edit = await newRole("edit", ["edit"]);
  for (const name of ["global", "unit", "other", "sector", "inactive", "empty", "reader", "editOnly", "owner", "revoked", "ui"])
    await authUser(name);
  for (const [name, role, scope, unit, sector] of [
    ["global", all, "global", null, null], ["unit", all, "unit", A, null],
    ["other", all, "unit", B, null], ["sector", all, "sector", A, S],
    ["inactive", all, "global", null, null], ["reader", read, "unit", A, null],
    ["editOnly", edit, "unit", A, null], ["owner", all, "unit", A, null],
    ["revoked", all, "unit", A, null], ["ui", all, "unit", A, null],
  ]) await assign(name, role, scope, unit, sector);
  await db.query("update core.profiles set active=false where id=$1", [users.inactive]);
  clients.anon = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false } });

}
export { assert, randomUUID, pg, config, BUCKET, PDF, bytes, blob, db, password, tag, A, B, S, users, clients, service, api, bucket, must, fails, rpc, beginArgs, begin, upload, confirm, remove, attach, list, row, evidenceRow, inspection, fill, finalize, reopen, expire, report, countEvents, download, waitForLock, session, outcome, race, beginSql, confirmSql, removeSql, finalizeSql, state, setup };
