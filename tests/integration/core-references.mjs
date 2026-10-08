import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

// Core Reference Resolvers v1 through real Auth JWTs and PostgREST on the disposable local stack.
// Adds uniquely tagged rows only. Never prints sessions or keys.
const config = JSON.parse(execFileSync("npx", ["--yes", "supabase@2.117.0", "status", "-o", "json"], {
  encoding: "utf8", shell: process.platform === "win32", stdio: ["ignore", "pipe", "ignore"],
}));
for (const url of [config.API_URL, config.DB_URL])
  assert.equal(new URL(url).hostname, "127.0.0.1", "Only the disposable local stack is allowed");
const db = new pg.Client({ connectionString: config.DB_URL });
const password = "Local-" + randomUUID() + "-aA1!";
const tag = randomUUID().slice(0, 8);
const A = randomUUID(), B = randomUUID(), S = randomUUID(), T = randomUUID();
const users = {}, emails = {}, clients = {};
let phase = "setup";
const core = (client) => client.schema("core");
function must(result, label) {
  assert.equal(result.error?.code ?? (result.error ? "error" : null), null, label);
  return result.data;
}
function fails(result, code, label) {
  assert.ok(result.error, label);
  assert.equal(String(result.error.code), code, label);
  assert.equal(result.data, null, label);
}
async function authUser(name) {
  emails[name] = `refs-${name}-${randomUUID()}@example.test`;
  const response = await fetch(config.API_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: { apikey: config.SERVICE_ROLE_KEY, Authorization: "Bearer " + config.SERVICE_ROLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: emails[name], password, email_confirm: true, user_metadata: { display_name: `Refs ${name} ${tag}` } }),
  });
  assert.equal(response.status, 200, "Local Auth user creation");
  users[name] = (await response.json()).id;
  clients[name] = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await clients[name].auth.signInWithPassword({ email: emails[name], password }), "Real Auth sign-in");
}
const rpc = (name, fn, args) => core(clients[name]).rpc(fn, args);

try {
  await db.connect();
  await db.query("insert into core.units(id,code,name) values($1,$3,'Refs A'),($2,$4,'Refs B')", [A, B, `RF-A-${tag}`, `RF-B-${tag}`]);
  await db.query("insert into core.sectors(id,code,name) values($1,$3,'Refs S'),($2,$4,'Refs T')", [S, T, `RF-S-${tag}`, `RF-T-${tag}`]);
  await db.query("insert into core.unit_sectors values($1,$3),($2,$3),($1,$4)", [A, B, S, T]);
  await db.query("insert into core.roles(key,name) values($1,$1)", [`refs-user-reader-${tag}`]);
  await db.query("insert into core.role_permissions select id,'admin.user.read' from core.roles where key=$1", [`refs-user-reader-${tag}`]);
  for (const name of ["member", "reader", "former", "leaver", "planner", "revoked"]) await authUser(name);
  await db.query("insert into core.roles(key,name) values($1,$1)", [`refs-planner-${tag}`]);
  await db.query("insert into core.role_permissions select id,'action_plan.read' from core.roles where key=$1", [`refs-planner-${tag}`]);
  await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id) select $1,id,'unit',$2 from core.roles where key=$3",
    [users.planner, A, `refs-planner-${tag}`]);
  await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type) select $1,id,'global' from core.roles where key='quality'",
    [users.revoked]);
  await db.query("update core.user_role_assignments set active=false where user_id=$1", [users.revoked]);
  await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select $1,id,'sector',$2,$3 from core.roles where key='quality_viewer'",
    [users.member, A, S]);
  await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select $1,id,'sector',$2,$3 from core.roles where key='quality_viewer'",
    [users.leaver, A, S]);
  await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type) select $1,id,'global' from core.roles where key=$2",
    [users.reader, `refs-user-reader-${tag}`]);
  await db.query("update core.profiles set active=false where id=$1", [users.former]);
  await db.query("update core.units set active=false where id=$1", [B]);

  phase = "anonymous";
  const anon = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const fn of ["profile_references", "unit_references", "sector_references"])
    fails(await core(anon).rpc(fn, { p_ids: [A, users.member] }), "42501", `anon ${fn}`);
  fails(await core(anon).rpc("unit_sector_references", { p_units: [A], p_sectors: [S] }), "42501", "anon pairs");

  phase = "authorized known references";
  const self = must(await rpc("member", "profile_references", { p_ids: [users.reader, users.member, users.former] }), "self");
  assert.deepEqual(self, [{ id: users.member, display_name: `Refs member ${tag}`, active: true }]);
  assert.deepEqual(must(await rpc("member", "unit_references", { p_ids: [B, A] }), "units"),
    [{ id: A, code: `RF-A-${tag}`, name: "Refs A", active: true }]);
  assert.deepEqual(must(await rpc("member", "sector_references", { p_ids: [T, S] }), "sectors").map((s) => s.id), [S]);
  assert.deepEqual(must(await rpc("member", "unit_sector_references", { p_units: [A, B, A], p_sectors: [S, S, T] }), "pairs"),
    [{ unit_id: A, sector_id: S, unit_active: true, sector_active: true }]);

  phase = "label is not module access";
  assert.deepEqual(must(await rpc("planner", "unit_references", { p_ids: [A, B] }), "planner units").map((u) => u.id), [A]);
  assert.deepEqual(must(await core(clients.planner).from("units").select("id").eq("id", A), "planner catalog"), []);
  assert.deepEqual(must(await clients.planner.schema("audit").rpc("units"), "planner audit units"), []);

  phase = "revoked grants and private helpers";
  assert.deepEqual(must(await rpc("revoked", "unit_references", { p_ids: [A, B] }), "revoked units"), []);
  assert.deepEqual(must(await rpc("revoked", "sector_references", { p_ids: [S, T] }), "revoked sectors"), []);
  const probe = await clients.member.schema("private").rpc("reference_batch", { p_ids: [A] });
  assert.ok(probe.error && probe.data === null, "private schema is not exposed through PostgREST");

  phase = "guessed IDs";
  const guessed = must(await rpc("member", "unit_references", { p_ids: [randomUUID()] }), "guessed unit");
  assert.deepEqual(guessed, must(await rpc("member", "unit_references", { p_ids: [B] }), "invisible unit"));
  assert.deepEqual(guessed, []);
  assert.deepEqual(must(await rpc("member", "profile_references", { p_ids: [randomUUID(), users.reader] }), "guessed users"), []);

  phase = "historical inactive references";
  const readerView = must(await rpc("reader", "profile_references", { p_ids: [users.former, users.member] }), "reader");
  assert.deepEqual(readerView.map((p) => [p.id, p.active]).sort(), [[users.former, false], [users.member, true]].sort());
  assert.deepEqual(must(await rpc("reader", "unit_references", { p_ids: [B] }), "inactive unit"),
    [{ id: B, code: `RF-B-${tag}`, name: "Refs B", active: false }]);

  phase = "no e-mail or Auth leakage";
  const body = JSON.stringify(readerView);
  for (const email of Object.values(emails)) assert.ok(!body.includes(email), "No e-mail in the projection");
  for (const row of readerView) assert.deepEqual(Object.keys(row).sort(), ["active", "display_name", "id"]);

  phase = "batch limit";
  const hundred = [A, ...Array.from({ length: 99 }, () => randomUUID())];
  assert.equal(must(await rpc("member", "unit_references", { p_ids: hundred }), "100 ids").length, 1);
  fails(await rpc("member", "unit_references", { p_ids: [...hundred, randomUUID()] }), "22023", "101 ids");
  fails(await rpc("member", "profile_references", { p_ids: [...hundred, randomUUID()] }), "22023", "101 users");
  fails(await rpc("member", "unit_sector_references", { p_units: [A, B], p_sectors: [S] }), "22023", "unpaired");

  phase = "inactive caller with a live session";
  must(await rpc("leaver", "unit_references", { p_ids: [A] }), "before deactivation");
  await db.query("update core.profiles set active=false where id=$1", [users.leaver]);
  fails(await rpc("leaver", "profile_references", { p_ids: [users.leaver] }), "42501", "inactive caller");
  fails(await rpc("leaver", "unit_references", { p_ids: [A] }), "42501", "inactive caller units");
  console.log("core-references: anon/inactive denied, scoped resolution, guessed IDs, history, no Auth data, batch limit");
} catch (error) {
  console.error(`core-references failed during: ${phase}`);
  throw error;
} finally {
  await db.end();
}
