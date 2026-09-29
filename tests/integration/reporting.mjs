import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";

// Disposable local Supabase only. Never use --linked, remote URLs or production.
const config = JSON.parse(execFileSync("npx", ["--yes", "supabase@2.117.0", "status", "-o", "json"], { encoding: "utf8" }));
for (const url of [config.API_URL, config.DB_URL]) assert.equal(new URL(url).hostname, "127.0.0.1");
const db = new pg.Client({ connectionString: config.DB_URL });
await db.connect();
const password = `Local-${randomUUID()}-aA1!`;
const users = {}, tokens = {};
const A = randomUUID(), B = randomUUID(), sector = randomUUID(), tag = randomUUID().slice(0, 8);
async function request(path, token, body, schema = "audit") {
  const response = await fetch(`${config.API_URL}${path}`, { method: "POST", headers: {
    apikey: config.ANON_KEY, Authorization: `Bearer ${token ?? config.ANON_KEY}`,
    "Content-Type": "application/json", "Accept-Profile": schema, "Content-Profile": schema,
  }, body: JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}
const rpc = (name, user, args = {}) => request(`/rest/v1/rpc/${name}`, tokens[user], args);
const allowed = (r) => { assert.ok(r.status >= 200 && r.status < 300, JSON.stringify(r)); return r.data; };
const denied = (r) => assert.ok([401, 403].includes(r.status), JSON.stringify(r));
async function createUser(name) {
  const email = `${tag}-${name}-${randomUUID()}@example.test`;
  const response = await fetch(`${config.API_URL}/auth/v1/admin/users`, { method: "POST", headers: {
    apikey: config.SERVICE_ROLE_KEY, Authorization: `Bearer ${config.SERVICE_ROLE_KEY}`, "Content-Type": "application/json",
  }, body: JSON.stringify({ email, password, email_confirm: true }) });
  assert.equal(response.status, 200);
  users[name] = (await response.json()).id;
  const login = await request("/auth/v1/token?grant_type=password", null, { email, password });
  tokens[name] = login.data.access_token;
  assert.ok(tokens[name]);
}
async function grant(name, permissions, scope, unit = null) {
  const role = (await db.query("insert into core.roles(key,name) values($1,$1) returning id", [`report-${tag}-${name}-${randomUUID().slice(0, 6)}`])).rows[0].id;
  for (const permission of permissions) await db.query("insert into core.role_permissions(role_id,permission_key) values($1,$2)", [role, permission]);
  await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) values($1,$2,$3,$4,$5)",
    [users[name], role, scope, unit, scope === "sector" ? sector : null]);
}
try {
  await db.query("insert into core.units(id,code,name) values($1,$3,'Report A'),($2,$4,'Report B')", [A, B, `R-A-${tag}`, `R-B-${tag}`]);
  await db.query("insert into core.sectors(id,code,name) values($1,$2,'Sector')", [sector, `R-S-${tag}`]);
  await db.query("insert into core.unit_sectors values($1,$2)", [A, sector]);
  for (const name of ["writer", "reader", "exporter", "both", "globalRead", "globalExport", "sector", "inactive", "empty"]) await createUser(name);
  await grant("writer", ["audit.inspection.read", "audit.inspection.create", "audit.inspection.edit", "audit.inspection.finalize", "audit.inspection.reopen", "audit.inspection.export"], "unit", A);
  await grant("reader", ["audit.inspection.read"], "unit", A);
  await grant("exporter", ["audit.inspection.export"], "unit", A);
  await grant("both", ["audit.inspection.read", "audit.inspection.export"], "unit", A);
  await grant("globalRead", ["audit.inspection.read"], "global");
  await grant("globalExport", ["audit.inspection.export"], "global");
  await grant("sector", ["audit.inspection.read", "audit.inspection.export"], "sector", A);
  await grant("inactive", ["audit.inspection.read", "audit.inspection.export"], "unit", A);
  await db.query("update core.profiles set active=false where id=$1", [users.inactive]);
  await grant("globalRead", ["audit.inspection.export"], "unit", A); // Global read ∩ unit export.
  await grant("globalExport", ["audit.inspection.read"], "unit", A); // Unit read ∩ global export.
  const inspection = allowed(await rpc("create_inspection", "writer", { p_unit: A, p_applied_on: "2026-09-01", p_previous_visit_on: null }));
  const foreign = (await db.query("insert into audit.inspections(unit_id,template_version,applied_on,responsible_id) values($1,'checklist-geral-2026-09-22-v1','2026-09-02',$2) returning id", [B, users.writer])).rows[0].id;
  for (const name of ["reader", "exporter", "sector", "inactive", "empty", null]) {
    denied(await rpc("inspection_export", name, { p_inspection: inspection }));
    denied(await rpc("unit_history_export", name, { p_unit: A }));
  }
  for (const name of ["both", "globalRead", "globalExport"]) {
    const report = allowed(await rpc("inspection_export", name, { p_inspection: inspection }));
    assert.equal(report.sections.length, 9);
    assert.equal(report.sections.flatMap((section) => section.items).length, 158);
    assert.equal(report.inspection.score, null);
    assert.equal(allowed(await rpc("unit_history_export", name, { p_unit: A, p_from: "2026-09-01", p_to: "2026-09-01" })).record_count, 1);
    denied(await rpc("inspection_export", name, { p_inspection: foreign }));
    denied(await rpc("unit_history_export", name, { p_unit: B }));
  }
  denied(await rpc("inspection_export", "both", { p_inspection: randomUUID() }));
  denied(await rpc("unit_history_export", "both", { p_unit: randomUUID() }));
  assert.equal(allowed(await rpc("unit_history_export", "both", { p_unit: A, p_from: "2026-09-02" })).record_count, 0);

  // A repeatable-read transaction demonstrates the report's statement snapshot:
  // concurrent answer and lifecycle writes cannot mix into its coherent envelope.
  const snapshot = new pg.Client({ connectionString: config.DB_URL });
  await snapshot.connect();
  try {
    await snapshot.query("begin isolation level repeatable read");
    await snapshot.query("set local role authenticated");
    await snapshot.query("select set_config('request.jwt.claim.sub',$1,true)", [users.both]);
    await snapshot.query("select txid_current_snapshot()");
    await db.query("update audit.inspection_answers set response='AT', observation='=SUM(1,2)\nÁgua 😀' where inspection_id=$1", [inspection]);
    const old = (await snapshot.query("select audit.inspection_export($1) result", [inspection])).rows[0].result;
    assert.equal(old.inspection.status, "draft");
    assert.equal(old.inspection.counts.answered, 0);
    assert.equal(old.sections[0].items[0].observation, "");
    await snapshot.query("commit");
  } finally { await snapshot.end(); }
  const full = allowed(await rpc("inspection_export", "both", { p_inspection: inspection }));
  assert.equal(full.inspection.counts.at, 158);
  assert.equal(full.sections[0].items[0].observation, "=SUM(1,2)\nÁgua 😀");
  allowed(await rpc("finalize_inspection", "writer", { p_id: inspection, p_version: 1 }));
  assert.equal(allowed(await rpc("inspection_export", "both", { p_inspection: inspection })).inspection.status, "finalized");
  allowed(await rpc("reopen_inspection", "writer", { p_id: inspection, p_version: 2 }));
  const reopened = allowed(await rpc("inspection_export", "both", { p_inspection: inspection }));
  assert.equal(reopened.inspection.status, "draft");
  assert.equal(reopened.inspection.classification, null);
  await db.query("update core.user_role_assignments set active=false where user_id=$1", [users.both]);
  denied(await rpc("inspection_export", "both", { p_inspection: inspection }));
  denied(await rpc("unit_history_export", "both", { p_unit: A }));
  console.info("Reporting integration: real Auth/JWT/PostgREST, snapshot, lifecycle and revocation passed");
} finally { await db.end(); }
