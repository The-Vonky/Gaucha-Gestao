import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { createTestDatabase } from "./pglite";
import { STORAGE_STUB } from "./storage-stub";
import { Postgres } from "./integration/postgres.mjs";
import { salesCiUrl } from "./integration/sales-ci.mjs";
import { SalesLocalDatabase } from "./integration/sales-local.mjs";
import type { SalesEntry } from "../apps/web/src/modules/sales/types";
import type { ExportPage } from "../apps/web/src/modules/sales/export/types";

const viewerPermissions = ["sales.dashboard.read", "sales.entry.read", "sales.export.filtered", "sales.export.full"];
const managerPermissions = [...viewerPermissions, "sales.entry.create", "sales.entry.edit", "sales.entry.delete"].sort();
const A = randomUUID(), B = randomUUID(), manager = randomUUID(), viewer = randomUUID();
const date = "2044-01-01";
let db: PGlite;
let local: Awaited<ReturnType<typeof SalesLocalDatabase.open>> | undefined;
let entryA: SalesEntry, entryB: SalesEntry;

async function login(user?: string) {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user ?? ""]);
  if (user) await db.query("set local role authenticated");
}

async function rpc<T>(name: string, args: unknown[] = []) {
  const params = args.map((_, index) => `$${index + 1}`).join(",");
  return (await db.query<{ result: T }>(`select public.sales_${name}(${params}) result`, args)).rows[0].result;
}

async function denied(run: () => Promise<unknown>, code = "42501") {
  await db.query("savepoint gg04_denied");
  try { await expect(run()).rejects.toMatchObject({ code }); }
  finally { await db.query("rollback to gg04_denied"); await db.query("release gg04_denied"); }
}

const create = (unit: string, method = "Stone") => rpc<SalesEntry>("entry_create", [date, unit, method, "0.01"]);
const edit = (entry: SalesEntry, unit = entry.unit_id) =>
  rpc<SalesEntry>("entry_update", [entry.id, entry.version, date, unit, entry.payment_method, "0.02"]);
const remove = (entry: SalesEntry) => rpc<SalesEntry>("entry_delete", [entry.id, entry.version]);
const entries = (unit: string | null) => rpc<SalesEntry[]>("entries_list", [date, date, unit]);
const dashboard = (units: string[]) => rpc<{ units: { id: string }[] }>("dashboard", [date, date, units]);
const exportPage = (mode: "full" | "filtered", units: string[] | null = null) => mode === "full"
  ? rpc<ExportPage>("export_page", [mode])
  : rpc<ExportPage>("export_page", [mode, date, date, units, "Stone"]);
const access = async () => (await db.query<{ permission: string }>(
  "select distinct permission from core.my_access() order by permission",
)).rows.map(row => row.permission);

beforeAll(async () => {
  if (process.env.SALES_GG04_LOCAL_TEST) {
    local = await SalesLocalDatabase.open();
    db = local.client as unknown as PGlite;
  } else {
    db = process.env.SALES_CI_DATABASE_URL ? new Postgres(salesCiUrl()) as unknown as PGlite : createTestDatabase();
    await db.exec(readFileSync("tests/fixtures/room-booking-auth.sql", "utf8"));
    await db.exec(STORAGE_STUB);
    for (const file of readdirSync("supabase/migrations").sort()) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    }
    expect((await db.query(`select a.id from core.user_role_assignments a join core.roles r on r.id=a.role_id
      where r.key='sales_viewer'`)).rows).toEqual([]);
    await db.query("begin");
  }

  await db.query("insert into auth.users(id,email) values($1,$3),($2,$4)",
    [manager, viewer, `gg04-${manager}@example.test`, `gg04-${viewer}@example.test`]);
  await db.query("insert into core.units(id,code,name) values($1,$3,$3),($2,$4,$4)",
    [A, B, `GG04-${A.slice(0, 8)}`, `GG04-${B.slice(0, 8)}`]);
  await db.query(`insert into core.user_role_assignments(user_id,role_id,scope_type)
    select $1,id,'global' from core.roles where key='sales_manager'`, [manager]);
  await db.query(`insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
    select $1,id,'unit',$2 from core.roles where key='sales_viewer'`, [viewer, A]);
  await login(manager);
  entryA = await create(A);
  entryB = await create(B);
  await login();
}, 60_000);

beforeEach(async () => { await db.query("savepoint gg04_test"); });
afterEach(async () => { await db.query("rollback to gg04_test"); await db.query("release gg04_test"); });
afterAll(async () => {
  if (local) await local.close();
  else if (db) { await db.query("rollback"); await db.close(); }
});

it("GG-04: apenas os dois perfis institucionais e as permissões exatas no catálogo", async () => {
  expect((await db.query(`select r.key,r.name,r.active,r.system,r.global_only,
    array(select permission_key from core.role_permissions where role_id=r.id order by permission_key) permissions
    from core.roles r where (r.system and left(r.key,6)='sales_') or r.key='sales_operator' order by r.key`)).rows).toEqual([
    { key: "sales_manager", name: "Sales Manager", active: true, system: true, global_only: false, permissions: managerPermissions },
    { key: "sales_viewer", name: "Sales Viewer", active: true, system: true, global_only: false, permissions: viewerPermissions },
  ]);
});

it("Manager: CRUD, dashboard e exportações autorizados, com isolamento para atribuição unitária", async () => {
  await db.query("update core.user_role_assignments set active=false where user_id=$1", [manager]);
  await db.query(`insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
    select $1,id,'unit',$2 from core.roles where key='sales_manager'`, [manager, A]);
  await login(manager);
  expect(await access()).toEqual(managerPermissions);
  const created = await create(A, "PIX");
  const edited = await edit(created);
  expect(edited.amount).toBe("0.02");
  expect((await rpc<SalesEntry>("entry_detail", [edited.id])).id).toBe(edited.id);
  expect((await dashboard([A])).units.map(unit => unit.id)).toEqual([A]);
  expect((await exportPage("filtered", [A])).units.map(unit => unit.id)).toEqual([A]);
  expect((await exportPage("full")).units.map(unit => unit.id)).toEqual([A]);
  await denied(() => create(B, "PIX"));
  await denied(() => edit(entryB), "P0002");
  await denied(() => remove(entryB), "P0002");
  await denied(() => edit(edited, B));
  expect((await remove(edited)).deleted_at).toBeTruthy();
});

it("Viewer unitário: consulta, dashboard e exportações limitados à unidade e escrita negada por RPC", async () => {
  await login(viewer);
  expect(await access()).toEqual(viewerPermissions);
  expect((await entries(null)).map(row => row.id)).toEqual([entryA.id]);
  expect((await dashboard([A])).units.map(unit => unit.id)).toEqual([A]);
  for (const mode of ["filtered", "full"] as const) {
    const page = await exportPage(mode);
    expect(page.units.map(unit => unit.id)).toEqual([A]);
    expect(page.rows.map(row => row.unit_id)).toEqual([A]);
  }
  await denied(() => entries(B));
  await denied(() => rpc("entry_detail", [entryB.id]), "P0002");
  await denied(() => dashboard([B]));
  await denied(() => exportPage("filtered", [A, B]));
  await denied(() => create(A, "PIX"));
  await denied(() => edit(entryA));
  await denied(() => remove(entryA));
});

it("Viewer global: acessa ambas as unidades e continua sem acesso de escrita ou a outros módulos", async () => {
  await db.query(`insert into core.user_role_assignments(user_id,role_id,scope_type)
    select $1,id,'global' from core.roles where key='sales_viewer'`, [viewer]);
  await login(viewer);
  expect(await access()).toEqual(viewerPermissions);
  expect((await entries(B)).map(row => row.id)).toEqual([entryB.id]);
  expect((await dashboard([A, B])).units.map(unit => unit.id).sort()).toEqual([A, B].sort());
  expect((await exportPage("filtered", [A, B])).units.map(unit => unit.id).sort()).toEqual([A, B].sort());
  await denied(() => create(B, "PIX"));
});

it.each(["inativo", "revogado"])("Viewer %s perde o acesso corrente", async state => {
  await db.query(state === "inativo"
    ? "update core.profiles set active=false where id=$1"
    : "update core.user_role_assignments set active=false where user_id=$1", [viewer]);
  await login(viewer);
  expect(await access()).toEqual([]);
  await denied(() => entries(A));
  await denied(() => dashboard([A]));
  await denied(() => exportPage("filtered", [A]));
  await denied(() => exportPage("full"));
});

it("Atribuição setorial do Viewer não concede leitura, dashboard ou exportação da unidade", async () => {
  const sector = randomUUID();
  await db.query("insert into core.sectors(id,code,name) values($1,$2,$2)", [sector, `GG04-${sector.slice(0, 8)}`]);
  await db.query("insert into core.unit_sectors(unit_id,sector_id) values($1,$2)", [A, sector]);
  await db.query("update core.user_role_assignments set active=false where user_id=$1", [viewer]);
  await db.query(`insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id)
    select $1,id,'sector',$2,$3 from core.roles where key='sales_viewer'`, [viewer, A, sector]);
  await login(viewer);
  await denied(() => entries(A));
  await denied(() => dashboard([A]));
  await denied(() => exportPage("full"));
});

it("Platform Administrator mantém suas sete capacidades de Vendas, a administração e a restrição D5-B", async () => {
  await db.query("update core.user_role_assignments set active=false where user_id=$1", [manager]);
  await db.query(`insert into core.user_role_assignments(user_id,role_id,scope_type)
    select $1,id,'global' from core.roles where key='platform_administrator'`, [manager]);
  await login(manager);
  const permissions = await access();
  expect(permissions.filter(permission => permission.startsWith("sales."))).toEqual(managerPermissions);
  expect(permissions).toContain("admin.role.manage");
  expect(permissions).not.toContain("room_booking.manage");
  expect((await entries(B)).map(row => row.id)).toEqual([entryB.id]);
});
