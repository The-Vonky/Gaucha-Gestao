import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { createTestDatabase } from "./pglite";
import { STORAGE_STUB } from "./storage-stub";
import { retireSalesRoles, finishSalesLocal } from "./integration/sales-role-cleanup.mjs";
import { retireSalesUnits } from "./integration/sales-unit-cleanup.mjs";

const db = createTestDatabase(), directory = mkdtempSync(join(tmpdir(), "sales-cleanup-"));
const filename = "20261118132509_gg04_sales_institutional_roles.sql";
const migration = readFileSync(`supabase/migrations/${filename}`, "utf8");
const legacyRole = async () => (await db.query<{ id: string }>(
  "insert into core.roles(key,name,system) values('sales_operator','Sales Operator',true) returning id",
)).rows[0].id;
beforeAll(async () => {
  await db.exec(readFileSync("tests/fixtures/room-booking-auth.sql", "utf8"));
  await db.exec(STORAGE_STUB);
  for (const f of readdirSync("supabase/migrations").sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
}, 60_000);
afterAll(async () => { await db.close(); rmSync(directory, { recursive: true }); });

it("MEL-01: duas rodadas removem somente unidades e histórico próprios, restaurando proteções", async () => {
  const user = randomUUID(), independent = randomUUID();
  await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'mel01@example.test','{\"display_name\":\"MEL01 sintético\"}')", [user]);
  await db.query("insert into core.units(id,code,name) values($1,'INDEPENDENTE','Unidade preservada')", [independent]);
  const users = [{ id: user, email: "mel01@example.test", displayName: "MEL01 sintético" }];
  const baseline = (await db.query("select * from core.units order by id")).rows;
  const audit = (await db.query("select * from core.system_audit_log order by id")).rows;
  const triggers = (await db.query("select tgrelid::regclass::text relation,tgname,tgenabled from pg_trigger where not tgisinternal order by 1,2")).rows;
  for (let n = 0; n < 2; n++) {
    const id = randomUUID(), tag = `VEN04B-${randomUUID().slice(0, 8)}`, code = `${tag}-A`;
    const units = [{ id, code, name: code, tag }];
    await db.query("insert into core.units(id,code,name) values($1,$2,$2)", [id, code]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    await db.query("insert into sales.entries(sale_date,unit_id,payment_method,amount) values('2049-09-01',$1,'PIX',1)", [id]);
    await db.query("update sales.entries set deleted_at=now(),deleted_by=$2 where unit_id=$1", [id, user]);
    await db.query("insert into sales.legacy_monthly_adjustments(competency,unit_id,payment_method,amount,reason) values('2049-09-01',$1,'Stone',50,$2)", [id, `${tag} sintético`]);
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    await db.exec("insert into sales.month_statuses(competency,is_closed,last_day_with_data,source) values('2049-09-01',false,2,'mel01_synthetic')");
    const result = await retireSalesUnits(db, { units, users, statuses: [{ competency: "2049-09-01", is_closed: false, last_day_with_data: 2, source: "mel01_synthetic" }], backupPath: join(directory, `units-${n}.json`) });
    expect(result.dryRun).toBe("ROLLBACK");
    expect(result.protectionsRestored).toBe(true);
    expect(result.removed["core.units"]).toBe(1);
    expect(result.removed["sales.entries"]).toBe(1);
    expect((await db.query("select * from core.units order by id")).rows).toEqual(baseline);
    expect((await db.query("select * from core.system_audit_log order by id")).rows).toEqual(audit);
    expect((await db.query("select tgrelid::regclass::text relation,tgname,tgenabled from pg_trigger where not tgisinternal order by 1,2")).rows).toEqual(triggers);
  }
});

it("MEL-01: recusa recibo divergente, ajuste externo e FK desconhecida sem alterar dados", async () => {
  const id = randomUUID(), tag = `VEN03-${randomUUID().slice(0, 8)}`, code = `${tag}-A`;
  await db.query("insert into core.units(id,code,name) values($1,$2,$2)", [id, code]);
  const run = (units = [{ id, code, name: code, tag }]) => retireSalesUnits(db, { units, users: [], backupPath: join(directory, "blocked-units.json") });
  await expect(run([{ id, code: `${tag}-B`, name: code, tag }])).rejects.toThrow(/UUID\/código/);
  await db.query("insert into sales.legacy_monthly_adjustments(competency,unit_id,payment_method,amount,reason) values('2050-01-01',$1,'Stone',1,'Histórico externo')", [id]);
  await expect(run()).rejects.toThrow(/Ajuste externo/);
  await db.exec("create table public.synthetic_unit_fk(unit_id uuid references core.units(id))");
  await expect(run()).rejects.toThrow(/FK desconhecida/);
  expect((await db.query("select id from core.units where id=$1", [id])).rows).toEqual([{ id }]);
  expect((await db.query("select tgname from pg_trigger where tgenabled='D' and not tgisinternal")).rows).toEqual([]);
});

it("GG-04 remove o papel físico com auditoria, preserva os demais e é idempotente", async () => {
  await db.exec("begin");
  try {
    const operator = await legacyRole();
    await db.query("insert into core.role_permissions values($1,'sales.entry.read'),($1,'sales.entry.create')", [operator]);
    const preserved = () => db.query(`select r.*, array(select permission_key from core.role_permissions
      where role_id=r.id order by permission_key) permissions from core.roles r where id<>$1 order by key`, [operator]);
    const before = (await preserved()).rows;
    const audit = (await db.query("select * from core.system_audit_log order by id")).rows;
    await db.exec(migration);
    expect((await preserved()).rows).toEqual(before);
    expect((await db.query("select 1 from core.roles where id=$1 or key='sales_operator'", [operator])).rows).toEqual([]);
    expect((await db.query("select 1 from core.role_permissions where role_id=$1", [operator])).rows).toEqual([]);
    expect((await db.query(`select action, entity_type from core.system_audit_log
      where action='delete' and (entity_id=$1 or before_data->>'role_id'=$1) order by entity_type`, [operator])).rows).toEqual([
      { action: "delete", entity_type: "role_permissions" },
      { action: "delete", entity_type: "role_permissions" },
      { action: "delete", entity_type: "roles" },
    ]);
    const after = (await db.query("select * from core.system_audit_log order by id")).rows;
    expect(after).toEqual(expect.arrayContaining(audit));
    await db.exec(migration);
    expect((await db.query("select * from core.system_audit_log order by id")).rows).toEqual(after);
  } finally { await db.exec("rollback"); }
});

it.each([true, false])("GG-04 interrompe a remoção se houver atribuição com active=%s", async active => {
  await db.exec("begin");
  try {
    const operator = await legacyRole();
    const user = randomUUID();
    await db.query("insert into auth.users(id,email) values($1,'gg04-history@example.test')", [user]);
    await db.query(`insert into core.user_role_assignments(user_id,role_id,scope_type,active)
      values($1,$2,'global',$3)`, [user, operator, active]);
    await db.exec("savepoint before_gg04");
    await expect(db.exec(migration)).rejects.toThrow(/possui atribuições/);
    await db.exec("rollback to before_gg04");
    expect((await db.query("select active from core.user_role_assignments where role_id=$1", [operator])).rows).toEqual([{ active }]);
    expect((await db.query("select id from core.roles where key='sales_operator'")).rows).toEqual([{ id: operator }]);
  } finally { await db.exec("rollback"); }
});

it("GG-04 recusa FK inesperada que poderia remover histórico", async () => {
  await db.exec("begin");
  try {
    const operator = await legacyRole();
    await db.exec("create table public.gg04_history(role_id uuid references core.roles(id) on delete cascade)");
    await db.query("insert into public.gg04_history values($1)", [operator]);
    await db.exec("savepoint before_gg04");
    await expect(db.exec(migration)).rejects.toThrow(/chave estrangeira inesperada/);
    await db.exec("rollback to before_gg04");
    expect((await db.query("select role_id from public.gg04_history")).rows).toEqual([{ role_id: operator }]);
  } finally { await db.exec("rollback"); }
});

it("GG-04 recusa colisão com Sales Viewer personalizado", async () => {
  await db.exec("begin");
  try {
    await db.exec("update core.roles set system=false where key='sales_viewer'");
    await db.exec("savepoint before_gg04");
    await expect(db.exec(migration)).rejects.toThrow(/colisão/);
    await db.exec("rollback to before_gg04");
    expect((await db.query("select system from core.roles where key='sales_viewer'")).rows).toEqual([{ system: false }]);
  } finally { await db.exec("rollback"); }
});

it("repetição e falha do corpo/teardown não acumulam papéis nem removem auditoria", async () => {
  const before = (await db.query("select id from core.roles order by id")).rows;
  for (let n = 0; n < 2; n++) {
    const id = randomUUID(), key = `synthetic-${randomUUID()}`;
    await db.query("insert into core.roles(id,key,name) values($1,$2,$2)", [id, key]);
    await db.query("insert into core.role_permissions(role_id,permission_key) values($1,'sales.entry.read')", [id]);
    const audit = (await db.query("select id from core.system_audit_log")).rows;
    await expect(finishSalesLocal([
      async () => { throw new Error("Falha simulada do navegador"); },
      () => retireSalesRoles(db, { roles: [{ id, key }], users: [], backupPath: join(directory, `backup-${n}.json`) }),
    ])).rejects.toThrow(/Teardown local incompleto/);
    expect((await db.query("select id from core.roles order by id")).rows).toEqual(before);
    expect((await db.query("select id from core.system_audit_log")).rows).toEqual(expect.arrayContaining(audit));
    expect(JSON.parse(readFileSync(join(directory, `backup-${n}.json`), "utf8")).roles[0].id).toBe(id);
  }
});

it("teardown bloqueia proteção, identidade operacional, permissão externa e FK desconhecida", async () => {
  const protectedRole = (await db.query<{ id: string; key: string }>("select id,key from core.roles where key='sales_manager'")).rows[0];
  await expect(retireSalesRoles(db, { roles: [protectedRole], users: [], backupPath: join(directory, "blocked.json") })).rejects.toThrow(/protegido/);
  const id = randomUUID(), user = randomUUID(), key = `synthetic-${randomUUID()}`;
  await db.query("insert into auth.users(id,email) values($1,'legitimate@example.test')", [user]);
  await db.query("insert into core.roles(id,key,name) values($1,$2,$2)", [id, key]);
  await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type) values($1,$2,'global')", [user, id]);
  await expect(retireSalesRoles(db, { roles: [{ id, key }], users: [], backupPath: join(directory, "blocked-user.json") })).rejects.toThrow(/não comprovadamente sintética/);
  expect((await db.query("select id from core.roles where id=$1", [id])).rows).toEqual([{ id }]);
  expect((await db.query("select id from core.user_role_assignments where role_id=$1", [id])).rows).toHaveLength(1);
  const other = randomUUID(), otherKey = `synthetic-${randomUUID()}`;
  await db.query("insert into core.roles(id,key,name) values($1,$2,$2)", [other, otherKey]);
  await db.query("insert into core.role_permissions(role_id,permission_key) values($1,'admin.user.read')", [other]);
  await expect(retireSalesRoles(db, { roles: [{ id: other, key: otherKey }], users: [], backupPath: join(directory, "blocked-permission.json") })).rejects.toThrow(/Permissão externa/);
  await db.exec("create table public.synthetic_role_fk(role_id uuid references core.roles(id))");
  await expect(retireSalesRoles(db, { roles: [{ id: other, key: otherKey }], users: [], backupPath: join(directory, "blocked-fk.json") })).rejects.toThrow(/FK desconhecida/);
  expect((await db.query("select id from core.roles where id=$1", [other])).rows).toEqual([{ id: other }]);
});
