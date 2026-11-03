// MEL-01: navegador/Auth/PostgREST reais com catálogo inicialmente vazio.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "playwright/test";
import { SalesLocalDatabase } from "./sales-local.mjs";
import { salesLocalWeb } from "./sales-local-web.mjs";
import { retireSalesUnits } from "./sales-unit-cleanup.mjs";
import { finishSalesLocal } from "./sales-role-cleanup.mjs";

const local = await SalesLocalDatabase.open(), db = local.client;
await db.query("rollback"); local.rollbackOnly = false;
assert.equal(local.before.units, 0, "Não alterar catálogo existente para simular estado vazio");
const config = JSON.parse(execFileSync(process.env.VEN04B_SUPABASE_CLI, ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
assert.equal(config.API_URL, "http://127.0.0.1:54321");
const person = (await db.query(`select p.id,p.active,p.display_name,u.email from core.profiles p join auth.users u on u.id=p.id
  where p.display_name='VEN04A-8b441b99 denied'`)).rows[0];
assert.ok(person && !person.active); assert.equal(person.email, "ven04a-8b441b99-denied@example.test");
assert.equal((await db.query("select 1 from core.user_role_assignments where user_id=$1", [person.id])).rowCount, 0);
const tag = `VEN04B-${randomUUID().slice(0, 8)}`, code = `${tag}-A`, assignment = randomUUID();
const directory = `tmp/mel01-empty-${tag}`;
mkdirSync(directory, { recursive: true, mode: 0o700 });
const manifest = { tag, code, assignment, units: [], before: local.before, checks: [], cleanup: "Pendente" };
const save = () => writeFileSync(`${directory}/manifest.json`, JSON.stringify(manifest, null, 2), { mode: 0o600 });
save();
const client = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const password = `Synthetic-${randomUUID()}-aA1!`;
let browser, server;
const clean = async () => {
  if (manifest.unitCleanup) return;
  // Também recupera falha entre POST e recibo da resposta; igualdade exata + autor.
  const units = (await db.query("select id,code,name from core.units where code=$1 and created_by=$2", [code, person.id])).rows;
  assert.ok(units.length <= 1);
  manifest.unitCleanup = await retireSalesUnits(db, { units: units.map(u => ({ ...u, tag })),
    users: [{ id: person.id, email: person.email, displayName: person.display_name }], backupPath: `${directory}/units-preserved.json` });
  save();
};
try {
  server = await salesLocalWeb(config); browser = await chromium.launch({ headless: true });
  const response = await fetch(`${config.API_URL}/auth/v1/admin/users/${person.id}`, { method: "PUT", headers: { apikey: config.SERVICE_ROLE_KEY, Authorization: `Bearer ${config.SERVICE_ROLE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
  assert.equal(response.status, 200);
  await db.query("update core.profiles set active=true where id=$1", [person.id]);
  await db.query(`insert into core.user_role_assignments(id,user_id,role_id,scope_type)
    select $1,$2,id,'global' from core.roles where key='platform_administrator' and system and active`, [assignment, person.id]);
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: "pt-BR" });
  await context.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5173/admin/units");
  await page.getByLabel("E-mail", { exact: true }).fill(person.email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Nenhuma unidade encontrada", { exact: true })).toBeVisible();
  await page.getByLabel("Exibir inativas").check();
  await expect(page.getByText("Ainda não há unidades cadastradas.", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${directory}/units-empty.png`, fullPage: true });
  await page.goto("http://127.0.0.1:5173/sales/entries");
  await expect(page.getByText("Nenhum lançamento encontrado", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Novo lançamento", exact: true })).toBeDisabled();
  await page.goto("http://127.0.0.1:5173/sales/dashboard");
  await expect(page.getByText("Sem movimento no período", { exact: true })).toBeVisible();
  await page.goto("http://127.0.0.1:5173/admin/units");
  await page.getByRole("button", { name: "Nova unidade", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Código", { exact: true }).fill(code);
  await dialog.getByLabel("Nome", { exact: true }).fill(code);
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  const list = page.getByRole("list", { name: "Unidades", exact: true });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  const created = (await db.query("select id from core.units where code=$1 and created_by=$2", [code, person.id])).rows;
  assert.equal(created.length, 1); manifest.units = created.map(u => u.id); save();
  await clean();
  await page.reload();
  await expect(page.getByText("Nenhuma unidade encontrada", { exact: true })).toBeVisible();
  await page.getByLabel("Exibir inativas").check();
  await expect(page.getByText("Ainda não há unidades cadastradas.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nova unidade", exact: true })).toBeVisible();
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveCount(0);
  manifest.checks.push("Administração vazia incluindo inativas; Nova unidade e INSERT real; reload autenticado após limpeza; Vendas operacional e dashboard vazios sem fixtures permanentes");
  await page.screenshot({ path: `${directory}/units-final.png`, fullPage: true });
  console.log("MEL-01 Auth/PostgREST/Chromium: estado vazio e cadastro PASS");
} finally {
  await finishSalesLocal([
    clean, () => browser?.close(), () => server?.close(), () => client.auth.signOut(),
    () => db.query("update core.profiles set active=false where id=$1", [person.id]),
    () => db.query("delete from core.user_role_assignments where id=$1 and user_id=$2 and granted_by is null", [assignment, person.id]),
    async () => { assert.equal((await db.query("select count(*)::int n from core.units")).rows[0].n, 0); manifest.cleanup = "Unidade temporária removida; perfil inativo; atribuição temporária removida"; save(); },
    () => local.close(),
  ]);
}
