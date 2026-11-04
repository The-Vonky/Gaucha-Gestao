import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { createServer } from "vite";
import readExcelFile from "read-excel-file/node";
import { unzipSync, strFromU8 } from "fflate";

// Guarda anterior à descoberta de configuração: jamais executar em notebook persistente.
assert.equal(process.env.CI, "true", "Somente CI descartável");
assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted", "Somente runner hospedado");
const config = JSON.parse(execFileSync("npx", ["--yes", "supabase@2.117.0", "status", "-o", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
}));
for (const url of [config.API_URL, config.DB_URL]) assert.equal(new URL(url).hostname, "127.0.0.1");
const db = new pg.Client({ connectionString: config.DB_URL });
const a = new pg.Client({ connectionString: config.DB_URL }), b = new pg.Client({ connectionString: config.DB_URL });
const tag = randomUUID().slice(0, 8), password = `Synthetic-${randomUUID()}-aA1!`;
const A = randomUUID(), B = randomUUID(), C = randomUUID(), users = {};
const permissions = ["sales.entry.read", "sales.dashboard.read", "sales.export.filtered", "sales.export.full"];
let browser, server, phase = "setup";
const must = r => { assert.equal(r.error, null, "RPC autorizada"); return r.data; };
const fails = (r, code = "42501") => { assert.equal(r.data, null); assert.equal(r.error?.code, code); };
async function user(name, grants, units) {
  const email = `ven05a-${tag}-${name}@example.test`;
  const res = await fetch(`${config.API_URL}/auth/v1/admin/users`, { method: "POST", headers: {
    apikey: config.SERVICE_ROLE_KEY, Authorization: `Bearer ${config.SERVICE_ROLE_KEY}`, "Content-Type": "application/json",
  }, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: `Pessoa sintética ${name}` } }) });
  assert.equal(res.status, 200, "Auth sintético no CI");
  const id = (await res.json()).id;
  const role = (await db.query("insert into core.roles(key,name) values($1,$1) returning id", [`ven05a-${tag}-${name}`])).rows[0].id;
  for (const p of grants) await db.query("insert into core.role_permissions values($1,$2)", [role, p]);
  for (const unit of units ?? [null]) await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id) values($1,$2,$3,$4)", [id, role, unit ? "unit" : "global", unit]);
  const client = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await client.auth.signInWithPassword({ email, password }));
  users[name] = { id, email, client };
}
const rpc = (name, args) => users[name].client.schema("public").rpc("sales_export_page", args);
const full = name => rpc(name, { p_mode: "full" });
async function blocked(waiter, blocker) {
  for (let n = 0; n < 100; n++) {
    if ((await db.query("select pg_blocking_pids($1) pids", [waiter])).rows[0].pids.includes(blocker)) return;
    await new Promise(r => setTimeout(r, 25));
  }
  assert.fail("Bloqueio de autorização esperado não observado");
}
try {
  await Promise.all([db.connect(), a.connect(), b.connect()]);
  await db.query("insert into core.units(id,code,name) values($1,$4,$7),($2,$5,'VEN05A B'),($3,$6,'VEN05A C')", [A, B, C, `V5-A-${tag}`, `V5-B-${tag}`, `V5-C-${tag}`, " \t=HYPERLINK(\"https://evil.test\") Á 😀"]);
  await user("global", permissions, null); await user("unit", permissions, [A]); await user("two", permissions, [A, B]);
  await user("reader", ["sales.entry.read"], [A]); await user("dash", ["sales.dashboard.read", "sales.export.full", "sales.export.filtered"], [A]);
  await user("inactive", permissions, [A]); await user("revoked", permissions, [A]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [users.global.id]);
  await db.query("insert into sales.entries(sale_date,unit_id,payment_method,amount,created_by) values('2026-09-01',$1,'Stone',0.01,$4),('2026-09-01',$1,'PIX',0.29,$4),('2026-09-01',$2,'Stone',0.10,$4),('2026-09-01',$3,'Stone',999999999999.99,$4)", [A, B, C, users.global.id]);
  await db.query("insert into sales.legacy_monthly_adjustments(competency,unit_id,payment_method,amount,reason) values('2026-09-01',$1,'Stone',0.10,$2)", [A, "\t@SUM(1,2) ajuste mensal"]);
  await db.query("update core.units set active=false where id=$1", [B]);
  await db.query("update core.profiles set active=false where id=$1", [users.inactive.id]);

  phase = "Auth e PostgREST";
  for (const name of ["reader", "dash", "inactive"]) fails(await full(name));
  const anon = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false } });
  fails(await anon.schema("public").rpc("sales_export_page", { p_mode: "full" }));
  const invalid = createClient(config.API_URL, config.ANON_KEY, { global: { headers: { Authorization: "Bearer invalid-session" } }, auth: { persistSession: false } });
  assert.ok((await invalid.schema("public").rpc("sales_export_page", { p_mode: "full" })).error);
  const single = must(await full("unit")); assert.deepEqual(single.units.map(u => u.id), [A]); assert.equal(single.total, "0.40");
  const two = must(await full("two")); assert.equal(two.total, "0.50"); assert.equal(two.units.find(u => u.id === B).active, false);
  assert.ok(must(await full("global")).units.some(u => u.id === C));
  fails(await rpc("unit", { p_mode: "filtered", p_units: [A, C] }));
  fails(await rpc("unit", { p_mode: "full", p_units: [A] }), "23514");
  const stone = must(await rpc("unit", { p_mode: "filtered", p_from: "2026-09-01", p_to: "2026-09-30", p_method: "Stone" }));
  assert.equal(stone.total, "0.11"); assert.equal(stone.entry_total, "0.01"); assert.equal(stone.adjustment_total, "0.10");
  fails(await users.unit.client.schema("sales").from("entries").select(), "PGRST106");

  phase = "1100+ registros sem truncamento PostgREST";
  await db.query("insert into sales.entries(sale_date,unit_id,payment_method,amount,created_by) select date '1900-01-01'+n,$1,'Stone',0.01,$2 from generate_series(1,1100) n", [A, users.global.id]);
  let count = 0, total = 0n, token = null;
  for (;;) {
    const p = must(await rpc("unit", { p_mode: "full", p_offset: count, p_token: token }));
    assert.equal(p.record_count, 1103); assert.equal(p.total, "11.40");
    if (token) assert.equal(p.token, token); token = p.token;
    count += p.rows.length;
    for (const row of p.rows) total += BigInt(row.amount.replace(".", ""));
    if (count === p.record_count) break;
  }
  assert.equal(count, 1103); assert.equal(total, 1140n);
  await db.query("update sales.entries set amount=0.02 where unit_id=$1 and sale_date='1900-01-02'", [A]);
  fails(await rpc("unit", { p_mode: "full", p_offset: count, p_token: token }), "40001");

  phase = "concorrência real — exportação antes da revogação";
  await a.query("begin; set local statement_timeout='12s'; set local role authenticated");
  await a.query("select set_config('request.jwt.claim.sub',$1,true)", [users.revoked.id]);
  await a.query("select public.sales_export_page('full')");
  const aPid = (await a.query("select pg_backend_pid() pid")).rows[0].pid;
  const bPid = (await b.query("select pg_backend_pid() pid")).rows[0].pid;
  const revoke = b.query("update core.user_role_assignments set active=false where user_id=$1", [users.revoked.id]);
  await blocked(bPid, aPid); await a.query("commit"); await revoke; fails(await full("revoked"));
  phase = "concorrência real — revogação antes da exportação";
  // A conexão de fixture usava o ator de Vendas para registrar lançamentos.
  // Restaurar concessão é preparação pelo owner do CI, não ação desse leitor.
  // validate_assignment deve continuar negando delegação ao usuário de Vendas.
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.query("update core.user_role_assignments set active=true where user_id=$1", [users.revoked.id]);
  await b.query("begin; set local statement_timeout='12s'");
  await b.query("update core.profiles set active=false where id=$1", [users.revoked.id]);
  await a.query("begin; set local statement_timeout='12s'; set local role authenticated");
  await a.query("select set_config('request.jwt.claim.sub',$1,true)", [users.revoked.id]);
  const pending = a.query("select public.sales_export_page('full')").then(() => null, e => e.code);
  await blocked(aPid, bPid); await b.query("commit"); assert.equal(await pending, "42501"); await a.query("rollback");

  phase = "download Chromium — aplicação real, Auth real, XLSX real";
  process.env.VITE_SUPABASE_URL = config.API_URL; process.env.VITE_SUPABASE_PUBLISHABLE_KEY = config.ANON_KEY;
  server = await createServer({ configFile: "apps/web/vite.config.ts", root: "apps/web", server: { host: "127.0.0.1", port: 0 } });
  await server.listen(); const address = server.httpServer.address();
  browser = await chromium.launch({ headless: true }); const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  phase = "Chromium — abrir login";
  await page.goto(`http://127.0.0.1:${address.port}/sales/entries?from=2026-09-01&to=2026-09-30&method=Stone`);
  phase = "Chromium — autenticar identidade sintética";
  await page.getByLabel("E-mail", { exact: true }).fill(users.unit.email); await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  phase = "Chromium — carregar consulta operacional";
  await page.getByRole("button", { name: "Exportar período filtrado", exact: true }).waitFor();
  // Rascunho não confirmado: download ainda deve representar setembro/Stone.
  await page.locator('select[name="method"]').selectOption("PIX");
  phase = "Chromium — gerar e baixar XLSX";
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar período filtrado", exact: true }).click();
  const outcome = await Promise.race([
    downloadPromise.then(download => ({ download })),
    page.locator(".sales-export [role=alert]").waitFor().then(async () => ({ error: await page.locator(".sales-export [role=alert]").textContent() })),
  ]);
  assert.ok(!outcome.error, outcome.error); // Somente mensagem já sanitizada pela UI.
  const download = outcome.download;
  assert.match(download.suggestedFilename(), /^historico-filtrado-01-09-2026-30-09-2026-1total\.xlsx$/);
  const bytes = await readFile(await download.path()); const sheets = await readExcelFile(bytes, { trim: false });
  assert.deepEqual(sheets.map(s => s.sheet), ["Lançamentos", "Ajustes mensais", "Resumo"]);
  assert.equal(sheets[0].data.length, 6); assert.equal(sheets[0].data[4][3], "Stone"); assert.equal(sheets[0].data[4][4], 0.01);
  assert.equal(sheets[0].data[4][5], "Pessoa sintética global");
  assert.equal(sheets[1].data[1][0], "09/2026"); assert.equal(sheets[1].data[1][4], 0.10);
  assert.equal(sheets[2].data.find(r => r[0] === "Total consolidado (R$)")[1], 0.11);
  for (const [name, data] of Object.entries(unzipSync(bytes))) if (/\.xml$|\.rels$/.test(name)) assert.doesNotMatch(strFromU8(data), /<f(?:\s|>)|TargetMode="External"|<hyperlink/i);
  await context.close();
  console.log("VEN-05A PASS: JWT/PostgREST, escopo, inativa, paginação>1000, centavos, mutação, bloqueios nas duas ordens e download Chromium/readback/XML.");
} catch (error) {
  console.error(`VEN-05A falhou na fase: ${phase}`);
  // Não imprimir payloads de Auth, chaves ou respostas financeiras.
  // Não anexar o erro original: pode conter resposta de autenticação com credenciais.
  // eslint-disable-next-line preserve-caught-error
  throw new Error(error instanceof assert.AssertionError ? error.message
    : `Falha de integração VEN-05A; SQLSTATE=${/^[A-Z0-9]{5}$/.test(error?.code ?? "") ? error.code : "indisponível"}`);
} finally {
  await browser?.close(); await server?.close();
  await Promise.allSettled([a.query("rollback"), b.query("rollback")]);
  await Promise.allSettled([db.end(), a.end(), b.end()]);
}
