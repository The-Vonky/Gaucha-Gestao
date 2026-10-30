import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "playwright/test";
import { salesLocalWeb } from "./sales-local-web.mjs";
import { SalesLocalDatabase } from "./sales-local.mjs";
import { retireSalesUnits } from "./sales-unit-cleanup.mjs";
import { retireSalesRoles, finishSalesLocal } from "./sales-role-cleanup.mjs";

// Somente notebook autorizado, reutilizando cadastros sintéticos inativos VEN-04A.
assert.equal(process.env.VEN04B_LOCAL_TEST, "gaucha-gestao-local");
const reuse = process.env.VEN04B_REUSE_TAG;
assert.match(reuse ?? "", /^VEN04A-[0-9a-f]{8}$/);
const local = await SalesLocalDatabase.open(), db = local.client;
await db.query("rollback"); local.rollbackOnly = false;
const cli = process.env.VEN04B_SUPABASE_CLI;
assert.ok(cli, "Informe o CLI local existente.");
const config = JSON.parse(execFileSync(cli, ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
assert.equal(config.API_URL, "http://127.0.0.1:54321");
assert.equal(new URL(config.DB_URL).hostname, "127.0.0.1");
assert.equal(new URL(config.DB_URL).port, "54322");
const A = randomUUID(), B = randomUUID(), C = randomUUID(), sector = { id: randomUUID() };
const tag = `VEN04B-${randomUUID().slice(0, 8)}`, people = {}, roles = [], entries = [];
const statusesOwned = [], snapshotSource = `ven04b_${tag.slice(7)}`;
const roleReceipts = [], usersProof = [];
const directory = process.env.VEN04B_ARTIFACT_DIR ?? "/tmp/ven04b-ui";
mkdirSync(directory, { recursive: true, mode: 0o700 });
const manifest = { tag, reused: reuse, units: [A, B, C], users: [], roles, entries, checks: [], screenshots: [], timings: [], axe: [], before: local.before, cleanup: "Pendente" };
const manifestPath = `${directory}/${tag}-${randomUUID()}-manifest.json`;
const save = () => writeFileSync(manifestPath, JSON.stringify({ ...manifest, roleReceipts, usersProof }, null, 2), { mode: 0o600 });
save();
let browser, server, lastPage;
const base = "http://127.0.0.1:5173", query = "from=2042-07&to=2042-09&baseFrom=2042-07&baseTo=2042-09&daily=2042-09";
const dashboardPath = `/sales/dashboard?${query}`;
function must(response) { assert.equal(response.error, null, "RPC sintética local deve ser aceita."); return response.data; }
const rpc = (person, name, args = {}) => people[person].client.schema("public").rpc(`sales_${name}`, args);
const dash = (person, unit = null, scope = "stone") => rpc(person, "dashboard", { p_from: "2042-09-01", p_to: "2042-09-01", p_units: unit ? [unit] : null, p_scope: scope, p_daily_month: "2042-09-01" });
async function identity(name, original, permissions, scope, unit = A) {
  const person = (await db.query("select p.id,p.active,u.email from core.profiles p join auth.users u on u.id=p.id where p.display_name=$1", [`${reuse} ${original}`])).rows[0];
  assert.ok(person && !person.active, "Conta sintética anterior precisa estar inativa.");
  assert.equal(person.email, `${reuse}-${original}@example.test`.toLowerCase());
  const password = `Synthetic-${randomUUID()}-aA1!`;
  const response = await fetch(`${config.API_URL}/auth/v1/admin/users/${person.id}`, { method: "PUT", headers: { apikey: config.SERVICE_ROLE_KEY, Authorization: `Bearer ${config.SERVICE_ROLE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
  assert.equal(response.status, 200, "Senha temporária somente de identidade sintética reutilizada");
  // Nunca imprime ou persiste credenciais; o browser recebe apenas chave pública e login sintético.
  const key = `${tag}-${name}`.toLowerCase();
  const role = { id: randomUUID() };
  roleReceipts.push({ id: role.id, key }); manifest.users.push(person.id);
  usersProof.push({ id: person.id, email: person.email, displayName: `${reuse} ${original}` }); save();
  // Não adota um papel encontrado apenas por nome: cada execução possui UUID novo.
  await db.query("insert into core.roles(id,key,name) values($1,$2,$3)", [role.id, key, `${tag} ${name}`]);
  roles.push(role.id);
  await db.query("update core.profiles set active=true where id=$1", [person.id]);
  for (const permission of permissions) await db.query("insert into core.role_permissions(role_id,permission_key) values($1,$2) on conflict do nothing", [role.id, permission]);
  if (scope) {
    await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) values($1,$2,$3,$4,$5)", [person.id, role.id, scope, scope === "global" ? null : unit, scope === "sector" ? sector.id : null]);
  }
  const client = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  must(await client.auth.signInWithPassword({ email: person.email, password }));
  people[name] = { ...person, password, client, role: role.id };
}
async function create(date, unit, method, amount) {
  const row = must(await rpc("operations", "entry_create", { p_date: date, p_unit: unit, p_method: method, p_amount: amount })); entries.push(row.id); return row;
}
async function login(name, path = dashboardPath) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "pt-BR", reducedMotion: "reduce" });
  await context.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage(); lastPage = page;
  await page.goto(base + path); await fillLogin(page, name);
  return { page, context };
}
async function fillLogin(page, name) {
  await page.getByLabel("E-mail", { exact: true }).fill(people[name].email);
  await page.getByLabel("Senha", { exact: true }).fill(people[name].password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
}
const metric = (page, name) => page.locator(".metric").filter({ has: page.getByText(name, { exact: true }) }).locator(".metric-value");
const fig = (page, name) => page.getByRole("figure", { name: new RegExp(`^${name}`) });
async function ready(page, amount) {
  await expect(metric(page, "Total financeiro do período")).toHaveText(amount);
  await expect(page.getByText("Carregando dashboard…", { exact: true })).toHaveCount(0);
}
async function apply(page, unit, scope = "stone") {
  await page.getByLabel("Unidade", { exact: true }).selectOption(unit);
  await page.getByLabel("Escopo financeiro").selectOption(scope);
  const response = page.waitForResponse(r => r.url().endsWith("/rpc/sales_dashboard") && r.request().postDataJSON().p_scope === scope);
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click(); await response;
  await expect(page.getByText("Carregando dashboard…", { exact: true })).toHaveCount(0);
}
try {
  server = await salesLocalWeb(config);
  browser = await chromium.launch({ headless: true });
  await db.query("insert into core.units(id,code,name) values($1,$4,$4),($2,$5,$5),($3,$6,$6)", [A, B, C, `${tag}-A`, `${tag}-B`, `${tag}-C`]);
  await db.query("insert into core.sectors(id,code,name) values($1,$2,$2)", [sector.id, `${tag}-S`]);
  await db.query("insert into core.unit_sectors(unit_id,sector_id) values($1,$2)", [A, sector.id]);
  await db.query("update core.sectors set active=true where id=$1", [sector.id]);
  await identity("global", "operator", ["sales.dashboard.read"], "global");
  await identity("unitA", "reader", ["sales.dashboard.read"], "unit");
  await identity("unitB", "deleter", ["sales.dashboard.read"], "unit", B);
  await identity("operations", "editor", ["sales.entry.read", "sales.entry.create", "sales.entry.edit", "sales.entry.delete"], "global");
  await identity("creator", "creator", ["sales.entry.create"], "unit");
  await identity("denied", "denied", [], null);
  await identity("sector", "sector", ["sales.dashboard.read"], "sector");
  if (process.env.VEN04B_FAIL_AFTER_PREPARE === "1") throw new Error("Falha sintética deliberada após preparação: validar teardown");
  // Snapshots pertencem somente a esta execução; colisão aborta sem adotar dados existentes.
  await db.query("insert into sales.month_statuses(competency,is_closed,last_day_with_data,source) values('2042-07-01',true,31,$1),('2042-09-01',false,2,$1)", [snapshotSource]);
  statusesOwned.push({ competency: "2042-07-01", is_closed: true, last_day_with_data: 31, source: snapshotSource }, { competency: "2042-09-01", is_closed: false, last_day_with_data: 2, source: snapshotSource });
  const statuses = (await db.query("select competency::text,is_closed,last_day_with_data,source from sales.month_statuses where competency in ('2042-07-01','2042-09-01') order by competency")).rows;
  assert.deepEqual(statuses, [{ competency: "2042-07-01", is_closed: true, last_day_with_data: 31, source: snapshotSource }, { competency: "2042-09-01", is_closed: false, last_day_with_data: 2, source: snapshotSource }]);
  await db.query("insert into sales.legacy_monthly_adjustments(competency,unit_id,payment_method,amount,reason) values('2042-09-01',$1,'Stone',50,$2)", [A, `${tag} oráculo sintético`]);
  assert.equal((await db.query("select amount::text from sales.legacy_monthly_adjustments where competency='2042-09-01' and unit_id=$1 and reason=$2", [A, `${tag} oráculo sintético`])).rows[0]?.amount, "50");
  for (const [date, method, value] of [["2042-09-01", "Stone", "100.00"], ["2042-09-02", "Stone", "150.00"], ["2042-09-01", "PIX", "20.00"], ["2042-09-02", "PIX", "30.00"], ["2042-07-01", "Stone", "200.00"]]) await create(date, A, method, value);
  await create("2042-09-01", B, "Stone", "300.00");
  await db.query("update core.units set active=false where id=$1", [B]);
  const stone = must(await dash("global", A)), combined = must(await dash("global", A, "combined"));
  assert.deepEqual([stone.summary.total, stone.summary.daily_total, stone.months[0].projection], ["300.00", "250.00", "3750.00"]);
  assert.deepEqual([combined.summary.total, combined.summary.daily_total, combined.months[0].projection], ["350.00", "300.00", "4500.00"]);
  assert.equal(stone.summary.reconciliation_difference, "0.00");
  assert.equal((await rpc("global", "entries_list")).error?.code, "42501");
  assert.equal((await rpc("global", "entry_detail", { p_id: entries[0] })).error?.code, "42501");
  for (const name of ["operations", "creator", "denied", "sector"]) assert.equal((await dash(name)).error?.code, "42501");
  assert.equal((await dash("unitA", B)).error?.code, "42501");
  const restrictedBefore = must(await dash("unitA", A));
  assert.equal(restrictedBefore.months[0].partial, null); assert.equal(restrictedBefore.months[0].projection, null);
  await create("2042-08-01", B, "PIX", "0.01").catch(async () => {
    // Criação em unidade inativa é negada; ativa exclusivamente fixture B para ensaio.
    await db.query("update core.units set active=true where id=$1", [B]); await create("2042-08-01", B, "PIX", "0.01"); await db.query("update core.units set active=false where id=$1", [B]);
  });
  assert.deepEqual(must(await dash("unitA", A)), restrictedBefore, "Não interferência integral de B sobre leitor A");
  const extra = must(await rpc("operations", "entries_list", { p_unit: B, p_from: "2042-08-01", p_to: "2042-08-01" }))[0];
  must(await rpc("operations", "entry_delete", { p_id: extra.id, p_expected_version: extra.version }));
  manifest.checks.push("Auth/PostgREST real: oráculos 300/350, diário250/300, projeção3750/4500, diferença0; dashboard sem entries; operador/criador/sem papel/setor negados; unidade externa e não interferência integral A/B.");


  const manager = await login("global"); const page = manager.page;
  const requests = []; page.on("request", r => { if (/\/rpc\/sales_/.test(r.url())) requests.push(new URL(r.url()).pathname); });
  await ready(page, "R$ 800,00"); // julho200 + setembro600; ajuste50 incluído nos300 deA.
  const ranking = fig(page, "Ranking"); await expect(ranking.getByRole("button")).toHaveCount(2);
  await apply(page, A); await ready(page, "R$ 500,00");
  await expect(fig(page, "Acumulado diário").locator(".sales-daily-metrics strong").first()).toHaveText("R$ 250,00");
  await expect(metric(page, "Projeção da competência diária — estimativa")).toHaveText("R$ 3.750,00");
  await apply(page, A, "combined"); await ready(page, "R$ 550,00");
  await expect(metric(page, "Projeção da competência diária — estimativa")).toHaveText("R$ 4.500,00");
  const initial = page.url(); await page.reload(); await ready(page, "R$ 550,00"); assert.equal(page.url(), initial);
  const series = page.getByRole("group", { name: "Séries das barras empilhadas" }).getByRole("button");
  const calls = requests.length; await series.click(); await expect(series).toHaveAttribute("aria-pressed", "false"); await ready(page, "R$ 550,00"); assert.equal(requests.length, calls); await series.click();
  const cell = fig(page, "Heatmap").getByRole("button", { name: /09\/2042/ }); await cell.focus(); await page.keyboard.press("Enter"); await ready(page, "R$ 350,00");
  assert.ok(page.url().includes("from=2042-09"));
  await page.getByText("Valores diários e referência anterior", { exact: true }).click();
  await fig(page, "Acumulado diário").getByRole("button", { name: "02/09/2042" }).click(); await expect(page.getByText(/Foco no dia 2:/)).toBeVisible();
  await page.getByRole("button", { name: "Voltar", exact: true }).click(); await expect(page.getByText(/Foco no dia 2:/)).toHaveCount(0);
  await page.getByRole("button", { name: "Voltar", exact: true }).click(); await ready(page, "R$ 550,00");
  await page.goForward(); await ready(page, "R$ 350,00"); await page.goBack(); await ready(page, "R$ 550,00");
  await page.getByRole("button", { name: "Comparar tudo", exact: true }).click(); await ready(page, "R$ 850,00");
  await expect(fig(page, "Evolução mensal").getByText("08/2042 · lacuna", { exact: true })).toBeVisible();
  await expect(fig(page, "Resumo mensal").getByText("Fechado confirmado", { exact: true })).toBeVisible();
  await expect(fig(page, "Resumo mensal").getByText("Parcial até dia 2", { exact: true })).toBeVisible();
  // Respostas reais reordenadas pelo transporte, sem fabricar payload financeiro.
  let release, completed; const held = new Promise(resolve => { release = resolve; });
  const staleCompleted = new Promise(resolve => { completed = resolve; }); let first = true;
  await page.route("**/rpc/sales_dashboard", async route => {
    const hold = first; first = false;
    const response = await route.fetch(); if (hold) await held;
    await route.fulfill({ response }); if (hold) completed();
  });
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await page.getByLabel("Escopo financeiro").selectOption("stone");
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click(); await ready(page, "R$ 800,00"); release();
  await staleCompleted; await page.unroute("**/rpc/sales_dashboard"); await ready(page, "R$ 800,00");
  // Falha real de transporte e recuperação explícita.
  await page.route("**/rpc/sales_dashboard", route => route.abort(), { times: 1 });
  await page.getByRole("button", { name: "Atualizar", exact: true }).click(); await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByText("Total financeiro do período", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Tentar novamente" }).click(); await ready(page, "R$ 800,00");
  assert.equal(requests.some(r => /sales_entries_list|sales_entry_detail|sales_operation_units/.test(r)), false);
  manifest.checks.push("Playwright real global: Stone/combined, oráculos na UI, todas as visualizações, série oculta sem RPC/KPI, célula/teclado/dia, URL/reload/Voltar/Avançar/comparar tudo, resposta obsoleta e falha de rede recuperável.");

  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Sem overflow da página em ${width}`);
    const heat = page.getByRole("region", { name: "Heatmap de vendas", exact: true }); await heat.focus(); await page.keyboard.press("End");
    const target = fig(page, "Heatmap").getByRole("button").first(); await target.focus(); assert.equal(await target.evaluate(el => el === document.activeElement), true);
    await page.evaluate(() => scrollTo(0, 0)); const screenshot = `${directory}/${tag}-${width}.png`; await page.screenshot({ path: screenshot, fullPage: true }); manifest.screenshots.push(screenshot);
  }
  if (process.env.VEN04B_AXE_PATH) {
    await page.addScriptTag({ path: process.env.VEN04B_AXE_PATH });
    const accessibility = await page.evaluate(async () => {
      const result = await window.axe.run(".sales-dashboard", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } });
      return { violations: result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })), passes: result.passes.length, incomplete: result.incomplete.map(v => v.id) };
    }); manifest.axe.push(accessibility); assert.deepEqual(accessibility.violations, [], "axe WCAG A/AA");
  }
  // Sem autorização operacional mesmo por URL direta.
  await page.goto(base + "/sales"); await expect(page.getByRole("heading", { name: "Acesso não autorizado" })).toBeVisible();
  await manager.context.close();

  for (const name of ["unitA", "unitB"]) {
    const user = await login(name); await ready(user.page, name === "unitA" ? "R$ 500,00" : "R$ 300,00");
    await expect(fig(user.page, "Resumo mensal").getByText("Status histórico indisponível para este acesso", { exact: true }).first()).toBeVisible();
    await expect(metric(user.page, "Média diária do período")).toHaveText("Indisponível");
    assert.equal((await user.page.locator(".sales-dashboard").innerHTML()).includes(name === "unitA" ? `${reuse}-B` : `${reuse}-A`), false);
    const other = name === "unitA" ? B : A;
    await user.page.goto(`${base}${dashboardPath}&unit=${other}`); await expect(user.page.getByText(/Unidade indisponível para este acesso/)).toBeVisible();
    await user.page.goto(base + dashboardPath); await ready(user.page, name === "unitA" ? "R$ 500,00" : "R$ 300,00");
    if (name === "unitA") {
      await db.query("update core.user_role_assignments set active=false where user_id=$1 and role_id=$2", [people[name].id, people[name].role]);
      assert.equal((await dash(name)).error?.code, "42501");
      await user.page.getByRole("button", { name: "Atualizar", exact: true }).click(); await expect(user.page.getByRole("heading", { name: "Acesso não autorizado" })).toBeVisible();
      await expect(user.page.getByText("Total financeiro do período", { exact: true })).toHaveCount(0);
    } else {
      await user.page.getByRole("button", { name: "Sair", exact: true }).first().click(); await fillLogin(user.page, "global"); await ready(user.page, "R$ 800,00");
      await db.query("update core.profiles set active=false where id=$1", [people[name].id]); assert.equal((await dash(name)).error?.code, "42501");
    }
    await user.context.close();
  }
  for (const name of ["operations", "creator", "denied", "sector"]) {
    const user = await login(name); await expect(user.page.getByRole("heading", { name: "Acesso não autorizado" })).toBeVisible(); await user.context.close();
  }
  // Mesmo perfil passa a possuir ambas as capacidades, somente nas fixtures.
  const bothAssignment = (await db.query("select id from core.user_role_assignments where user_id=$1 and role_id=$2", [people.operations.id, people.global.role])).rows[0];
  if (bothAssignment) await db.query("update core.user_role_assignments set active=true where id=$1", [bothAssignment.id]);
  else await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type) values($1,$2,'global')", [people.operations.id, people.global.role]);
  const both = await login("operations"); await ready(both.page, "R$ 800,00");
  await both.page.getByRole("navigation", { name: "Vendas / Maquininhas", exact: true }).getByRole("link", { name: "Lançamentos", exact: true }).click();
  await expect(both.page.getByRole("heading", { name: "Vendas / Maquininhas", exact: true })).toBeVisible();
  await both.page.getByRole("button", { name: "Novo lançamento", exact: true }).click();
  const dialog = both.page.getByRole("dialog"); await dialog.getByLabel("Data", { exact: true }).fill("2042-09-03");
  await dialog.getByLabel("Unidade", { exact: false }).selectOption(A); await dialog.getByLabel("Valor (R$)", { exact: true }).fill("0,01");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click(); await expect(both.page.getByText("Lançamento cadastrado.", { exact: true })).toBeVisible();
  await both.page.getByRole("navigation", { name: "Vendas / Maquininhas", exact: true }).getByRole("link", { name: "Dashboard gerencial", exact: true }).click(); await ready(both.page, "R$ 800,01");
  const created = must(await rpc("operations", "entries_list", { p_unit: A, p_from: "2042-09-03", p_to: "2042-09-03" }))[0]; entries.push(created.id);
  const updated = must(await rpc("operations", "entry_update", { p_id: created.id, p_expected_version: created.version, p_date: "2042-09-03", p_unit: A, p_method: "Stone", p_amount: "0.02" }));
  await both.page.getByRole("button", { name: "Atualizar", exact: true }).click(); await ready(both.page, "R$ 800,02");
  must(await rpc("operations", "entry_delete", { p_id: updated.id, p_expected_version: updated.version }));
  await both.page.getByRole("button", { name: "Atualizar", exact: true }).click(); await ready(both.page, "R$ 800,00");
  // Reset não pressupõe banco inteiro vazio. Bloqueia a consulta fora da janela
  // sintética antes de atingir o PostgreSQL e verifica filtros/URL/estado descartado.
  await both.page.route("**/rpc/sales_dashboard", route => route.abort());
  const resetRequest = both.page.waitForRequest(r => r.url().endsWith("/rpc/sales_dashboard"));
  await both.page.getByRole("button", { name: "Redefinir", exact: true }).click();
  const resetPayload = (await resetRequest).postDataJSON();
  assert.equal(resetPayload.p_units, null); assert.equal(resetPayload.p_scope, "stone");
  assert.equal(new URL(both.page.url()).searchParams.has("unit"), false);
  await expect(both.page.getByRole("alert")).toBeVisible();
  await expect(both.page.getByText("Total financeiro do período", { exact: true })).toHaveCount(0);
  await expect(both.page.getByLabel("Escopo financeiro")).toHaveValue("stone"); await both.context.close();
  manifest.checks.push("375/768/1024/1440 sem overflow; teclado/foco e reduced-motion; acesso somente dashboard, somente operação, criador, ambas, negado e setor; dois escopos sem vazamento; revogação/inativação com JWT válido; troca de conta; criação UI e atualização pós-edição/exclusão.");
  manifest.outcome = "PASS";
  console.log("VEN-04B Auth/PostgREST + Playwright PASS", { tag, checks: manifest.checks, axe: manifest.axe });
} catch (error) {
  manifest.outcome = "FAIL"; manifest.failure = { name: error.name, code: error.code ?? null };
  if (lastPage && !lastPage.isClosed()) await lastPage.screenshot({ path: `${directory}/${tag}-failure.png`, fullPage: true });
  throw error;
} finally {
  const errors = [];
  await finishSalesLocal([
    () => browser?.close(),
    () => server?.close(),
    async () => {
      // Somente unidades sintéticas comprovadas; autoria deve pertencer ao recibo.
      const rows = (await db.query("select id,version,created_by from sales.entries where unit_id=any($1::uuid[]) and deleted_at is null", [[A, B]])).rows;
      for (const row of rows) {
        try {
          assert.ok(manifest.users.includes(row.created_by), "Autoria externa: preservar lançamento");
          if (!entries.includes(row.id)) entries.push(row.id);
          must(await rpc("operations", "entry_delete", { p_id: row.id, p_expected_version: row.version }));
        } catch (error) { errors.push(error); }
      }
    },
    async () => { for (const person of Object.values(people)) await person.client.auth.signOut(); },
    () => db.query("update core.profiles set active=false where id=any($1::uuid[])", [manifest.users]),
    () => db.query("update core.units set active=false where id=any($1::uuid[])", [[A, B]]),
    () => db.query("update core.sectors set active=false where id=$1", [sector.id]),
    async () => { manifest.roleCleanup = await retireSalesRoles(db, { roles: roleReceipts, users: usersProof, backupPath: `${directory}/${tag}-${randomUUID()}-roles-preserved.json` }); },
    async () => { manifest.unitCleanup = await retireSalesUnits(db, { units: [A, B, C].map((id, i) => ({ id, code: `${tag}-${["A", "B", "C"][i]}`, name: `${tag}-${["A", "B", "C"][i]}`, tag })), users: usersProof, statuses: statusesOwned, backupPath: `${directory}/${tag}-units-preserved.json` }); },
    async () => { assert.equal((await db.query("select count(*)::int n from core.units")).rows[0].n, local.before.units, "Unidades devem retornar à baseline"); },
    async () => {
      manifest.after = (await db.query("select (select count(*)::int from core.roles) roles,(select count(*)::int from sales.entries where deleted_at is null) active_entries")).rows[0];
      manifest.cleanup = manifest.roleCleanup && manifest.unitCleanup ? "Papéis e relações sintéticos removidos por UUID após dry-run; unidades e histórico estritamente sintético removidos após backup/dry-run; perfis/setor inativos e auditoria independente preservados." : "Teardown incompleto: preservar resíduos e consultar erros/recibos.";
      assert.equal(manifest.after.roles, local.before.roles, "Contagem de papéis deve retornar à baseline");
      manifest.cleanupErrors = errors.length; save();
    },
    () => local.close(),
  ], errors);
}
