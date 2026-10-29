import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "playwright/test";
import { salesLocalWeb } from "./sales-local-web.mjs";
import { SalesLocalDatabase } from "./sales-local.mjs";
import { retireSalesRoles, finishSalesLocal } from "./sales-role-cleanup.mjs";

// Opt-in e inspeção Docker impedem execução em outros destinos. Sem reset/seed geral.
assert.equal(process.env.VEN04A_LOCAL_TEST, "gaucha-gestao-local");
const local = await SalesLocalDatabase.open();
const db = local.client;
await db.query("rollback"); local.rollbackOnly = false;
const cli = process.env.VEN04A_SUPABASE_CLI;
assert.ok(cli, "Informe CLI local já instalado.");
const config = JSON.parse(execFileSync(cli, ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
assert.equal(config.API_URL, "http://127.0.0.1:54321");
assert.equal(new URL(config.DB_URL).hostname, "127.0.0.1");
assert.equal(new URL(config.DB_URL).port, "54322");
assert.ok((await db.query("select to_regprocedure('public.sales_operation_units(integer,integer)') f")).rows[0].f);
const tag = `VEN04A-${randomUUID().slice(0, 8)}`;
const A = randomUUID(), B = randomUUID(), C = randomUUID(), sector = randomUUID();
const people = {}, roles = [], entries = [];
const roleReceipts = [], usersProof = [];
const manifest = { tag, units: [A, B, C], sectors: [sector], roles, users: [], entries, checks: [], screenshots: [], before: local.before, cleanup: "Pendente" };
const directory = process.env.VEN04A_ARTIFACT_DIR ?? "/tmp/ven04a-ui";
mkdirSync(directory, { recursive: true, mode: 0o700 });
const save = () => writeFileSync(`${directory}/${tag}-manifest.json`, JSON.stringify({ ...manifest, roleReceipts, usersProof }, null, 2), { mode: 0o600 });
save();
let browser, server, lastPage;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
function must(response) { assert.equal(response.error, null, "RPC sintética local deve ser aceita."); return response.data; }
async function rpc(person, name, args = {}) { return people[person].client.schema("public").rpc(`sales_${name}`, args); }
const input = (date, unit = A, method = "Stone", amount = "0.29") => ({ p_date: date, p_unit: unit, p_method: method, p_amount: amount });
async function create(date, unit = A, method = "Stone", amount = "0.29") {
  const row = must(await rpc("operator", "entry_create", input(date, unit, method, amount))); entries.push(row.id); return row;
}
async function identity(name, actions, units, scope = "unit") {
  const role = randomUUID(), email = `${tag}-${name}@example.test`, password = `Synthetic-${randomUUID()}-aA1!`;
  const response = await fetch(config.API_URL + "/auth/v1/admin/users", {
    method: "POST", headers: { apikey: config.SERVICE_ROLE_KEY, Authorization: `Bearer ${config.SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: `${tag} ${name}` } }),
  });
  assert.equal(response.status, 200, "Auth sintético local");
  const { id } = await response.json(); manifest.users.push(id);
  usersProof.push({ id, email: email.toLowerCase(), displayName: `${tag} ${name}` });
  roleReceipts.push({ id: role, key: `${tag.toLowerCase()}-${name}` }); save();
  const client = createClient(config.API_URL, config.ANON_KEY, options);
  must(await client.auth.signInWithPassword({ email, password }));
  people[name] = { id, client, email, password };
  await db.query("insert into core.roles(id,key,name) values($1,$2,$3)", [role, `${tag.toLowerCase()}-${name}`, `${tag} ${name}`]); roles.push(role);
  for (const action of actions) await db.query("insert into core.role_permissions(role_id,permission_key) values($1,$2)", [role, `sales.entry.${action}`]);
  for (const unit of units) await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) values($1,$2,$3,$4,$5)", [id, role, scope, unit, scope === "sector" ? sector : null]);
}
async function login(name, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 960 }, locale: "pt-BR", reducedMotion: "reduce" });
  const page = await context.newPage(); lastPage = page;
  // Recusa destinos externos em vez de visitar um serviço fora do notebook.
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.goto("http://127.0.0.1:5173/sales");
  await page.getByLabel("E-mail", { exact: true }).fill(people[name].email);
  await page.getByLabel("Senha", { exact: true }).fill(people[name].password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  return { context, page };
}
async function apply(page, method = "", unit = "") {
  await page.getByLabel("Data inicial").fill("2040-01-01");
  await page.getByLabel("Data final").fill("2040-02-29");
  await page.getByLabel("Unidade", { exact: false }).selectOption(unit);
  await page.getByLabel("Forma de pagamento", { exact: false }).selectOption(method);
  const listed = page.waitForResponse(response => response.url().endsWith("/rpc/sales_entries_list")
    && response.request().postDataJSON()?.p_unit === (unit || null)
    && response.request().postDataJSON()?.p_method === (method || null));
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await listed;
  await expect(page.getByText("Carregando Vendas…", { exact: true })).toHaveCount(0);
}
async function fill(page, date, value, method = "Stone", unit = A) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Data", { exact: true }).fill(date);
  await dialog.getByLabel("Unidade", { exact: false }).selectOption(unit);
  await dialog.getByLabel("Forma de pagamento").selectOption(method);
  await dialog.getByLabel("Valor (R$)", { exact: true }).fill(value);
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
}
try {
  server = await salesLocalWeb(config);
  browser = await chromium.launch({ headless: true });
  await db.query("insert into core.units(id,code,name) values($1,$4,$4),($2,$5,$5),($3,$6,$6)", [A, B, C, `${tag}-A`, `${tag}-B`, `${tag}-C`]);
  await db.query("insert into core.sectors(id,code,name) values($1,$2,$2)", [sector, `${tag}-S`]);
  await db.query("insert into core.unit_sectors(unit_id,sector_id) values($1,$2)", [A, sector]);
  await identity("operator", ["read", "create", "edit", "delete"], [A, B, C]);
  await identity("creator", ["create"], [A]);
  await identity("reader", ["read"], [A, B]);
  await identity("editor", ["read", "edit"], [A, B]);
  await identity("deleter", ["read", "delete"], [A, B]);
  await identity("denied", [], []);
  await identity("sector", ["read", "create", "edit", "delete"], [A], "sector");
  const original = await create("2040-01-01", A, "Stone", "1250.30");
  const historical = await create("2040-01-02", B, "PIX", "0.01");
  const historicalTransfer = await create("2040-01-06", B, "Stone", "0.29");
  await create("2040-01-03", C, "Stone", "999999999999.99");
  await db.query("update core.units set active=false where id=$1", [B]);
  assert.equal((await rpc("creator", "entries_list")).error?.code, "42501");
  assert.equal((await rpc("creator", "dashboard", { p_from: "2040-01-01", p_to: "2040-01-01" })).error?.code, "42501");
  assert.equal(must(await rpc("creator", "operation_units"))[0].can_read, false);
  for (const name of ["denied", "sector"]) assert.equal((await rpc(name, "operation_units")).error?.code, "42501");
  assert.equal((await rpc("reader", "entries_list", { p_unit: C })).error?.code, "42501");
  assert.equal((await rpc("operator", "entry_create", input("2040-01-01"))).error?.code, "23505");
  assert.equal((await rpc("operator", "entry_create", input("2040-01-03", B))).error?.code, "23514");
  assert.equal((await rpc("editor", "entry_update", { p_id: original.id, p_expected_version: 1, ...input("2040-01-01", C) })).error?.code, "42501");
  assert.equal((await rpc("editor", "entry_update", { p_id: original.id, p_expected_version: 1, ...input("2040-01-01", B) })).error?.code, "23514");
  for (const value of ["0", "1.001", "-1"]) assert.equal((await rpc("creator", "entry_create", input("2040-01-04", A, "PIX", value))).error?.code, "23514");
  manifest.checks.push("Auth/PostgREST: login, criação isolada, setor/sem papel negados, unidade indevida, duplicidade, inativa, transferência e valores inválidos.");

  // Apenas chaves públicas no processo Vite; nenhuma credencial administrativa é injetada.

  const creator = await login("creator");
  const requests = [];
  creator.page.on("request", request => { if (request.url().includes("/rest/v1/rpc/")) requests.push(new URL(request.url()).pathname); });
  await expect(creator.page.getByText("Seu acesso não inclui consulta", { exact: false })).toBeVisible();
  await creator.page.getByRole("button", { name: "Novo lançamento", exact: true }).click();
  await fill(creator.page, "2040-01-04", "0,01", "PIX");
  await expect(creator.page.getByText("Lançamento cadastrado.", { exact: true })).toBeVisible();
  assert.equal(requests.some(url => /sales_entries_list|sales_entry_detail|sales_dashboard/.test(url)), false);
  const created = must(await rpc("operator", "entries_list", { p_unit: A, p_from: "2040-01-04", p_to: "2040-01-04" }))[0];
  entries.push(created.id); assert.equal(created.amount, "0.01"); assert.equal(created.created_by, people.creator.id);
  await creator.page.getByRole("button", { name: "Novo lançamento", exact: true }).click();
  await fill(creator.page, "2040-01-08", "1.250,30", "Stone");
  await expect(creator.page.getByText("Lançamento cadastrado.", { exact: true })).toBeVisible();
  const createdStone = must(await rpc("operator", "entries_list", { p_unit: A, p_from: "2040-01-08", p_to: "2040-01-08" }))[0];
  entries.push(createdStone.id); assert.equal(createdStone.amount, "1250.30");
  assert.equal(requests.some(url => /sales_entries_list|sales_entry_detail|sales_dashboard/.test(url)), false);
  await creator.context.close();
  const reader = await login("reader");
  await expect(reader.page.getByRole("heading", { name: "Vendas / Maquininhas", exact: true })).toBeVisible();
  await apply(reader.page);
  await expect(reader.page.getByRole("row").filter({ has: reader.page.getByRole("cell", { name: "01/01/2040", exact: true }) }).getByRole("cell", { name: "R$ 1.250,30", exact: true })).toBeVisible();
  assert.equal(await reader.page.getByRole("button", { name: "Novo lançamento", exact: true }).count(), 0);
  assert.equal(await reader.page.getByRole("button", { name: /^Editar / }).count(), 0);
  await apply(reader.page, "PIX", B);
  await expect(reader.page.getByRole("cell", { name: "R$ 0,01", exact: true })).toBeVisible();
  await reader.context.close();
  const editor = await login("editor");
  await apply(editor.page, "Stone", A);
  await editor.page.getByRole("button", { name: "Editar 01/01/2040 Stone" }).click();
  // Colega muda a versão entre a abertura e o salvamento do formulário.
  const concurrent = must(await rpc("operator", "entry_update", { p_id: original.id, p_expected_version: 1, ...input("2040-01-01", A, "Stone", "9.99") }));
  await fill(editor.page, "2040-01-05", "1.000.000,99", "PIX");
  await expect(editor.page.getByText("O lançamento mudou.", { exact: false })).toBeVisible();
  await expect(editor.page.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
  await editor.page.getByRole("button", { name: "Consultar versão atual" }).click();
  await expect(editor.page.getByText("Versão atual 2:", { exact: false })).toBeVisible();
  await expect(editor.page.getByRole("dialog").getByLabel("Valor (R$)", { exact: true })).toHaveValue("1.000.000,99");
  await editor.page.getByRole("button", { name: "Usar versão atual e manter campos" }).click();
  await editor.page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(editor.page.getByText("Lançamento atualizado.", { exact: true })).toBeVisible();
  const updated = must(await rpc("operator", "entry_detail", { p_id: original.id }));
  assert.equal(updated.version, concurrent.version + 1); assert.equal(updated.amount, "1000000.99"); assert.equal(updated.updated_by, people.editor.id);
  await apply(editor.page, "PIX", B);
  await editor.page.getByRole("button", { name: "Editar 02/01/2040 PIX" }).click();
  await fill(editor.page, "2040-01-02", "0,29", "PIX", B);
  await expect(editor.page.getByText("Lançamento atualizado.", { exact: true })).toBeVisible();
  await apply(editor.page, "Stone", B);
  await editor.page.getByRole("button", { name: "Editar 06/01/2040 Stone" }).click();
  await fill(editor.page, "2040-01-07", "0,29", "PIX", A);
  await expect(editor.page.getByText("Lançamento atualizado.", { exact: true })).toBeVisible();
  const transferred = must(await rpc("operator", "entry_detail", { p_id: historicalTransfer.id }));
  assert.equal(transferred.unit_id, A); assert.equal(transferred.payment_method, "PIX");
  const transferAudit = (await db.query("select unit_id from core.system_audit_log where module='sales' and entity_id=$1 and action='entry.edit'", [historicalTransfer.id])).rows[0];
  assert.equal(transferAudit.unit_id, null);
  await editor.context.close();
  const deleter = await login("deleter");
  await apply(deleter.page, "PIX", B);
  await deleter.page.getByRole("button", { name: "Excluir 02/01/2040 PIX" }).click();
  assert.equal(await deleter.page.getByRole("dialog").getByRole("textbox").count(), 0);
  await deleter.page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await deleter.page.getByRole("button", { name: "Excluir 02/01/2040 PIX" }).click();
  await deleter.page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(deleter.page.getByText("Lançamento excluído.", { exact: true })).toBeVisible();
  await expect(deleter.page.getByText("Nenhum lançamento encontrado", { exact: true })).toBeVisible();
  assert.ok((await db.query("select deleted_at,deleted_by from sales.entries where id=$1", [historical.id])).rows[0].deleted_at);
  await deleter.context.close();
  manifest.checks.push("Navegador real: criador sem consulta, leitor sem escrita, PIX histórico inativo, edição por colega, conflito com preservação/aceite explícito e exclusão por colega sem motivo.");

  const operator = await login("operator");
  await apply(operator.page);
  for (const width of [375, 768, 1024, 1440]) {
    await operator.page.setViewportSize({ width, height: 960 });
    await expect(operator.page.getByRole("heading", { name: "Vendas / Maquininhas", exact: true })).toBeVisible();
    const overflow = await operator.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `Sem overflow da página em ${width}px`);
    const table = operator.page.getByRole("region", { name: "Tabela de registros", exact: true });
    await table.focus(); await operator.page.keyboard.press("End");
    await table.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    const action = operator.page.getByRole("button", { name: "Excluir 05/01/2040 PIX" });
    await expect(action).toBeInViewport();
    await table.evaluate(el => { el.scrollLeft = 0; });
    await operator.page.getByRole("heading", { name: "Vendas / Maquininhas", exact: true }).click();
    await operator.page.evaluate(() => window.scrollTo(0, 0));
    const screenshot = `${directory}/${tag}-${width}.png`;
    await operator.page.screenshot({ path: screenshot, fullPage: true }); manifest.screenshots.push(screenshot);
    await operator.page.getByRole("button", { name: "Novo lançamento", exact: true }).focus(); await operator.page.keyboard.press("Enter");
    const dialog = operator.page.getByRole("dialog"); await expect(dialog).toBeVisible();
    assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
    await operator.page.screenshot({ path: `${directory}/${tag}-${width}-form.png`, fullPage: true });
    for (let i = 0; i < 9; i++) { await operator.page.keyboard.press("Tab"); assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true); }
    await operator.page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  }
  // Paginação real: 26 entradas + as anteriores; nenhum total presumido.
  for (let day = 1; day <= 26; day++) await create(`2040-02-${String(day).padStart(2, "0")}`, A, "Stone", "0.10");
  await operator.page.getByRole("button", { name: "Atualizar consulta" }).click();
  await expect(operator.page.getByRole("button", { name: "Próxima", exact: true })).toBeEnabled();
  await operator.page.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(operator.page.getByText(/Página 2 ·/)).toBeVisible();
  await operator.context.close();
  for (const name of ["denied", "sector"]) {
    const denied = await login(name); await expect(denied.page.getByRole("heading", { name: "Acesso não autorizado" })).toBeVisible();
    assert.equal(await denied.page.getByRole("link", { name: "Vendas / Maquininhas", exact: true }).count(), 0); await denied.context.close();
  }
  await db.query("update core.user_role_assignments set active=false where user_id=$1", [people.reader.id]);
  assert.equal((await rpc("reader", "entries_list")).error?.code, "42501");
  await db.query("update core.profiles set active=false where id=$1", [people.editor.id]);
  assert.equal((await rpc("editor", "operation_units")).error?.code, "42501");
  const audit = (await db.query("select action,actor_user_id,before_data->>'amount' before_amount,after_data->>'amount' after_amount from core.system_audit_log where module='sales' and entity_id=$1 order by occurred_at,id", [original.id])).rows;
  assert.equal(audit[0].action, "entry.create"); assert.equal(audit.at(-1).actor_user_id, people.editor.id); assert.equal(audit.at(-1).after_amount, "1000000.99");
  manifest.checks.push("375/768/1024/1440: sem overflow da página, tabela rolável com ações visíveis, teclado/foco confinado/Escape/reduced-motion; paginação real; negados/setoriais; revogação/perfil inativo com JWT válido; auditoria financeira exata.");
  console.log("VEN-04A Auth/PostgREST + Playwright PASS", { tag, checks: manifest.checks });
} catch (error) {
  if (lastPage && !lastPage.isClosed()) {
    await lastPage.screenshot({ path: `${directory}/${tag}-failure.png`, fullPage: true });
    console.log("Estado da falha", await lastPage.locator("main").innerText());
  }
  throw error;
} finally {
  const errors = [];
  await finishSalesLocal([
    () => browser?.close(),
    () => server?.close(),
    async () => {
      // Somente unidades sintéticas comprovadas; autoria deve pertencer ao recibo.
      const rows = (await db.query("select id,version,created_by from sales.entries where unit_id=any($1::uuid[]) and deleted_at is null", [[A, B, C]])).rows;
      for (const row of rows) {
        try {
          assert.ok(manifest.users.includes(row.created_by), "Autoria externa: preservar lançamento");
          if (!entries.includes(row.id)) entries.push(row.id);
          must(await rpc("operator", "entry_delete", { p_id: row.id, p_expected_version: row.version }));
        } catch (error) { errors.push(error); }
      }
    },
    async () => { for (const person of Object.values(people)) await person.client.auth.signOut(); },
    () => db.query("update core.profiles set active=false where id=any($1::uuid[])", [manifest.users]),
    () => db.query("update core.units set active=false where id=any($1::uuid[])", [[A, B, C]]),
    () => db.query("update core.sectors set active=false where id=$1", [sector]),
    async () => { manifest.roleCleanup = await retireSalesRoles(db, { roles: roleReceipts, users: usersProof, backupPath: `${directory}/${tag}-${randomUUID()}-roles-preserved.json` }); },
    async () => {
      manifest.after = (await db.query("select (select count(*)::int from core.roles) roles,(select count(*)::int from sales.entries where deleted_at is null) active_entries")).rows[0];
      manifest.cleanup = manifest.roleCleanup ? "Papéis e relações sintéticos removidos por UUID após dry-run; perfis/unidades/setor inativos; lançamentos soft-deleted e auditoria preservados." : "Teardown incompleto: preservar resíduos e consultar erros/recibos.";
      assert.equal(manifest.after.roles, local.before.roles, "Contagem de papéis deve retornar à baseline");
      manifest.cleanupErrors = errors.length; save();
    },
    () => local.close(),
  ], errors);
}
