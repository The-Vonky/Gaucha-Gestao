import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

// Real, disposable local Supabase only: Auth JWT, PostgREST, Storage API and RLS together.
// Never prints sessions, keys or signed URLs.
const config = JSON.parse(execFileSync("npx", ["--yes", "supabase@2.117.0", "status", "-o", "json"], {
  encoding: "utf8", shell: process.platform === "win32", stdio: ["ignore", "pipe", "ignore"],
}));
for (const url of [config.API_URL, config.DB_URL])
  assert.equal(new URL(url).hostname, "127.0.0.1", "Only the disposable local stack is allowed");
const BUCKET = "unit-covers";
// Minimal real JPEG (1×1). The Storage API does not inspect pixels; size/MIME are what it records.
const jpeg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
const blob = (data = jpeg, type = "image/jpeg") => new Blob([data], { type });
const db = new pg.Client({ connectionString: config.DB_URL });
const password = "Local-" + randomUUID() + "-aA1!";
const tag = randomUUID().slice(0, 8);
const A = randomUUID(), B = randomUUID();
const users = {}, clients = {};
let phase = "setup";
const core = (user) => clients[user].schema("core");
const bucket = (user) => clients[user].storage.from(BUCKET);
function must(result, label) {
  assert.equal(result.error?.code ?? result.error?.statusCode ?? (result.error ? "error" : null), null, label);
  return result.data;
}
function fails(result, code, label) {
  assert.ok(result.error, label);
  if (code) assert.equal(String(result.error.code ?? result.error.statusCode), code, label);
}
async function authUser(name) {
  const response = await fetch(config.API_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: { apikey: config.SERVICE_ROLE_KEY, Authorization: "Bearer " + config.SERVICE_ROLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `unit-cover-${name}-${randomUUID()}@example.test`, password, email_confirm: true }),
  });
  assert.equal(response.status, 200, "Local Auth user creation");
  const { id, email } = await response.json();
  users[name] = id;
  clients[name] = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await clients[name].auth.signInWithPassword({ email, password }), "Real Auth sign-in");
}
async function assign(name, roleKey, unit = A) {
  await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id) select $1,id,'unit',$2 from core.roles where key=$3",
    [users[name], unit, roleKey]);
}
const begin = async (user, unit = A, size = jpeg.length) => must(await core(user).rpc("begin_unit_cover_upload", {
  p_unit: unit, p_mime_type: "image/jpeg", p_byte_size: size, p_width: 1, p_height: 1,
}), "begin")[0];
const upload = (user, key, body = blob(), upsert = false) => bucket(user).upload(key, body, { upsert, contentType: body.type, cacheControl: "300" });
const confirm = (user, unit, asset, x = 50, y = 50) => core(user).rpc("confirm_unit_cover_upload", { p_unit: unit, p_asset: asset, p_position_x: x, p_position_y: y });
async function setCover(user, unit = A, x = 50, y = 50) {
  const b = await begin(user, unit);
  must(await upload(user, b.object_key), "Storage upload");
  must(await confirm(user, unit, b.asset_id, x, y), "confirm");
  return b;
}
const covers = async (user, units) => must(await core(user).rpc("unit_covers", { p_units: units }), "unit_covers");

try {
  await db.connect();
  await db.query("insert into core.units(id,code,name) values($1,$3,'Capa A'),($2,$4,'Capa B')", [A, B, `CV-A-${tag}`, `CV-B-${tag}`]);
  await db.query("insert into core.roles(key,name) values($1,$1),($2,$2)", [`cover-manager-${tag}`, `cover-audit-${tag}`]);
  await db.query("insert into core.role_permissions select id,'admin.unit.manage' from core.roles where key=$1", [`cover-manager-${tag}`]);
  await db.query("insert into core.role_permissions select id,'audit.inspection.read' from core.roles where key=$1", [`cover-audit-${tag}`]);
  for (const name of ["manager", "other", "viewer", "auditOnly", "managerB"]) await authUser(name);
  await assign("manager", `cover-manager-${tag}`);
  await assign("other", `cover-manager-${tag}`);
  await assign("viewer", "quality_viewer");
  await assign("auditOnly", `cover-audit-${tag}`);
  await assign("managerB", `cover-manager-${tag}`, B);

  phase = "upload contract";
  const pending = await begin("manager");
  assert.match(pending.object_key, new RegExp(`^units/${A}/covers/${pending.asset_id}\\.jpg$`));
  fails(await upload("other", pending.object_key), null, "Another manager cannot upload into my pending key");
  fails(await upload("manager", `units/${A}/covers/${randomUUID()}.jpg`), null, "Unknown key is denied");
  fails(await upload("manager", pending.object_key, blob(jpeg, "image/png")), null, "Bucket accepts only image/jpeg");
  fails(await upload("manager", pending.object_key, blob(Buffer.alloc(1048577, 1))), null, "Bucket hard size limit");
  must(await upload("manager", pending.object_key), "Canonical upload");
  fails(await upload("manager", pending.object_key, blob(), true), null, "No overwrite/upsert");
  fails(await confirm("other", A, pending.asset_id), "42501", "Only the uploader confirms");
  fails(await confirm("managerB", B, pending.asset_id), "42501", "Wrong unit");
  fails(await bucket("manager").createSignedUrl(pending.object_key, 300), null, "Pending objects cannot be signed");
  must(await confirm("manager", A, pending.asset_id, 30, 70), "confirm");
  must(await confirm("manager", A, pending.asset_id, 30, 70), "confirm retry");

  phase = "batch read and signing";
  const coverB = await setCover("managerB", B);
  const ids = [A, B, ...Array.from({ length: 98 }, () => randomUUID())];
  const forViewer = await covers("viewer", ids);
  assert.deepEqual(forViewer.map((c) => [c.unit_id, Number(c.position_x), Number(c.position_y)]), [[A, 30, 70]]);
  assert.deepEqual(await covers("auditOnly", ids), [], "Audit read alone does not grant cover read");
  assert.deepEqual((await covers("managerB", ids)).map((c) => c.unit_id), [B]);
  fails(await core("viewer").rpc("unit_covers", { p_units: [...ids, randomUUID()] }), "22023", "More than 100 units");
  const signed = must(await bucket("viewer").createSignedUrls(forViewer.map((c) => c.object_key), 300), "Batch signing");
  assert.equal(signed.length, 1);
  assert.equal(signed[0].error, null);
  const url = new URL(signed[0].signedUrl);
  assert.equal(url.origin, new URL(config.API_URL).origin, "Signed URL stays on the API origin");
  const token = JSON.parse(Buffer.from(url.searchParams.get("token").split(".")[1], "base64url"));
  assert.equal(token.exp - token.iat, 300, "Signed URL TTL");
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), jpeg, "Exact canonical bytes");
  const nosniff = response.headers.get("x-content-type-options");
  console.log(`INFO local Storage X-Content-Type-Options: ${nosniff ?? "absent"} (production serving must send nosniff)`);
  const denied = must(await bucket("auditOnly").createSignedUrls([forViewer[0].object_key, coverB.object_key], 300), "Batch signing (denied)");
  assert.ok(denied.every((s) => s.error && !s.signedUrl), "Unauthorized keys are not signed");
  const foreign = must(await bucket("viewer").createSignedUrls([coverB.object_key], 300), "Foreign unit signing");
  assert.ok(foreign.every((s) => s.error && !s.signedUrl), "Viewer of A cannot sign B");

  phase = "replace, position and remove";
  const replacement = await setCover("other", A, 0, 100);
  fails(await bucket("viewer").createSignedUrl(pending.object_key, 300), null, "Retired cover is no longer signable");
  must(await core("manager").rpc("set_unit_cover_position", { p_unit: A, p_expected_asset: replacement.asset_id, p_position_x: 100, p_position_y: 0 }), "position");
  fails(await core("manager").rpc("set_unit_cover_position", { p_unit: A, p_expected_asset: pending.asset_id, p_position_x: 10, p_position_y: 10 }), "40001", "Stale position");
  assert.deepEqual((await covers("viewer", [A])).map((c) => [Number(c.position_x), Number(c.position_y)]), [[100, 0]]);
  fails(await core("viewer").rpc("remove_unit_cover", { p_unit: A, p_expected_asset: replacement.asset_id }), "42501", "Viewer cannot remove");
  must(await core("manager").rpc("remove_unit_cover", { p_unit: A, p_expected_asset: replacement.asset_id }), "remove");
  assert.deepEqual(await covers("viewer", [A]), []);
  fails(await bucket("viewer").createSignedUrl(replacement.object_key, 300), null, "Removed cover is not signable");
  const cancelled = await begin("manager");
  must(await core("manager").rpc("cancel_unit_cover_upload", { p_asset: cancelled.asset_id }), "cancel");
  fails(await upload("manager", cancelled.object_key), null, "Cancelled key cannot receive bytes");
  fails(await clients.manager.schema("core").from("unit_cover_assets").select("id"), "42501", "No table access");
  const report = (await db.query("select issue from private.unit_cover_reconciliation() where unit_id=$1 order by issue", [A])).rows.map((r) => r.issue);
  assert.deepEqual(report, ["retired_object_retained", "retired_object_retained"], "Retired objects are retained, not purged");
  console.log("PASS Unit cover real local integration suite");
} catch (error) {
  const code = /^[A-Z0-9_]{1,32}$/.test(String(error.code ?? "")) ? error.code : "CHECK_FAILED";
  console.error("FAIL Unit cover integration: " + phase + "; code=" + code + "; " + String(error.message ?? "").slice(0, 160));
  process.exitCode = 1;
} finally {
  await db.end();
}
