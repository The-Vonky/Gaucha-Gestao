import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase } from "./pglite";
import { STORAGE_STUB } from "./storage-stub";
import { SalesLocalDatabase } from "./integration/sales-local.mjs";
import { Postgres } from "./integration/postgres.mjs";
import { salesCiUrl } from "./integration/sales-ci.mjs";
import type { SalesUnit } from "../apps/web/src/modules/sales/types";

let db: PGlite;
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const unit = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
async function login(n: number | null, role = "authenticated") {
  await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${n ? uid(n) : ""}',false)`);
}
async function owner(sql: string) { await login(null, "postgres"); return db.exec(sql); }
async function units(limit: number | null = 100, offset: number | null = 0): Promise<SalesUnit[]> {
  return (await db.query<{ result: SalesUnit[] }>("select public.sales_operation_units($1,$2) result", [limit, offset])).rows[0].result;
}
beforeAll(async () => {
  const local = !!process.env.VEN04A_LOCAL_TEST;
  db = local ? await SalesLocalDatabase.open() as unknown as PGlite
    : process.env.SALES_CI_DATABASE_URL ? new Postgres(salesCiUrl()) as unknown as PGlite : createTestDatabase();
  if (!local) {
    await db.exec(readFileSync("tests/fixtures/room-booking-auth.sql", "utf8"));
    await db.exec(STORAGE_STUB);
    for (const file of readdirSync("supabase/migrations").sort()) await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  const fixture = readFileSync("tests/fixtures/sales-operations.sql", "utf8");
  await db.exec(local ? fixture.replace("select private.bootstrap_administrator('00000000-0000-0000-0000-000000000001');", "") : fixture);
  if (local) await owner(`insert into core.user_role_assignments(user_id,role_id,scope_type)
    select '${uid(1)}',id,'global' from core.roles where key='platform_administrator'`);
  // Global desta fixture não deve ter seu oráculo contaminado por unidades preexistentes.
}, 60_000);
afterAll(async () => { await db?.close(); });

describe("VEN-04A — catálogo operacional mínimo", () => {
  it("administrador descobre referências por suas permissões globais", async () => {
    await login(1);
    const list = (await units()).filter(u => u.code.startsWith("VEN02-"));
    expect(list).toHaveLength(3);
    expect(list.every(u => u.can_read && u.can_create && u.can_edit && u.can_delete)).toBe(true);
  });
  it("nega anon, sem identidade, sem papel, setor, perfil inativo", async () => {
    for (const [n, role] of [[null, "anon"], [null, "authenticated"], [6, "authenticated"], [7, "authenticated"], [8, "authenticated"]] as const) {
      await login(n, role);
      await expect(units()).rejects.toMatchObject({ code: "42501" });
    }
  });
  it("retorna apenas a unidade autorizada com capacidades independentes", async () => {
    await login(5);
    const list = await units();
    expect(list).toEqual([{ id: unit(1), code: "VEN02-A", name: "Unidade sintética A", active: true,
      can_read: true, can_create: false, can_edit: false, can_delete: false }]);
    await login(10);
    expect((await units()).map(u => [u.id, u.can_read, u.can_create, u.can_edit, u.can_delete])).toEqual([
      [unit(1), true, false, false, false], [unit(2), false, false, true, false], [unit(3), false, true, false, true],
    ]);
    await expect(db.query("select public.sales_entries_list(null,null,$1)", [unit(2)])).rejects.toMatchObject({ code: "42501" });
  });
  it("criação isolada descobre unidade sem admin/dashboard e sem obter leitura", async () => {
    await owner(`insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
      values('${uid(7)}','30000000-0000-0000-0000-000000000005','unit','${unit(1)}')`);
    await login(7);
    expect(await units()).toMatchObject([{ id: unit(1), can_create: true, can_read: false, can_edit: false, can_delete: false }]);
    await expect(db.query("select public.sales_entries_list()")).rejects.toMatchObject({ code: "42501" });
    expect((await db.query("select * from core.units")).rows).toEqual([]);
    await expect(db.query("select public.sales_dashboard('2026-09-01','2026-09-01')")).rejects.toMatchObject({ code: "42501" });
  });
  it("mantém inativas no catálogo autorizado sem permitir novos lançamentos", async () => {
    await owner(`update core.units set active=false where id='${unit(1)}'`);
    await login(3);
    expect(await units()).toMatchObject([{ id: unit(1), active: false, can_create: true, can_edit: true }]);
    await expect(db.query("select public.sales_entry_create('2026-10-29',$1,'PIX','0.01')", [unit(1)])).rejects.toMatchObject({ code: "23514" });
    await owner(`update core.units set active=true where id='${unit(1)}'`);
  });
  it("ordena/pagina referências sem total e valida limites", async () => {
    await login(10);
    expect(await units(1, 1)).toEqual((await units()).slice(1, 2));
    expect(await units(1, 99)).toEqual([]);
    for (const [limit, offset] of [[null, 0], [0, 0], [101, 0], [1, null], [1, -1]])
      await expect(units(limit, offset)).rejects.toMatchObject({ code: "23514" });
    await login(2);
    expect((await units()).filter(u => u.code.startsWith("VEN02-")).map(u => u.id)).toEqual([unit(1), unit(2), unit(3)]);
  });
  it("revogação, papel/catálogo inativo e perfil inativo negam nova descoberta", async () => {
    for (const [disable, enable] of [
      [`update core.user_role_assignments set active=false where user_id='${uid(5)}'`, `update core.user_role_assignments set active=true where user_id='${uid(5)}'`],
      ["update core.roles set active=false where key='ven02_reader'", "update core.roles set active=true where key='ven02_reader'"],
      ["update core.permissions set active=false where key='sales.entry.read'", "update core.permissions set active=true where key='sales.entry.read'"],
    ]) {
      await owner(disable); await login(5);
      await expect(units()).rejects.toMatchObject({ code: "42501" });
      await owner(enable);
    }
    await owner(`update core.profiles set active=false where id='${uid(5)}'`);
    await login(5); await expect(units()).rejects.toMatchObject({ code: "42501" });
  });
  it("restringe grants e superfície sem DML, atribuições reais ou parâmetros privilegiados", async () => {
    await login(null, "postgres");
    const result = await db.query("select prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') anon,has_function_privilege('authenticated',oid,'EXECUTE') authenticated from pg_proc where oid='public.sales_operation_units(integer,integer)'::regprocedure");
    expect(result.rows[0]).toMatchObject({ prosecdef: true, anon: false, authenticated: true });
    expect(result.rows[0].proconfig).toContain('search_path=""');
  });
});
