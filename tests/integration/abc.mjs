import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { erpWorkbook, syntheticProducts } from "../abc-erp-workbook.mjs";

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
const users = {}, clients = {}, emails = {};
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
  emails[name] = email;
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

/**
 * The P0 flow end to end: a real ERP-shaped XLSX selected in Chromium, parsed in the page, original
 * uploaded to Storage, published by RPC and re-checked against the stored bytes. One context keeps
 * Web Crypto; the other removes crypto.subtle, as on the plain-HTTP LAN shared DEV.
 */
async function browserImport() {
  phase = "browser import: build";
  const port = await new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => { const p = probe.address().port; probe.close(() => done(p)); });
  });
  const origin = "http://127.0.0.1:" + port;
  const outDir = mkdtempSync(join(tmpdir(), "abc-import-e2e-"));
  const vite = (args, stdio) => spawn(process.execPath, [resolve("node_modules/vite/bin/vite.js"), ...args], {
    cwd: "apps/web", env: { ...process.env, VITE_SUPABASE_URL: config.API_URL, VITE_SUPABASE_PUBLISHABLE_KEY: config.ANON_KEY }, stdio,
  });
  const build = vite(["build", "--outDir", outDir, "--emptyOutDir"], "inherit");
  assert.equal(await new Promise((done) => build.on("exit", done)), 0, "Build the application");
  const server = vite(["preview", "--outDir", outDir, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], "ignore");
  let browser;
  try {
    for (const deadline = Date.now() + 60000; ;) {
      try { if ((await fetch(origin)).ok) break; } catch { /* preview starting */ }
      if (Date.now() > deadline) throw Error("Local preview did not become ready");
      await new Promise((done) => setTimeout(done, 100));
    }
    browser = await chromium.launch();
    const now = new Date();
    const month = (back) => { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)); return d.toISOString().slice(0, 7); };
    for (const run of [{ width: 1280, webCrypto: true, month: month(2) }, { width: 375, webCrypto: false, month: month(3) }]) {
      const label = `${run.width}px ${run.webCrypto ? "Web Crypto" : "sem crypto.subtle"}`;
      phase = `browser import ${label}: login`;
      const context = await browser.newContext({ viewport: { width: run.width, height: 812 }, hasTouch: run.width === 375 });
      if (!run.webCrypto) await context.addInitScript(() => Object.defineProperty(globalThis.crypto, "subtle", { value: undefined }));
      const page = await context.newPage();
      await page.goto(origin);
      await page.getByLabel(/E-mail/i).fill(emails.otherUnit);
      await page.getByLabel(/^Senha$/i).fill(password);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await page.getByLabel(/^Senha$/i).waitFor({ state: "detached" });
      assert.equal(await page.evaluate(() => typeof crypto.subtle), run.webCrypto ? "object" : "undefined", label);

      phase = `browser import ${label}: preview`;
      const products = syntheticProducts(234, run.width);
      const book = erpWorkbook({ branch: codeB, products, month: run.month });
      const name = `curva_abc_01-${run.month.slice(5)}_ate_${book.end.slice(8)}-${run.month.slice(5)}.xlsx`;
      await page.goto(origin + "/abc/units/" + B + "/import");
      await page.locator('input[type="file"]').setInputFiles({ name, mimeType: XLSX, buffer: Buffer.from(book.bytes) });
      await page.getByText("Validação concluída", { exact: false }).waitFor();
      assert.match(await page.locator(".abc-facts").innerText(), /Produtos: 234/, "Preview counts 234 products");
      const sha = createHash("sha256").update(book.bytes).digest("hex");

      phase = `browser import ${label}: publish`;
      await page.getByRole("button", { name: "Publicar relatório" }).click();
      await page.waitForURL(/\/abc\/revisions\/[0-9a-f-]{36}$/);
      const revision = page.url().split("/").pop();
      const stored = (await db.query(
        `select r.line_count,r.content_hash,r.declared_total::text,f.sha256,f.object_key,r.published_by,
          (select count(*)::int from abc.revision_lines l where l.revision_id=r.id and l.total::text=any($2)) exact
         from abc.report_revisions r join abc.source_files f on f.id=r.source_file_id where r.id=$1`,
        [revision, products.map((p) => p.total)])).rows[0];
      assert.equal(stored.line_count, 234, "All products published");
      assert.equal(stored.exact, 234, "Totals stored digit for digit");
      assert.equal(stored.declared_total, book.grand, "Total Geral preserved");
      assert.equal(stored.sha256, sha, "SHA-256 of the original computed in the page");
      assert.equal(stored.published_by, users.otherUnit, "Authorship from the JWT");
      const { data: original, error } = await bucket("otherUnit").download(stored.object_key);
      assert.equal(error, null, "Original stored");
      assert.equal(createHash("sha256").update(Buffer.from(await original.arrayBuffer())).digest("hex"), sha, "Stored bytes equal the selected file");

      phase = `browser import ${label}: check original`;
      await page.getByRole("button", { name: "Conferir com o arquivo" }).click();
      await page.getByText("O arquivo original reproduz exatamente esta publicação.").waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `No page-level horizontal overflow at ${run.width}px`);

      phase = `browser import ${label}: analytics areas`;
      const areas = [["overview", "Indicadores da última competência"], ...(run.webCrypto ? [] : [["compare", "Resumo da comparação"]]),
        ["products", null], ["categories", null], ["reports", null], ["imports", null]];
      for (const [area, region] of areas) {
        await page.goto(`${origin}/abc/${area}?unidade=${B}`);
        await page.locator("h1").waitFor();
        if (region) assert.match(await page.getByRole("region", { name: region }).innerText(), /\d/, `${area} shows published numbers`);
        else await page.locator(".abc-section, .table-scroll, .empty-state").first().waitFor();
        assert.equal(await page.locator(".notice.error").count(), 0, `${area} has no error`);
        const areaOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(areaOverflow <= 1, `No horizontal overflow in ${area} at ${run.width}px`);
      }
      await context.close();
    }
    const checks = (await db.query("select count(*)::int n from core.system_audit_log where module='abc' and unit_id=$1 and action='revision.file_check_ok'", [B])).rows[0].n;
    assert.equal(checks, 2, "Both browser checks logged");
  } finally {
    await browser?.close();
    server.kill();
    rmSync(outDir, { recursive: true, force: true });
  }
}

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

  phase = "analytics read model";
  const overview = must(await abc("viewer").rpc("overview", { p_unit: A, p_cost_basis: "NET_PERIOD" }), "viewer reads overview");
  assert.equal(overview.competencies.length, 1);
  assert.equal(typeof overview.competencies[0].calculated_total, "string", "Money as text");
  must(await abc("viewer").rpc("competency_products", { p_unit: A, p_cost_basis: "NET_PERIOD", p_competency: "2026-07-01" }), "viewer reads products");
  must(await abc("viewer").rpc("unit_revisions", { p_unit: A }), "viewer reads revisions");
  for (const [fn, args] of [["overview", { p_unit: A, p_cost_basis: "NET_PERIOD" }], ["unit_revisions", { p_unit: A }],
    ["product_history", { p_unit: A, p_cost_basis: "NET_PERIOD", p_code: "1.01" }],
    ["compare", { p_unit: A, p_cost_basis: "NET_PERIOD", p_base: "2026-06-01", p_current: "2026-07-01" }]]) {
    fails(await abc("otherUnit").rpc(fn, args), "42501", `Other unit cannot call ${fn}`);
    fails(await abc("quality").rpc(fn, args), "42501", `Another module's role cannot call ${fn}`);
  }
  fails(await abc("viewer").rpc("compare", { p_unit: A, p_cost_basis: "NET_PERIOD", p_base: "2026-06-01", p_current: "2026-07-01" }), "P0002", "Unpublished base competency");

  phase = "audit log";
  const actions = (await db.query("select action,count(*)::int n from core.system_audit_log where module='abc' and unit_id=$1 group by action order by action", [A])).rows;
  assert.deepEqual(actions, [{ action: "revision.file_check_ok", n: 1 }, { action: "revision.publish", n: 2 }]);
  await browserImport();
  console.log("PASS Curva ABC real local integration suite");
} catch (error) {
  const code = /^[A-Z0-9_]{1,32}$/.test(String(error.code ?? "")) ? error.code : "CHECK_FAILED";
  console.error("FAIL Curva ABC integration: " + phase + "; code=" + code + "; " + String(error.message ?? "").slice(0, 160));
  process.exitCode = 1;
} finally {
  await db.end();
}
