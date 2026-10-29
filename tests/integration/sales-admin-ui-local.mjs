// Login Auth real de identidade sintética com o papel protegido existente.
// A conta do titular é verificada separadamente em SQL/manual; sua senha não é lida.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "playwright/test";
import { salesLocalWeb } from "./sales-local-web.mjs";
import { SalesLocalDatabase } from "./sales-local.mjs";
import { finishSalesLocal } from "./sales-role-cleanup.mjs";

assert.equal(process.env.VEN04B_LOCAL_TEST, "gaucha-gestao-local");
const local = await SalesLocalDatabase.open(), db = local.client;
await db.query("rollback"); local.rollbackOnly = false;
const config = JSON.parse(execFileSync(process.env.VEN04B_SUPABASE_CLI, ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
assert.equal(config.API_URL, "http://127.0.0.1:54321");
assert.equal(new URL(config.DB_URL).hostname, "127.0.0.1"); assert.equal(new URL(config.DB_URL).port, "54322");
const reuse = "VEN04A-8b441b99", directory = "tmp/ven04b-correction";
mkdirSync(directory, { recursive: true, mode: 0o700 });
const person = (await db.query(`select p.id,p.active,u.email from core.profiles p join auth.users u on u.id=p.id
  where p.display_name=$1`, [`${reuse} denied`])).rows[0];
assert.ok(person && !person.active); assert.equal(person.email, `${reuse}-denied@example.test`.toLowerCase());
assert.equal((await db.query("select 1 from core.user_role_assignments where user_id=$1", [person.id])).rowCount, 0);
const units = (await db.query("select id,active from core.units where code=any($1::text[]) order by code", [[`${reuse}-A`, `${reuse}-B`]])).rows;
assert.equal(units.length, 2); assert.ok(units.every(u => !u.active));
const [A, B] = units.map(u => u.id), assignment = randomUUID(), entries = [];
assert.equal((await db.query("select count(*)::int n from sales.entries where unit_id=any($1::uuid[]) and deleted_at is null", [[A, B]])).rows[0].n, 0, "Fixture reutilizada contém lançamento ativo: preservar");
const role = (await db.query("select id from core.roles where key='platform_administrator' and system and active")).rows[0];
const manifest = { user: person.id, assignment, role: role.id, units: [A, B], entries, before: local.before, checks: [], cleanup: "Pendente" };
const save = () => writeFileSync(`${directory}/admin-ui-${assignment}-manifest.json`, JSON.stringify(manifest, null, 2), { mode: 0o600 });
save();
const password = `Synthetic-${randomUUID()}-aA1!`;
const client = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let browser, server;
function must(r) { assert.equal(r.error, null); return r.data; }
const rpc = (name, args = {}) => client.rpc(`sales_${name}`, args);
try {
  server = await salesLocalWeb(config);
  browser = await chromium.launch({ headless: true });
  const response = await fetch(`${config.API_URL}/auth/v1/admin/users/${person.id}`, { method: "PUT", headers: { apikey: config.SERVICE_ROLE_KEY, Authorization: `Bearer ${config.SERVICE_ROLE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
  assert.equal(response.status, 200);
  await db.query("update core.profiles set active=true where id=$1", [person.id]);
  await db.query("update core.units set active=true where id=any($1::uuid[])", [[A, B]]);
  await db.query("insert into core.user_role_assignments(id,user_id,role_id,scope_type) values($1,$2,$3,'global')", [assignment, person.id, role.id]);
  must(await client.auth.signInWithPassword({ email: person.email, password }));
  const access = must(await client.schema("core").rpc("my_access"));
  assert.equal(access.filter(a => a.permission.startsWith("sales.")).length, 7);
  assert.ok(!access.some(a => a.permission === "room_booking.manage"));

  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "pt-BR" });
  await context.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage();
  const url = `http://127.0.0.1:5173/sales?from=2044-01-01&to=2044-01-31&unit=${A}`;
  await page.goto(url);
  await page.getByLabel("E-mail", { exact: true }).fill(person.email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Vendas / Maquininhas", exact: true })).toBeVisible();
  await expect(page.getByText("Comercial", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Novo lançamento", exact: true }).click();
  const fill = async value => {
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Data", { exact: true }).fill("2044-01-01");
    await dialog.getByLabel("Unidade", { exact: false }).selectOption(A);
    await dialog.getByLabel("Forma de pagamento").selectOption("Stone");
    await dialog.getByLabel("Valor (R$)", { exact: true }).fill(value);
    await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  };
  await fill("0,01"); await expect(page.getByText("Lançamento cadastrado.", { exact: true })).toBeVisible();
  const row = must(await rpc("entries_list", { p_unit: A, p_from: "2044-01-01", p_to: "2044-01-01" }))[0]; entries.push(row.id); save();
  await page.getByRole("button", { name: "Editar 01/01/2044 Stone", exact: true }).click();
  await fill("0,02"); await expect(page.getByText("Lançamento atualizado.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Excluir 01/01/2044 Stone", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByText("Lançamento excluído.", { exact: true })).toBeVisible();
  await page.goto("http://127.0.0.1:5173/sales/dashboard?from=2044-01&to=2044-01");
  await expect(page.getByRole("heading", { name: "Dashboard gerencial", exact: true })).toBeVisible();
  await expect(page.getByText("Carregando dashboard…", { exact: true })).toHaveCount(0);
  await page.goto("http://127.0.0.1:5173/admin/roles");
  const list = page.getByRole("list", { name: "Perfis de acesso", exact: true });
  await expect(list.getByRole("listitem")).toHaveCount(9);
  for (const name of ["Sales Manager", "Sales Operator"]) {
    await expect(list.getByRole("button", { name: `Consultar ${name}`, exact: true })).toBeVisible();
    await expect(list.getByRole("button", { name: `Editar ${name}`, exact: true })).toHaveCount(0);
  }
  assert.equal(/VEN0[34]|ven03-/i.test(await list.innerText()), false);
  manifest.checks.push("Auth/login UI sintético com Platform Administrator: Comercial, /sales, cadastro/edição/exclusão UI, /sales/dashboard; my_access global, D5-B sem manage; /admin/roles com 9 institucionais, Sales Manager/Operator protegidos.");
  await context.close();
  console.log("Platform Administrator Auth/Playwright PASS");
} finally {
  const errors = [];
  await finishSalesLocal([
    () => browser?.close(), () => server?.close(),
    async () => {
      const rows = (await db.query("select id,version from sales.entries where unit_id=any($1::uuid[]) and created_by=$2 and sale_date='2044-01-01' and deleted_at is null", [[A, B], person.id])).rows;
      for (const row of rows) must(await rpc("entry_delete", { p_id: row.id, p_expected_version: row.version }));
    },
    () => client.auth.signOut(),
    () => db.query("update core.profiles set active=false where id=$1", [person.id]),
    // Remove somente a atribuição sintética cujo UUID foi registrado ANTES do INSERT.
    () => db.query("delete from core.user_role_assignments where id=$1 and user_id=$2 and role_id=$3 and granted_by is null", [assignment, person.id, role.id]),
    () => db.query("update core.units set active=false where id=any($1::uuid[])", [[A, B]]),
    async () => { manifest.cleanup = "Atribuição temporária removida; perfil/unidades sintéticos inativos; histórico e auditoria preservados."; manifest.cleanupErrors = errors.length; save(); },
    () => local.close(),
  ], errors);
}
