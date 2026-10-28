import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase } from "./pglite";
import { STORAGE_STUB } from "./storage-stub";
import { Postgres } from "./integration/postgres.mjs";
import { salesCiUrl } from "./integration/sales-ci.mjs";
import type { SalesEntry } from "../apps/web/src/modules/sales/types";

let db: PGlite;
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const unit = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const A = unit(1), B = unit(2), C = unit(3);
const missing = "ffffffff-ffff-ffff-ffff-ffffffffffff";
async function login(n: number | null, role = "authenticated") {
  await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${n ? uid(n) : ""}',false)`);
}
async function owner(sql: string, params: unknown[] = []) {
  await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
  return db.query(sql, params);
}
async function rpc<T = SalesEntry>(name: string, args: unknown[] = []): Promise<T> {
  const sql = `select public.sales_${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as result`;
  return (await db.query<{ result: T }>(sql, args)).rows[0].result;
}
const create = (date: string, u = A, value: unknown = "12.34", method = "Stone") =>
  rpc("entry_create", [date, u, method, value]);
const update = (e: SalesEntry, value = "15.55", u = e.unit_id, version: number | null = e.version) =>
  rpc("entry_update", [e.id, version, e.sale_date, u, e.payment_method, value]);
const remove = (e: SalesEntry) => rpc("entry_delete", [e.id, e.version]);
const list = (args: unknown[] = []) => rpc<SalesEntry[]>("entries_list", args);
async function denied(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

beforeAll(async () => {
  db = process.env.SALES_CI_DATABASE_URL
    ? new Postgres(salesCiUrl()) as unknown as PGlite : createTestDatabase();
  await db.exec(readFileSync("tests/fixtures/room-booking-auth.sql", "utf8"));
  await db.exec(STORAGE_STUB);
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  // Conferência anterior a qualquer concessão sintética.
  expect((await db.query<{ n: number }>("select count(*)::int n from core.role_permissions where permission_key like 'sales.%'")).rows[0].n).toBe(0);
  await db.exec(readFileSync("tests/fixtures/sales-operations.sql", "utf8"));
}, 60_000);
afterAll(async () => { await db?.close(); });

describe("VEN-02 — operações no banco", () => {
  it("nega anônimo, sessão sem identidade, sem papel, setor, perfil inativo e administrador sem concessão", async () => {
    for (const [n, role] of [[null, "anon"], [null, "authenticated"], [1, "authenticated"], [6, "authenticated"], [7, "authenticated"], [8, "authenticated"]] as const) {
      await login(n, role);
      await denied(list(), "42501");
      await denied(create("2026-01-01"), "42501");
      await denied(rpc("entry_detail", [missing]), "42501");
      await denied(rpc("entry_update", [missing, 1, "2026-01-01", A, "PIX", "1"]), "42501");
      await denied(rpc("entry_delete", [missing, 1]), "42501");
    }
  });

  it("preserva autoria e strings canônicas em centavos, inclusive limite e valores pequenos", async () => {
    await login(3);
    for (const [i, value] of ["0.01", "0.10", "0.29", "1000000.99", "999999999999.99", "1", "1.2"].entries()) {
      const e = await create(`2026-01-${String(i + 1).padStart(2, "0")}`, A, value);
      expect(e.amount).toBe(value.includes(".") ? value.padEnd(value.indexOf(".") + 3, "0") : value + ".00");
      expect(e).toMatchObject({ created_by: uid(3), updated_by: uid(3), version: 1, deleted_at: null });
      expect(await rpc("entry_detail", [e.id])).toEqual(e);
    }
    await denied(create("2026-01-01"), "23505");
  });

  it("rejeita decimais inválidos sem arredondamento ou auditoria de sucesso", async () => {
    await login(3);
    const before = (await list()).length;
    for (const value of [null, "0", "0.00", "-1", "+1", "1.001", "1.230", "1e2", "NaN", "Infinity", "1,23", " 1", "01", "1000000000000", "", "1.", ".1", "1\n"]) {
      await denied(create("2026-01-20", A, value), "23514");
    }
    await denied(create("infinity"), "23514");
    await denied(create("2026-02-30"), "22008");
    await denied(create("2026-01-20", A, "1", "Pix"), "23514");
    expect((await list()).length).toBe(before);
    const logs = await owner("select count(*)::int n from core.system_audit_log where module='sales' and after_data->>'sale_date'='2026-01-20'");
    expect(logs.rows[0].n).toBe(0);
  });

  it("filtra somente unidades autorizadas, ordena de forma estável e pagina", async () => {
    await login(2);
    const b = await create("2026-02-01", B, "21", "PIX");
    const a = await create("2026-02-01", A, "22", "PIX");
    await create("2026-02-02", A, "23");
    await login(3);
    const all = await list();
    expect(all.every(e => e.unit_id === A)).toBe(true);
    expect(await list(["2026-02-01", "2026-02-01", A, "PIX", 10, 0])).toEqual([a]);
    const first = await list([null, null, null, null, 1, 0]);
    const second = await list([null, null, null, null, 1, 1]);
    expect([...first, ...second]).toEqual(all.slice(0, 2));
    await denied(list([null, null, B]), "42501");
    for (const id of [b.id, missing]) {
      await denied(rpc("entry_detail", [id]), "P0002");
      await denied(rpc("entry_update", [id, 1, "2026-02-01", A, "Stone", "1"]), "P0002");
      await denied(rpc("entry_delete", [id, 1]), "P0002");
    }
    for (const args of [["2026-02-02", "2026-02-01"], [null, null, null, "other"], [null, null, null, null, 0], [null, null, null, null, 101], [null, null, null, null, null], [null, null, null, null, 1, -1], [null, null, null, null, 1, null]])
      await denied(list(args), "23514");
    await login(2);
    const tied = await list(["2026-02-01", "2026-02-01"]);
    expect(tied.map(e => e.id)).toEqual([a.id, b.id].sort().reverse());
  });

  it("leitor não escreve; capacidades e escopos não se misturam", async () => {
    await login(3);
    const a = await create("2026-03-01");
    await login(2);
    const b = await create("2026-03-01", B);
    const c = await create("2026-03-01", C);
    await login(5);
    expect(await rpc("entry_detail", [a.id])).toEqual(a);
    await denied(create("2026-03-02"), "42501");
    await denied(update(a), "42501");
    await denied(remove(a), "42501");
    await login(10);
    await denied(update(a), "P0002");
    expect((await update(b)).amount).toBe("15.55");
    await denied(remove(b), "P0002");
    expect((await remove(c)).deleted_by).toBe(uid(10));
    await denied(create("2026-03-02", B), "42501");
    expect((await create("2026-03-02", C)).created_by).toBe(uid(10));
  });

  it("colega autorizado edita e exclui, mantém versão, valores e trilha exata", async () => {
    await login(3);
    const e = await create("2026-04-01", A, "999999999999.99");
    await login(4);
    await denied(update(e, "1.001"), "23514");
    await denied(update(e, "1", A, null), "23514");
    const edited = await update(e, "0.01");
    expect(edited).toMatchObject({ amount: "0.01", created_by: uid(3), updated_by: uid(4), version: 2 });
    await denied(update(e), "40001");
    await denied(remove(e), "40001");
    const deleted = await remove(edited);
    expect(deleted).toMatchObject({ amount: "0.01", deleted_by: uid(4), version: 3 });
    expect(deleted.deleted_at).toBeTruthy();
    await denied(remove(deleted), "P0002");
    await denied(update(deleted), "P0002");
    await denied(rpc("entry_detail", [e.id]), "P0002");
    expect((await list()).some(row => row.id === e.id)).toBe(false);
    expect((await create(e.sale_date)).id).not.toBe(e.id);
    const result = await owner(`select action,actor_user_id,before_data->>'amount' before_amount,
      after_data->>'amount' after_amount,after_data->>'deleted_at' deleted_at,occurred_at
      from core.system_audit_log where module='sales' and entity_id=$1 order by occurred_at,id`, [e.id]);
    expect(result.rows.map(r => r.action)).toEqual(["entry.create", "entry.edit", "entry.delete"]);
    expect(result.rows[1]).toMatchObject({ actor_user_id: uid(4), before_amount: "999999999999.99", after_amount: "0.01" });
    expect(result.rows[2]).toMatchObject({ before_amount: "0.01", after_amount: "0.01", deleted_at: deleted.deleted_at });
  });

  it("unidade inativa permite histórico, correção e exclusão; transferência exige ambas as unidades", async () => {
    await login(2);
    const historical = await create("2026-05-01", C);
    const other = await create("2026-05-02", A);
    await owner("update core.units set active=false where id=$1", [C]);
    await login(2);
    expect((await list([null, null, C]))[0].id).toBe(historical.id);
    expect((await rpc("entry_detail", [historical.id])).id).toBe(historical.id);
    await denied(create("2026-05-03", C), "23514");
    await denied(update(other, "1", C), "23514");
    expect((await remove(await update(historical))).deleted_at).toBeTruthy();
    await login(3);
    await denied(update(other, "1", B), "42501");
    await login(9);
    await denied(update(other, "1", B), "P0002");
    await login(2);
    const transferred = await update(other, "0.29", B);
    expect(transferred.unit_id).toBe(B);
    const audit = await owner("select unit_id,before_data->>'unit_id' origin,after_data->>'unit_id' destination from core.system_audit_log where module='sales' and entity_id=$1 and action='entry.edit'", [other.id]);
    expect(audit.rows[0]).toMatchObject({ unit_id: null, origin: A, destination: B });
    await owner("update core.units set active=true where id=$1", [C]);
  });

  it("edição de chave respeita unicidade e deixa a versão intacta quando recusada", async () => {
    await login(3);
    const a = await create("2026-06-01");
    const b = await create("2026-06-02");
    await denied(rpc("entry_update", [b.id, 1, a.sale_date, A, "Stone", "1"]), "23505");
    expect(await rpc("entry_detail", [b.id])).toEqual(b);
    const edited = await rpc("entry_update", [b.id, 1, a.sale_date, A, "PIX", "0.10"]);
    expect(edited).toMatchObject({ sale_date: a.sale_date, payment_method: "PIX", amount: "0.10", version: 2 });
  });

  it("revogação, papel e catálogo inativos entram em vigor entre chamadas", async () => {
    for (const [sql, undo] of [
      ["update core.user_role_assignments set active=false where user_id='" + uid(3) + "'", "update core.user_role_assignments set active=true where user_id='" + uid(3) + "'"],
      ["update core.roles set active=false where key='ven02_operator'", "update core.roles set active=true where key='ven02_operator'"],
      ["update core.permissions set active=false where key='sales.entry.read'", "update core.permissions set active=true where key='sales.entry.read'"],
      ["delete from core.role_permissions where role_id='30000000-0000-0000-0000-000000000001' and permission_key='sales.entry.read'", "insert into core.role_permissions(role_id,permission_key) values('30000000-0000-0000-0000-000000000001','sales.entry.read')"],
    ]) {
      await owner(sql);
      await login(3);
      await denied(list(), "42501");
      await owner(undo);
      await login(3);
      expect((await list()).length).toBeGreaterThan(0);
    }
  });

  it("nega acesso direto, helpers e auditoria; RLS resiste a grant acidental", async () => {
    await login(3);
    for (const sql of ["select * from sales.entries", "update sales.entries set amount=1", "delete from sales.entries", "insert into sales.entries(sale_date,unit_id,payment_method,amount) values('2026-01-01','" + A + "','PIX',1)", "select sales_private.authorize('sales.entry.read')", "insert into core.system_audit_log(module,action,entity_type,entity_id) values('sales','fake','entries','fake')"])
      await denied(db.exec(sql), "42501");
    await owner("grant usage on schema sales to authenticated");
    await owner("grant select,insert,update,delete on sales.entries to authenticated");
    await login(3);
    expect((await db.query("select * from sales.entries")).rows).toEqual([]);
    expect((await db.query("update sales.entries set amount=1 returning id")).rows).toEqual([]);
    expect((await db.query("delete from sales.entries returning id")).rows).toEqual([]);
    await denied(db.exec("insert into sales.entries(sale_date,unit_id,payment_method,amount) values('2026-01-01','" + A + "','PIX',1)"), "42501");
    await owner("revoke all on sales.entries from authenticated");
    await owner("revoke usage on schema sales from authenticated");
    const functions = await owner(`select p.proname,p.prosecdef,p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'sales_%'`);
    expect(functions.rows).toHaveLength(6);
    for (const f of functions.rows) {
      expect(f).toMatchObject({ prosecdef: true, anon: false, authenticated: true });
      expect(f.proconfig).toContain('search_path=""');
    }
  });
});
