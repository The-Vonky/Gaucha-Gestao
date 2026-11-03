// Aplicação incremental e prova SQL da conta existente, exclusivamente no notebook.
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { SalesLocalDatabase } from "./sales-local.mjs";

assert.equal(process.env.VEN04B_LOCAL_TEST, "gaucha-gestao-local");
const version = "20261029180613", name = "sales_institutional_roles";
const sql = readFileSync(`supabase/migrations/${version}_${name}.sql`, "utf8");
const directory = "tmp/ven04b-correction";
mkdirSync(directory, { recursive: true, mode: 0o700 });
const local = await SalesLocalDatabase.open(), db = local.client;
await db.query("rollback"); local.rollbackOnly = false;
const email = process.env.VEN04B_ADMIN_EMAIL;
assert.ok(email, "Informe somente o email da conta administrativa indicada; nunca sua senha.");
const admin = (await db.query(`select p.id,p.active profile_active,r.system,r.active role_active,
  a.active assignment_active,a.scope_type from auth.users u join core.profiles p on p.id=u.id
  join core.user_role_assignments a on a.user_id=p.id join core.roles r on r.id=a.role_id
  where u.email=$1 and r.key='platform_administrator'`, [email])).rows;
assert.equal(admin.length, 1);
assert.ok(admin[0].profile_active && admin[0].system && admin[0].role_active && admin[0].assignment_active && admin[0].scope_type === "global");
try {
  if (process.argv[2] === "apply") {
    assert.equal(local.before.migrations, 27, "Histórico mudou: diagnosticar antes da aplicação");
    assert.equal((await db.query("select 1 from supabase_migrations.schema_migrations where version=$1", [version])).rowCount, 0);
    const assignments = (await db.query("select id from core.user_role_assignments order by id")).rows;
    const permissions = (await db.query(`select r.key,rp.permission_key from core.roles r
      join core.role_permissions rp on rp.role_id=r.id order by r.key,rp.permission_key`)).rows;
    writeFileSync(`${directory}/institutional-before.json`, JSON.stringify({ permissions, assignmentCount: assignments.length }, null, 2), { mode: 0o600, flag: "wx" });
    await db.query("begin");
    try {
      await db.query(sql.replace(/^begin;$/m, "").replace(/^commit;$/m, ""));
      await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)", [version, name, [sql]]);
      assert.deepEqual((await db.query("select id from core.user_role_assignments order by id")).rows, assignments, "Nenhuma atribuição automática");
      assert.deepEqual((await db.query(`select r.key,rp.permission_key from core.roles r join core.role_permissions rp on rp.role_id=r.id
        where r.key not in ('sales_manager','sales_operator') and not (r.key='platform_administrator' and rp.permission_key like 'sales.%')
        order by r.key,rp.permission_key`)).rows, permissions, "Outros módulos preservados");
      await db.query("commit");
    } catch (error) { await db.query("rollback"); throw error; }
  } else assert.equal(process.argv[2], "verify");
  const result = { actualAccount: "Perfil ativo e atribuição administrativa global ativa confirmados; UUID/email não publicados.", sql: [], authLogin: "Pendente de login manual do titular; SET LOCAL não comprova login Auth." };
  await db.query("begin");
  try {
    const A = randomUUID(), B = randomUUID();
    await db.query("insert into core.units(id,code,name) values($1,$3,$3),($2,$4,$4)", [A, B, `VEN04B-CHECK-${A.slice(0, 8)}`, `VEN04B-CHECK-${B.slice(0, 8)}`]);
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [admin[0].id]);
    const access = (await db.query("select * from core.my_access() where permission like 'sales.%' order by permission")).rows;
    assert.equal(access.length, 7); assert.ok(access.every(a => a.scope_type === "global" && a.unit_id === null && a.sector_id === null));
    assert.equal((await db.query("select private.has_global_permission('room_booking.manage') allowed")).rows[0].allowed, false);
    const rpc = async (call, params) => (await db.query(`select public.sales_${call} result`, params)).rows[0].result;
    const a = await rpc("entry_create($1,$2,'Stone','0.01')", ["2043-01-01", A]);
    await rpc("entry_create($1,$2,'PIX','0.03')", ["2043-01-01", B]);
    assert.equal((await rpc("entry_detail($1)", [a.id])).amount, "0.01");
    assert.equal((await rpc("entries_list(null,null,$1)", [A])).length, 1);
    const edited = await rpc("entry_update($1,$2,$3,$4,'Stone','0.02')", [a.id, a.version, "2043-01-01", A]);
    const dashboard = await rpc("dashboard($1,$1,$2,'combined')", ["2043-01-01", [A, B]]);
    assert.equal(dashboard.summary.total, "0.05");
    assert.deepEqual(dashboard.units.map(u => u.id).sort(), [A, B].sort());
    await rpc("entry_delete($1,$2)", [edited.id, edited.version]);
    assert.equal((await rpc("entries_list(null,null,$1)", [A])).length, 0);
    result.sql.push("Sete capacidades globais em my_access; CRUD/consulta em duas unidades; dashboard combinado 0.05; D5-B false; tudo em ROLLBACK.");
  } finally { await db.query("rollback"); }
  result.roles = (await db.query("select key,name,system,active from core.roles order by key")).rows;
  result.migrations = (await db.query("select count(*)::int n from supabase_migrations.schema_migrations")).rows[0].n;
  writeFileSync(`${directory}/institutional-verification.json`, JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log("Conta existente: autorização SQL PASS", { roles: result.roles.length, migrations: result.migrations, checks: result.sql });
} finally { await local.close(); }
