import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase } from "./pglite";
import { STORAGE_STUB } from "./storage-stub";
import { SalesLocalDatabase } from "./integration/sales-local.mjs";
import type { SalesDashboard, SalesUnit } from "../apps/web/src/modules/sales/types";

let db: PGlite;
let control: (sql: string) => Promise<unknown>;
const user = randomUUID();
beforeAll(async () => {
  const local = !!process.env.VEN04B_LOCAL_TEST;
  db = local ? await SalesLocalDatabase.open() as unknown as PGlite : createTestDatabase();
  // O adaptador local cria savepoints por comando; controles de transação precisam
  // usar o client bruto para não serem liberados junto com o savepoint interno.
  control = local
    ? sql => (db as unknown as { client: { query: (sql: string) => Promise<unknown> } }).client.query(sql)
    : sql => db.exec(sql);
  if (!local) {
    await db.exec(readFileSync("tests/fixtures/room-booking-auth.sql", "utf8"));
    await db.exec(STORAGE_STUB);
    for (const file of readdirSync("supabase/migrations").sort()) await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    await db.exec("begin");
  }
  expect((await db.query<{ n: number }>("select count(*)::int n from core.units")).rows[0].n).toBe(0);
  await db.query("insert into auth.users(id,email) values($1,'zero-units@example.test')", [user]);
  await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type) select $1,id,'global' from core.roles where key='platform_administrator'", [user]);
  await db.exec("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
}, 60_000);
afterAll(async () => { await db?.close(); });

it("MEL-01: administrador consulta catálogo e Vendas vazios sem criar dados ou ampliar permissões", async () => {
  expect((await db.query("select * from core.units")).rows).toEqual([]);
  expect((await db.query<{ result: SalesUnit[] }>("select public.sales_operation_units(100,0) result")).rows[0].result).toEqual([]);
  expect((await db.query<{ result: unknown[] }>("select public.sales_entries_list() result")).rows[0].result).toEqual([]);
  const d = (await db.query<{ result: SalesDashboard }>("select public.sales_dashboard('2026-10-01','2026-10-01',null,'combined') result")).rows[0].result;
  expect(d.units).toEqual([]); expect(d.ranking).toEqual([]); expect(d.unit_months).toEqual([]);
  expect(d.summary.total).toBe("0.00");
  expect((await db.query<{ ok: boolean }>("select private.has_global_permission('room_booking.manage') ok")).rows[0].ok).toBe(false);
});

it("MEL-01: cadastro autorizado após zero unidades funciona e desaparece por ROLLBACK", async () => {
  await control("savepoint zero_unit");
  try {
    const created = (await db.query<{ id: string }>("insert into core.units(code,name) values('ZERO-UNIT','Unidade transacional') returning id")).rows[0];
    expect((await db.query<{ id: string }>("select id from core.units")).rows).toEqual([{ id: created.id }]);
  } finally { await control("rollback to savepoint zero_unit; release savepoint zero_unit"); }
  expect((await db.query("select id from core.units")).rows).toEqual([]);
});

it("MEL-01: zero unidades não permite unidade inexistente, anonimato, sem papel ou capacidade revogada", async () => {
  const denied = async (sql: string, code = "42501") => {
    await control("savepoint zero_negative");
    try { await expect(db.exec(sql)).rejects.toMatchObject({ code }); }
    finally { await control("rollback to savepoint zero_negative; release savepoint zero_negative"); }
  };
  await denied(`select public.sales_entry_create('2026-10-01','${randomUUID()}','PIX','0.01')`, "23514");
  for (const setup of [
    "set local role anon",
    `select set_config('request.jwt.claim.sub','${randomUUID()}',true)`,
    "reset role; update core.permissions set active=false where key like 'sales.%'; set local role authenticated",
  ]) {
    await control("savepoint zero_access");
    try {
      await db.exec(setup);
      await denied("select public.sales_operation_units(100,0)");
      await denied("select public.sales_dashboard('2026-10-01','2026-10-01')");
    } finally { await control("rollback to savepoint zero_access; release savepoint zero_access"); }
  }
});

it("MEL-01: perfil inativo continua negado mesmo com catálogo vazio", async () => {
  await db.exec("reset role");
  await db.query("update core.profiles set active=false where id=$1", [user]);
  await db.exec("set local role authenticated");
  expect((await db.query("select * from core.my_access()")).rows).toEqual([]);
  // Savepoint explícito também permite testar erro em PGlite sem abortar o ensaio.
  await control("savepoint zero_denied");
  try { await expect(db.exec("select public.sales_dashboard('2026-10-01','2026-10-01')")).rejects.toMatchObject({ code: "42501" }); }
  finally { await control("rollback to savepoint zero_denied; release savepoint zero_denied"); }
});
