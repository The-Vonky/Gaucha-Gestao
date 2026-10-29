import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { createTestDatabase } from "./pglite";
import { STORAGE_STUB } from "./storage-stub";
import { retireSalesRoles, finishSalesLocal } from "./integration/sales-role-cleanup.mjs";

const db = createTestDatabase(), directory = mkdtempSync(join(tmpdir(), "sales-cleanup-"));
const migration = readFileSync("supabase/migrations/20261029180613_sales_institutional_roles.sql", "utf8");
beforeAll(async () => {
  await db.exec(readFileSync("tests/fixtures/room-booking-auth.sql", "utf8"));
  await db.exec(STORAGE_STUB);
  for (const f of readdirSync("supabase/migrations").sort()) await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
}, 60_000);
afterAll(async () => { await db.close(); rmSync(directory, { recursive: true }); });

it("composição protegida exata, sem atribuição automática, idempotência e D5-B", async () => {
  for (let n = 0; n < 2; n++) {
    await db.exec(migration);
    const rows = (await db.query<{ key: string; system: boolean; permissions: string[] }>(`select r.key,r.system,array_agg(rp.permission_key order by rp.permission_key) permissions
      from core.roles r join core.role_permissions rp on rp.role_id=r.id
      where r.key in ('platform_administrator','sales_manager','sales_operator') and rp.permission_key like 'sales.%'
      group by r.key,r.system order by r.key`)).rows;
    const all = ["sales.dashboard.read", "sales.entry.create", "sales.entry.delete", "sales.entry.edit", "sales.entry.read", "sales.export.filtered", "sales.export.full"];
    expect(rows).toEqual([
      { key: "platform_administrator", system: true, permissions: all },
      { key: "sales_manager", system: true, permissions: all },
      { key: "sales_operator", system: true, permissions: ["sales.entry.create", "sales.entry.read"] },
    ]);
    expect((await db.query("select * from core.user_role_assignments")).rows).toEqual([]);
    expect((await db.query(`select 1 from core.role_permissions rp join core.roles r on r.id=rp.role_id
      where r.key in ('platform_administrator','sales_manager','sales_operator') and rp.permission_key='room_booking.manage'`)).rows).toEqual([]);
  }
});

it("colisão não promove papel personalizado a protegido", async () => {
  await db.exec("begin; update core.roles set system=false where key='sales_operator'; commit");
  await expect(db.exec(migration)).rejects.toThrow(/Colisão/);
  await db.exec("rollback");
  expect((await db.query<{ system: boolean }>("select system from core.roles where key='sales_operator'")).rows[0].system).toBe(false);
  await db.exec("update core.roles set system=true where key='sales_operator'");
});

it("papéis institucionais respeitam capacidade, setor, unidade e perfil ativo sem inferência pelo nome", async () => {
  await db.exec("begin");
  try {
    const user = randomUUID(), unit = randomUUID(), other = randomUUID(), sector = randomUUID();
    await db.query("insert into auth.users(id,email) values($1,'institutional@example.test')", [user]);
    await db.query("insert into core.units(id,code,name) values($1,'INST-A','Sintética A'),($2,'INST-B','Sintética B')", [unit, other]);
    await db.query("insert into core.sectors(id,code,name) values($1,'INST-S','Setor sintético')", [sector]);
    await db.query("insert into core.unit_sectors(unit_id,sector_id) values($1,$2)", [unit, sector]);
    for (const role of ["sales_operator", "sales_manager", "platform_administrator"]) {
      await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
      await db.query("delete from core.user_role_assignments where user_id=$1", [user]);
      await db.query(`insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
        select $1,id,$3,$2 from core.roles where key=$4`, [user, role === "platform_administrator" ? null : unit, role === "platform_administrator" ? "global" : "unit", role]);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      const check = async (capability: string, target = unit) => (await db.query<{ ok: boolean }>("select private.has_unit_permission($1,$2) ok", [capability, target])).rows[0].ok;
      expect(await check("sales.entry.read")).toBe(true);
      expect(await check("sales.entry.create")).toBe(true);
      expect(await check("sales.entry.edit")).toBe(role !== "sales_operator");
      expect(await check("sales.dashboard.read")).toBe(role !== "sales_operator");
      expect(await check("sales.entry.read", other)).toBe(role === "platform_administrator");
      expect(await check("room_booking.manage")).toBe(false);
      // Retirar a relação elimina a capacidade mesmo preservando nome e atribuição.
      await db.exec("select set_config('request.jwt.claim.sub','',false)");
      await db.query("delete from core.role_permissions where role_id in (select id from core.roles where key=$1) and permission_key='sales.entry.read'", [role]);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
      expect(await check("sales.entry.read")).toBe(false);
      await db.exec("select set_config('request.jwt.claim.sub','',false)");
      await db.query("insert into core.role_permissions select id,'sales.entry.read' from core.roles where key=$1", [role]);
    }
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    await db.query("delete from core.user_role_assignments where user_id=$1", [user]);
    await db.query(`insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id)
      select $1,id,'sector',$2,$3 from core.roles where key='sales_manager'`, [user, unit, sector]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    expect((await db.query<{ ok: boolean }>("select private.has_unit_permission('sales.dashboard.read',$1) ok", [unit])).rows[0].ok).toBe(false);
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
    await db.query("update core.profiles set active=false where id=$1", [user]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    expect((await db.query("select * from core.my_access()")).rows).toEqual([]);
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
