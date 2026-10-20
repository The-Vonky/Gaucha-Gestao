import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

// Curva ABC v1 on a real, disposable local Supabase: Auth JWT, PostgREST, Storage API and
// RLS together, plus two concurrent publishers. Never prints sessions, keys or signed URLs.
const config = JSON.parse(execFileSync("npx", ["--yes", "supabase@2.117.0", "status", "-o", "json"], {
  encoding: "utf8", shell: process.platform === "win32", stdio: ["ignore", "pipe", "ignore"],
}));
for (const url of [config.API_URL, config.DB_URL])
  assert.equal(new URL(url).hostname, "127.0.0.1", "Only the disposable local stack is allowed");
const BUCKET = "abc-source-files";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const db = new pg.Client({ connectionString: config.DB_URL });
const password = "Local-" + randomUUID() + "-aA1!";
const tag = randomUUID().slice(0, 8);
const A = randomUUID(), B = randomUUID();
const codeA = `ABC-A-${tag}`, codeB = `ABC-B-${tag}`;
const users = {}, clients = {};
let phase = "setup";
const abc = (user) => clients[user].schema("abc");
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
    body: JSON.stringify({ email: `abc-${name}-${randomUUID()}@example.test`, password, email_confirm: true }),
  });
  assert.equal(response.status, 200, "Local Auth user creation");
  const { id, email } = await response.json();
  users[name] = id;
  clients[name] = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await clients[name].auth.signInWithPassword({ email, password }), "Real Auth sign-in");
}
const assign = (name, roleKey, unit) =>
  db.query("insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id) select $1,id,'unit',$2 from core.roles where key=$3",
    [users[name], unit, roleKey]);

// Mirrors abc_private.content_hash (and apps/web/src/modules/abc/import/contentHash.ts).
function contentHash(p) {
  const US = String.fromCharCode(31), RS = String.fromCharCode(30);
  const header = [p.unit_code, p.period_start, p.period_end, p.cost_basis, p.cost_basis_text, p.declared_total].join(US);
  const subtotals = [...p.subtotals].sort((a, b) => a.class.localeCompare(b.class)).map((s) => ["S", s.class, s.total].join(US));
  const lines = [...p.lines].sort((a, b) => a.line_no - b.line_no).map((l) => ["L", l.line_no, l.code, l.name, l.unit, l.quantity,
    l.unit_cost, l.total, l.source_share ?? "", l.erp_class ?? "", l.sheet, l.row].join(US));
  return createHash("sha256").update(["abc-content-v1", header, ...subtotals, ...lines].join(RS)).digest("hex");
}
function payload(unitCode, fileSha, month = "2026-07") {
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const line = (n, code, total, cls) => ({ line_no: n, code, name: `Produto ${code}`, unit: "KG", quantity: "1", unit_cost: total, total,
    source_share: null, erp_class: cls, sheet: "Curva ABC Geral (Realizado)", row: n + 6 });
  const draft = {
    unit_code: unitCode, period_start: `${month}-01`, period_end: `${month}-${last}`, cost_basis: "NET_PERIOD",
    cost_basis_text: "Custo Médio Líquido da Época", declared_total: "100",
    subtotals: [{ class: "A", total: "75" }, { class: "B", total: "15" }, { class: "C", total: "10" }],
    lines: [line(1, "1.01", "50", "A"), line(2, "1.02", "25", "A"), line(3, "1.03", "15", "B"), line(4, "1.04", "10", "C")],
  };
  return { ...draft, parser_version: "erp-curva-realizado-v1", file_sha256: fileSha, warnings: [], content_hash: contentHash(draft) };
}
async function storeFile(user, unit, bytes = Buffer.from("PK synthetic " + randomUUID())) {
  const sha = createHash("sha256").update(bytes).digest("hex");
  const [row] = must(await abc(user).rpc("begin_source_upload", { p_unit: unit, p_name: "curva.xlsx", p_sha256: sha, p_size: bytes.length }), "begin");
  must(await bucket(user).upload(row.object_key, new Blob([bytes], { type: XLSX }), { upsert: false, contentType: XLSX, cacheControl: "0" }), "upload");
  must(await abc(user).rpc("confirm_source_upload", { p_file: row.file_id }), "confirm");
  return { id: row.file_id, sha, key: row.object_key, bytes };
}
const publish = (user, file, p, version = 0, reason = null, accept = false) =>
  abc(user).rpc("publish_revision", { p_file: file.id, p_payload: p, p_expected_version: version, p_reason: reason, p_accept_warnings: accept });

try {
  await db.connect();
  await db.query("insert into core.units(id,code,name) values($1,$3,'ABC A'),($2,$4,'ABC B')", [A, B, codeA, codeB]);
  for (const name of ["publisher", "publisher2", "viewer", "otherUnit", "quality"]) await authUser(name);
  await assign("publisher", "costs", A);
  await assign("publisher2", "costs", A);
  await assign("viewer", "costs_viewer", A);
  await assign("otherUnit", "costs", B);
  await assign("quality", "quality", A);

  phase = "upload contract";
  const [pending] = must(await abc("publisher").rpc("begin_source_upload", { p_unit: A, p_name: "x.xlsx", p_sha256: "a".repeat(64), p_size: 10 }), "begin");
  assert.match(pending.object_key, new RegExp(`^units/${A}/abc/${pending.file_id}\\.xlsx$`));
  fails(await bucket("publisher2").upload(pending.object_key, new Blob([Buffer.alloc(10)], { type: XLSX }), { upsert: false, contentType: XLSX }), null, "Another publisher cannot use my pending key");
  fails(await bucket("publisher").upload(pending.object_key, new Blob([Buffer.alloc(10)], { type: "application/pdf" }), { upsert: false, contentType: "application/pdf" }), null, "Bucket accepts only XLSX");
  fails(await abc("viewer").rpc("begin_source_upload", { p_unit: A, p_name: "x.xlsx", p_sha256: "a".repeat(64), p_size: 10 }), "42501", "Viewer cannot upload");
  fails(await abc("otherUnit").rpc("begin_source_upload", { p_unit: A, p_name: "x.xlsx", p_sha256: "a".repeat(64), p_size: 10 }), "42501", "Other unit cannot upload");
  fails(await abc("publisher").rpc("confirm_source_upload", { p_file: pending.file_id }), "23514", "Confirm needs the stored object");

  phase = "publication";
  const f1 = await storeFile("publisher", A);
  const rev1 = must(await publish("publisher", f1, payload(codeA, f1.sha)), "publish");
  const detail = must(await abc("viewer").rpc("revision_detail", { p_revision: rev1 }), "viewer reads detail");
  assert.deepEqual(detail.lines.map((l) => l.calculated_class), ["A", "A", "B", "C"]);
  assert.equal(typeof detail.declared_total, "string", "Money as text");
  fails(await abc("otherUnit").rpc("revision_detail", { p_revision: rev1 }), "42501", "Other unit cannot read");
  fails(await abc("quality").rpc("unit_series", { p_unit: A }), "42501", "Another module's role cannot read");
  assert.equal(must(await abc("otherUnit").from("revision_lines").select("product_code").eq("revision_id", rev1), "RLS").length, 0);
  assert.equal(must(await abc("viewer").from("revision_lines").select("product_code").eq("revision_id", rev1), "RLS").length, 4);
  fails(await abc("publisher").from("report_revisions").update({ reason: "x" }).eq("id", rev1), "42501", "No direct writes");

  phase = "original download";
  const { data: downloaded, error } = await bucket("viewer").download(f1.key);
  assert.equal(error, null, "Viewer downloads the original");
  assert.equal(Buffer.from(await downloaded.arrayBuffer()).equals(f1.bytes), true);
  fails(await bucket("otherUnit").createSignedUrl(f1.key, 60), null, "Other unit cannot sign the original");
  assert.equal(must(await abc("viewer").rpc("record_file_check", { p_revision: rev1, p_content_hash: detail.content_hash }), "check"), true);

  phase = "concurrent publishers";
  const [f2, f3] = [await storeFile("publisher", A), await storeFile("publisher2", A)];
  const results = await Promise.all([
    publish("publisher", f2, payload(codeA, f2.sha), 1, "Reexportado", true),
    publish("publisher2", f3, payload(codeA, f3.sha), 1, "Reexportado", true),
  ]);
  assert.equal(results.filter((r) => !r.error).length, 1, "Exactly one concurrent publication wins");
  assert.equal(results.filter((r) => r.error?.code === "40001").length, 1, "The other gets a version conflict");
  const series = (await db.query("select version,(select count(*)::int from abc.report_revisions r where r.series_id=s.id) n from abc.report_series s where unit_id=$1", [A])).rows;
  assert.deepEqual(series, [{ version: 2, n: 2 }]);

  phase = "audit log";
  const actions = (await db.query("select action,count(*)::int n from core.system_audit_log where module='abc' and unit_id=$1 group by action order by action", [A])).rows;
  assert.deepEqual(actions, [{ action: "revision.file_check_ok", n: 1 }, { action: "revision.publish", n: 2 }]);
  console.log("PASS Curva ABC real local integration suite");
} catch (error) {
  const code = /^[A-Z0-9_]{1,32}$/.test(String(error.code ?? "")) ? error.code : "CHECK_FAILED";
  console.error("FAIL Curva ABC integration: " + phase + "; code=" + code + "; " + String(error.message ?? "").slice(0, 160));
  process.exitCode = 1;
} finally {
  await db.end();
}
