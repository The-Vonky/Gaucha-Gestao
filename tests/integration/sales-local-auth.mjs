import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SalesLocalDatabase } from "./sales-local.mjs";

// Notebook autorizado, sem importar cenários descartáveis/destrutivos do CI.
const local = await SalesLocalDatabase.open();
const db = local.client;
await db.query("rollback");
local.rollbackOnly = false;
const cli = process.env.VEN03_SUPABASE_CLI;
assert.ok(cli, "Informe o caminho do CLI já instalado");
const config = JSON.parse(execFileSync(cli, ["status", "-o", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
}));
assert.equal(config.API_URL, "http://127.0.0.1:54321");
assert.equal(new URL(config.DB_URL).hostname, "127.0.0.1");
assert.equal(new URL(config.DB_URL).port, "54322");
const tag = `VEN03-${randomUUID().slice(0, 8)}`;
const A = randomUUID(), B = randomUUID(), operatorRole = randomUUID(), readerRole = randomUUID();
const identities = [], entries = [];
const manifest = { tag, units: [A, B], roles: [operatorRole, readerRole], users: [], entries: [],
  cleanup: "Lançamentos sintéticos excluídos logicamente via VEN-02; usuários/unidades/papéis desativados; auditoria preservada." };
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
let operator;
function must(result, message) { assert.equal(result.error, null, message); return result.data; }
async function auth(name) {
  const email = `${tag}-${name}@example.test`, password = `Synthetic-${randomUUID()}-aA1!`;
  const response = await fetch(config.API_URL + "/auth/v1/admin/users", {
    method: "POST", headers: { apikey: config.SERVICE_ROLE_KEY, Authorization: `Bearer ${config.SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { display_name: `${tag} ${name}` } }),
  });
  assert.equal(response.status, 200, "Criação de identidade exclusivamente sintética local");
  const { id } = await response.json();
  identities.push(id); manifest.users.push(id);
  const client = createClient(config.API_URL, config.ANON_KEY, opts);
  must(await client.auth.signInWithPassword({ email, password }), "Auth local com senha sintética");
  return { id, client };
}
const dashboard = (client, units = [A], scope = "stone") => client.schema("public").rpc("sales_dashboard", {
  p_from: "2026-09-01", p_to: "2026-09-01", p_units: units, p_scope: scope,
});
try {
  await db.query("insert into core.units(id,code,name) values($1,$3,$3),($2,$4,$4)", [A, B, `${tag}-A`, `${tag}-B`]);
  await db.query("insert into core.roles(id,key,name) values($1,$3,$3),($2,$4,$4)", [operatorRole, readerRole, `${tag.toLowerCase()}-op`, `${tag.toLowerCase()}-read`]);
  await db.query(`insert into core.role_permissions(role_id,permission_key)
    select $1,key from core.permissions where key in ('sales.dashboard.read','sales.entry.create','sales.entry.edit','sales.entry.delete');
    `, [operatorRole]);
  await db.query("insert into core.role_permissions(role_id,permission_key) values($1,'sales.dashboard.read')", [readerRole]);
  operator = await auth("global"); const reader = await auth("reader"); const denied = await auth("denied");
  await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type) values($1,$2,'global')", [operator.id, operatorRole]);
  await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id) values($1,$2,'unit',$3)", [reader.id, readerRole, A]);
  for (const [date, unit, method, amount] of [
    ["2026-09-01", A, "Stone", "100.00"], ["2026-09-02", A, "Stone", "150.00"],
    ["2026-09-01", A, "PIX", "20.00"], ["2026-09-02", A, "PIX", "30.00"], ["2026-09-20", B, "Stone", "999.99"],
  ]) {
    const row = must(await operator.client.schema("public").rpc("sales_entry_create", { p_date: date, p_unit: unit, p_method: method, p_amount: amount }), "RPC VEN-02 real");
    entries.push(row); manifest.entries.push(row.id);
  }
  const global = must(await dashboard(operator.client), "Leitura global real");
  assert.equal(global.summary.total, "250.00");
  const stone = must(await dashboard(reader.client), "Leitura restrita real");
  assert.equal(stone.summary.total, "250.00");
  assert.equal(stone.months[0].partial, null);
  assert.equal(stone.months[0].status_basis, "historical_unavailable");
  assert.equal(stone.months[0].projection, null);
  assert.equal(stone.months[0].last_day_with_data, 2);
  assert.equal(JSON.stringify(stone).includes(B), false);
  assert.equal(must(await dashboard(reader.client, [A], "combined"), "Stone+PIX real").summary.total, "300.00");
  const before = await dashboard(reader.client);
  const extra = must(await operator.client.schema("public").rpc("sales_entry_create", { p_date: "2026-09-25", p_unit: B, p_method: "PIX", p_amount: "0.29" }), "Mutação em outra unidade");
  entries.push(extra); manifest.entries.push(extra.id);
  assert.deepEqual(await dashboard(reader.client), before, "Não interferência via PostgREST");
  for (const result of [await dashboard(createClient(config.API_URL, config.ANON_KEY, opts)), await dashboard(denied.client), await dashboard(reader.client, [B])])
    assert.equal(result.error?.code, "42501");
  const raw = await reader.client.schema("sales").from("entries").select("id");
  assert.ok(raw.error, "Tabelas privadas inacessíveis pelo PostgREST");
  await db.query("update core.user_role_assignments set active=false where user_id=$1", [reader.id]);
  assert.equal((await dashboard(reader.client)).error?.code, "42501", "Revogação com JWT ainda válido");
  await db.query("update core.user_role_assignments set active=true where user_id=$1", [reader.id]);
  await db.query("update core.profiles set active=false where id=$1", [reader.id]);
  assert.equal((await dashboard(reader.client)).error?.code, "42501", "Perfil inativo com JWT ainda válido");
  console.log("VEN-03 Auth/PostgREST PASS: login real, Stone/combined, status restrito, isolamento, anonimato, sem capacidade, revogação, perfil inativo e schemas privados.");
} finally {
  // Somente UUIDs criados nesta execução. Nenhuma exclusão física ou limpeza geral.
  for (const e of entries) must(await operator.client.schema("public").rpc("sales_entry_delete", { p_id: e.id, p_expected_version: e.version }), "Exclusão lógica do lançamento sintético");
  await db.query("update core.profiles set active=false where id=any($1::uuid[])", [identities]);
  await db.query("update core.units set active=false where id=any($1::uuid[])", [[A, B]]);
  await db.query("update core.roles set active=false where id=any($1::uuid[])", [[operatorRole, readerRole]]);
  writeFileSync(`/tmp/${tag}-auth-manifest.json`, JSON.stringify(manifest, null, 2));
  writeFileSync("/tmp/ven03-auth-manifest.json", JSON.stringify(manifest, null, 2));
  await local.close();
  console.log("VEN-03 Auth local: dados sintéticos inativados e lançamentos excluídos logicamente; manifesto sem credenciais em /tmp/ven03-auth-manifest.json.");
}
