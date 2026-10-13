import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

// Core governance + audit read contracts with real local Auth JWT and PostgREST.
// Operates exclusively on a disposable Supabase CLI stack; never prints credentials.
const config = JSON.parse(execFileSync("npx", ["--yes", "supabase@2.117.0", "status", "-o", "json"], {
  encoding: "utf8", shell: process.platform === "win32", stdio: ["ignore", "pipe", "ignore"],
}));
for (const url of [config.API_URL, config.DB_URL]) {
  assert.equal(new URL(url).hostname, "127.0.0.1", "Only the disposable local stack is allowed");
}
const db = new pg.Client({ connectionString: config.DB_URL });
const tag = randomUUID().slice(0, 8);
const password = "Local-" + randomUUID() + "-aA1!";
const A = randomUUID(), B = randomUUID(), GUESS = randomUUID();
const ids = {}, emails = {}, clients = {}, roleIds = {};
let phase = "setup";

function must(result, label) {
  assert.equal(result.error?.code ?? (result.error ? "error" : null), null, label);
  return result.data;
}
function deny(result, code, label) {
  assert.ok(result.error, label);
  assert.equal(String(result.error.code), code, label);
  assert.equal(result.data, null, label);
}
async function authUser(name) {
  const email = "governance-" + name + "-" + tag + "@example.test";
  const res = await fetch(config.API_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: {
      apikey: config.SERVICE_ROLE_KEY,
      Authorization: "Bearer " + config.SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email, password, email_confirm: true, user_metadata: { display_name: "Governance " + name + " " + tag },
    }),
  });
  assert.equal(res.status, 200, "local Auth user creation " + name);
  ids[name] = (await res.json()).id;
  emails[name] = email;
  clients[name] = createClient(config.API_URL, config.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  must(await clients[name].auth.signInWithPassword({ email, password }), "real sign-in " + name);
}
const rpc = (name, fn, args = {}) => clients[name].schema("core").rpc(fn, args);
async function role(key, permissions) {
  const k = "jwt-security-" + key + "-" + tag;
  const result = await db.query("insert into core.roles(key,name) values($1,$1) returning id", [k]);
  roleIds[key] = result.rows[0].id;
  for (const permission of permissions) {
    await db.query("insert into core.role_permissions(role_id,permission_key) values($1,$2)", [
      roleIds[key], permission,
    ]);
  }
}
async function grant(name, key, scope = "global", unit = null) {
  await db.query(
    "insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id) values($1,$2,$3,$4)",
    [ids[name], roleIds[key], scope, unit],
  );
}

try {
  await db.connect();
  await db.query("insert into core.units(id,code,name) values($1,$3,$5),($2,$4,$6)", [
    A, B, "JWT-A-" + tag, "JWT-B-" + tag, "JWT Unit A", "JWT Unit B",
  ]);

  for (const name of ["target", "userOnly", "roleOnly", "unitOnly", "logOnly", "full", "inactive", "none"]) {
    await authUser(name);
  }
  await role("user", ["admin.user.read"]);
  await role("role", ["admin.role.read"]);
  await role("unit", ["admin.unit.read"]);
  await role("log", ["admin.audit_log.read"]);
  await role("quality", ["audit.inspection.read"]);
  await grant("target", "quality", "unit", A);
  await grant("userOnly", "user");
  await grant("roleOnly", "role");
  await grant("unitOnly", "unit", "unit", A);
  await grant("logOnly", "log", "unit", A);
  await grant("full", "user");
  await grant("full", "role");
  await grant("full", "unit", "unit", A);
  await grant("inactive", "user");
  await db.query("update core.profiles set active=false where id=$1", [ids.inactive]);

  phase = "anonymous, inactive and unassigned callers";
  const anon = createClient(config.API_URL, config.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  deny(await anon.schema("core").rpc("user_access_summary", { p_user: ids.target }), "42501", "anon summary");
  deny(await anon.schema("core").rpc("audit_log_page"), "42501", "anon logs");
  for (const name of ["inactive", "none"]) {
    assert.deepEqual(must(await rpc(name, "user_access_summary", { p_user: ids.target }), name + " summary"), []);
    assert.deepEqual(must(await rpc(name, "unit_access_summary", { p_unit: A }), name + " unit"), []);
    assert.deepEqual(must(await rpc(name, "role_impact_summary", { p_role: roleIds.quality }), name + " role"), []);
  }
  deny(await rpc("inactive", "audit_log_page"), "42501", "inactive logs");
  deny(await rpc("none", "audit_log_page"), "42501", "unassigned logs");

  phase = "global user-only view: names, not hidden role composition";
  const userSummary = must(await rpc("userOnly", "user_access_summary", { p_user: ids.target }), "user summary");
  assert.equal(userSummary.length, 1);
  assert.equal(userSummary[0].composition_coverage, "restricted");
  assert.equal(userSummary[0].effective_assignment_count, null);
  const userRows = must(await rpc("userOnly", "user_access_assignments", { p_user: ids.target }), "user assignments");
  assert.equal(userRows.length, 1);
  assert.equal(userRows[0].composition_visibility, "restricted");
  assert.equal(userRows[0].active_permission_keys, null);
  assert.equal(userRows[0].unit_label_source, "restricted");
  assert.equal(userRows[0].unit_code, null);
  assert.deepEqual(must(await rpc("userOnly", "unit_access_summary", { p_unit: A }), "user-only unit"), []);
  const directory = must(await rpc("userOnly", "user_directory", { p_search: emails.target }), "authorized directory");
  assert.equal(directory.length, 1);
  assert.equal(directory[0].email, emails.target);

  phase = "role-only view: role composition without named people or counts";
  assert.deepEqual(must(await rpc("roleOnly", "user_access_summary", { p_user: ids.target }), "role-only user"), []);
  const impactRole = must(await rpc("roleOnly", "role_impact_summary", { p_role: roleIds.quality }), "role-only impact");
  assert.equal(impactRole.length, 1);
  assert.equal(impactRole[0].impact_kind, "potential");
  assert.equal(impactRole[0].composition_visibility, "available");
  assert.equal(impactRole[0].holders_visibility, "restricted");
  assert.equal(impactRole[0].holder_count, null);
  assert.equal(impactRole[0].active_permission_count, 1);
  assert.deepEqual(must(await rpc("roleOnly", "role_holders", { p_role: roleIds.quality }), "role-only holders"), []);
  assert.deepEqual(must(await rpc("roleOnly", "user_directory", { p_search: emails.target }), "role-only directory"), []);

  phase = "unit-only view: readable unit without any person counts";
  const unit = must(await rpc("unitOnly", "unit_access_summary", { p_unit: A }), "unit-only A");
  assert.equal(unit.length, 1);
  assert.equal(unit[0].people_visibility, "restricted");
  assert.equal(unit[0].people_count, null);
  assert.equal(unit[0].effective_people_count, null);
  assert.deepEqual(must(await rpc("unitOnly", "unit_access_summary", { p_unit: B }), "unit-only B"), []);
  assert.deepEqual(must(await rpc("unitOnly", "unit_access_summary", { p_unit: GUESS }), "unknown unit"), []);
  assert.deepEqual(must(await rpc("unitOnly", "unit_access_assignments", { p_unit: A }), "unit-only people"), []);
  assert.deepEqual(must(await rpc("unitOnly", "user_directory", { p_search: emails.target }), "unit-only directory"), []);

  phase = "combined U+R+T reviewer and bounded/guessed queries";
  const full = must(await rpc("full", "user_access_summary", { p_user: ids.target }), "full summary");
  assert.equal(full.length, 1);
  assert.equal(full[0].composition_coverage, "complete");
  assert.equal(Number(full[0].effective_assignment_count), 1);
  const assignments = must(await rpc("full", "unit_access_assignments", { p_unit: A }), "full unit assignments");
  assert.ok(assignments.some((x) => x.user_id === ids.target && x.composition_visibility === "available"));
  const impact = must(await rpc("full", "role_impact_summary", { p_role: roleIds.quality }), "full role impact");
  assert.equal(impact[0].holders_visibility, "available");
  assert.equal(Number(impact[0].holder_count), 1);
  assert.deepEqual(must(await rpc("full", "user_access_summary", { p_user: GUESS }), "unknown user"), []);
  assert.deepEqual(must(await rpc("full", "unit_access_summary", { p_unit: GUESS }), "unknown unit full"), []);
  deny(await rpc("full", "unit_access_assignments", { p_unit: A, p_limit: 101 }), "22023", "page upper bound");

  phase = "scoped log events and private helper visibility";
  const logRows = must(await rpc("logOnly", "audit_log_page", { p_limit: 100 }), "scoped logs");
  assert.ok(logRows.some((row) => row.unit_id === A), "unit A has audit events");
  assert.ok(logRows.every((row) => row.unit_id === A), "unit B/unscoped events are hidden");
  assert.ok(logRows.every((row) => row.actor_display_name === null), "no global user audience; actor names hidden");
  deny(await rpc("userOnly", "audit_log_page"), "42501", "user-only logs");
  const privateProbe = await clients.full.schema("private").rpc("has_user_audience");
  assert.ok(privateProbe.error && privateProbe.data === null, "private schema is not exposed");

  phase = "revocation immediately changes the effective read model";
  await db.query("update core.user_role_assignments set active=false where user_id=$1 and role_id=$2", [
    ids.target, roleIds.quality,
  ]);
  const post = must(await rpc("full", "user_access_summary", { p_user: ids.target }), "revoked user");
  assert.equal(Number(post[0].active_assignment_count), 0);
  assert.equal(Number(post[0].revoked_assignment_count), 1);
  const after = must(await rpc("full", "unit_access_assignments", { p_unit: A }), "post revoke");
  assert.ok(!after.some((x) => x.user_id === ids.target));
  console.log("PASS Core governance + logs real JWT/PostgREST: anon, inactive, audience separation, scoped logs, guessed IDs, revocation");
} catch (error) {
  console.error("Core JWT security matrix failed during: " + phase);
  throw error;
} finally {
  await db.end();
}
