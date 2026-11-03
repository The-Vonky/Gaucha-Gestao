import { readFileSync, readdirSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase } from "./pglite";
import { STORAGE_STUB } from "./storage-stub";
import { Postgres } from "./integration/postgres.mjs";
import { salesCiUrl } from "./integration/sales-ci.mjs";
import type { ExportPage } from "../apps/web/src/modules/sales/export/types";
import { parseExportPage, reconcile } from "../apps/web/src/modules/sales/export/api";

let db: PGlite;
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const unit = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const role = (n: number) => `30000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const A = unit(1), B = unit(2), C = unit(3);
async function login(n: number | null, r = "authenticated") {
  await db.exec(`reset role; set role ${r}; select set_config('request.jwt.claim.sub','${n ? uid(n) : ""}',false)`);
}
async function owner(sql: string, args: unknown[] = []) {
  await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
  return args.length ? db.query(sql, args) : db.exec(sql);
}
async function page(args: unknown[] = ["filtered", "2026-09-01", "2026-09-30", [A], "Stone", 0, 500, null]) {
  return parseExportPage((await db.query<{ result: ExportPage }>(
    "select public.sales_export_page($1,$2,$3,$4,$5,$6,$7,$8) result", args)).rows[0].result);
}
const full = () => page(["full", null, null, null, null, 0, 500, null]);
async function denied(run: () => Promise<unknown>, code = "42501") {
  await db.exec("savepoint negative");
  try { await expect(run()).rejects.toMatchObject({ code }); }
  finally { await db.exec("rollback to negative; release negative"); }
}
beforeAll(async () => {
  db = process.env.SALES_CI_DATABASE_URL ? new Postgres(salesCiUrl()) as unknown as PGlite : createTestDatabase();
  await db.exec(readFileSync("tests/fixtures/room-booking-auth.sql", "utf8"));
  await db.exec(STORAGE_STUB);
  for (const file of readdirSync("supabase/migrations").sort()) await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(readFileSync("tests/fixtures/sales-operations.sql", "utf8"));
  await db.exec(readFileSync("tests/fixtures/sales-analytics.sql", "utf8"));
  await owner(`insert into core.role_permissions(role_id,permission_key)
    select '${role(1)}',key from core.permissions where key in ('sales.export.filtered','sales.export.full')`);
  // Somente A+B, sem C. Apenas leitura e apenas dashboard continuam negativos.
  await owner(`insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
    values('${uid(4)}','${role(1)}','unit','${B}');
    select set_config('request.jwt.claim.sub','${uid(2)}',false);
    insert into sales.entries(sale_date,unit_id,payment_method,amount) values
      ('2024-02-29','${A}','Stone',0.01),('2026-09-01','${B}','Stone',0.10),
      ('2020-01-01','${C}','Stone',999999999999.99);
    insert into sales.legacy_monthly_adjustments(competency,unit_id,payment_method,amount,reason)
      values('2020-01-01','${C}','Stone',0.01,'Histórico sintético');
    update core.units set active=false where id='${C}';`);
}, 60_000);
beforeEach(async () => { await db.exec("reset role; begin"); });
afterEach(async () => { await db.exec("rollback; reset role"); });
afterAll(async () => { await db?.close(); });

describe("VEN-05A — exportação autorizada em banco efêmero", () => {
  it("global: histórico inclui unidade inativa e reconcilia sem perder centavo", async () => {
    await login(1);
    const p = await full(); reconcile(p);
    expect(p.units.find(u => u.id === C)?.active).toBe(false);
    expect(p.rows.some(r => r.unit_id === C && r.amount === "999999999999.99")).toBe(true);
    expect(p.total).toBe("1000000000350.11");
    expect(p.entry_total).toBe("1000000000300.10");
    expect(p.adjustment_total).toBe("50.01");
  });
  it("recorte Stone exporta somente 250 + ajuste50 = 300; combinado=350", async () => {
    await login(3);
    const stone = await page(); reconcile(stone);
    expect(stone).toMatchObject({ entry_count: 2, adjustment_count: 1, entry_total: "250.00", total: "300.00" });
    expect(stone.rows.every(r => r.payment_method === "Stone")).toBe(true);
    const combined = await page(["filtered", "2026-09-01", "2026-09-30", [A], null, 0, 500, null]);
    expect(combined.total).toBe("350.00"); reconcile(combined);
    expect((await page(["filtered", "2026-09-01", "2026-09-30", [A], "PIX", 0, 500, null])).total).toBe("50.00");
  });
  it("histórico da unidade A não inclui B/C; A+B não inclui C", async () => {
    await login(3); const one = await full();
    expect(one.units.map(u => u.id)).toEqual([A]); expect(one.total).toBe("350.01");
    await login(4); const two = await full();
    expect(two.units.map(u => u.id)).toEqual([A, B]); expect(two.total).toBe("350.11");
    await denied(() => page(["filtered", null, null, [A, C], null, 0, 500, null]));
    await denied(() => page(["filtered", null, null, ["ffffffff-ffff-ffff-ffff-ffffffffffff"], null, 0, 500, null]));
  });
  it("nega anônimo, sessão vazia, setor, inativo, só leitura e só dashboard", async () => {
    for (const [n, r] of [[null, "anon"], [null, "authenticated"], [5, "authenticated"], [6, "authenticated"], [7, "authenticated"], [8, "authenticated"]] as const) {
      await login(n, r); await denied(full);
    }
  });
  it("exportação não concede entry.read nem leitura gerencial", async () => {
    await owner(`insert into core.role_permissions(role_id,permission_key) values
      ('${role(6)}','sales.export.full'),('${role(6)}','sales.export.filtered')`);
    await login(7); await denied(full); // dashboard+export sem entry.read
    await owner(`insert into core.role_permissions(role_id,permission_key) values
      ('${role(2)}','sales.export.full'),('${role(2)}','sales.export.filtered')`);
    await login(5); const p = await full();
    expect(p).toMatchObject({ adjustment_count: 0, adjustment_total: "0.00", total: "300.01" });
    expect(p.units[0].adjustments_authorized).toBe(false);
    expect(JSON.stringify(p)).not.toContain("oráculo");
  });
  it("permissões em unidades distintas não se combinam nem ampliam o escopo", async () => {
    await owner(`insert into core.role_permissions(role_id,permission_key) values('${role(3)}','sales.export.full')`);
    await login(10); await denied(full); // read A, export B
    await denied(() => page(["filtered", null, null, [A, B], null, 0, 500, null]));
  });
  it("nega full com filtros adulterados e limites inválidos", async () => {
    await login(1);
    for (const args of [
      ["full", "2026-01-01", null, null, null, 0, 500, null], ["full", null, null, [A], null, 0, 500, null],
      ["full", null, null, null, "Stone", 0, 500, null], ["filtered", "infinity", null, null, null, 0, 500, null],
      ["filtered", "2026-09-30", "2026-09-01", null, null, 0, 500, null],
      ["filtered", null, null, [], null, 0, 500, null], ["filtered", null, null, [null], null, 0, 500, null],
      ["filtered", null, null, null, "stone", 0, 500, null], ["filtered", null, null, null, null, 0, 501, null],
      ["filtered", null, null, null, null, -1, 500, null], ["filtered", null, null, null, null, 1, 500, null],
      [null, null, null, null, null, 0, 500, null],
    ]) await denied(() => page(args), "23514");
  });
  it("vazio, lacunas, competências sem data diária e recortes incompletos", async () => {
    await login(3);
    expect((await page(["filtered", "2021-01-01", "2021-12-31", [A], null, 0, 500, null]))).toMatchObject({ record_count: 0, total: "0.00" });
    const partial = await page(["filtered", "2026-09-02", "2026-09-30", [A], null, 0, 500, null]);
    expect(partial).toMatchObject({ total: "180.00", adjustment_count: 0 });
    const all = await full();
    expect(all.rows.filter(r => r.kind === "adjustment").map(r => r.date)).toEqual(["2026-09-01"]);
    expect(all.rows.some(r => r.date === "2024-02-29")).toBe(true);
  });
  it("somente ativos e sem mudança em auditoria por exportar", async () => {
    await owner(`select set_config('request.jwt.claim.sub','${uid(2)}',false);
      update sales.entries set deleted_at=now(),deleted_by='${uid(2)}' where sale_date='2026-09-02' and payment_method='Stone'`);
    const before = (await db.query("select count(*) n from core.system_audit_log")).rows;
    await login(3); const p = await page(); expect(p.total).toBe("150.00");
    await owner("select 1");
    expect((await db.query("select count(*) n from core.system_audit_log")).rows).toEqual(before);
  });
  it("paginação estável e completa, token inclui filtros, final revalida", async () => {
    await login(3);
    const first = await page(["full", null, null, null, null, 0, 2, null]);
    const rows = [...first.rows]; let offset = first.next_offset;
    while (offset < first.record_count) {
      const next = await page(["full", null, null, null, null, offset, 2, first.token]);
      expect(next.token).toBe(first.token); rows.push(...next.rows); offset = next.next_offset;
    }
    expect(new Set(rows.map(r => r.id)).size).toBe(first.record_count);
    reconcile({ ...first, rows });
    expect((await page(["full", null, null, null, null, offset, 2, first.token])).rows).toEqual([]);
    await denied(() => page(["filtered", null, null, [A], "Stone", 0, 2, first.token]), "40001");
  });
  it.each(["insert", "update", "delete", "unit", "adjustment"])("detecta mudança entre páginas: %s", async kind => {
    await login(3); const first = await full();
    const statements = {
      insert: `select set_config('request.jwt.claim.sub','${uid(2)}',false); insert into sales.entries(sale_date,unit_id,payment_method,amount) values('2026-09-03','${A}','Stone',0.01)`,
      update: `select set_config('request.jwt.claim.sub','${uid(2)}',false); update sales.entries set amount=amount+0.01 where unit_id='${A}' and sale_date='2026-09-01'`,
      delete: `select set_config('request.jwt.claim.sub','${uid(2)}',false); update sales.entries set deleted_at=now(),deleted_by='${uid(2)}' where unit_id='${A}' and sale_date='2026-09-01'`,
      unit: `update core.units set name='Nome alterado sintético' where id='${A}'`,
      adjustment: `insert into sales.legacy_monthly_adjustments(competency,unit_id,payment_method,amount,reason) values('2024-02-01','${A}','Stone',0.01,'Sintético')`,
    };
    await owner(statements[kind as keyof typeof statements]); await login(3);
    await denied(() => page(["full", null, null, null, null, first.record_count, 500, first.token]), "40001");
  });
  it.each(["assignment", "profile", "role", "permission", "dashboard"])("revalida revogação: %s", async kind => {
    await login(3); const first = await full();
    const sql = {
      assignment: `update core.user_role_assignments set active=false where user_id='${uid(3)}'`,
      profile: `update core.profiles set active=false where id='${uid(3)}'`,
      role: `update core.roles set active=false where id='${role(1)}'`,
      permission: `delete from core.role_permissions where role_id='${role(1)}' and permission_key='sales.export.full'`,
      dashboard: `delete from core.role_permissions where role_id='${role(1)}' and permission_key='sales.dashboard.read'`,
    };
    await owner(sql[kind as keyof typeof sql]); await login(3);
    await denied(() => page(["full", null, null, null, null, first.record_count, 500, first.token]), kind === "dashboard" ? "40001" : "42501");
  });
  it("tabelas/helper continuam privados; somente EXECUTE autenticado", async () => {
    await login(1);
    await denied(() => db.query("select * from sales.entries"));
    await denied(() => db.query("select * from sales.legacy_monthly_adjustments"));
    await denied(() => db.query("select sales_private.authorize('sales.export.full')"));
    expect((await db.query<{ allowed: boolean }>("select has_function_privilege('anon','public.sales_export_page(text,date,date,uuid[],text,integer,integer,text)','execute') allowed")).rows[0].allowed).toBe(false);
  });
  it("muitas linhas: páginas500, soma de 0,01/0,10/0,29 e limite sem totais parciais", async () => {
    await owner(`select set_config('request.jwt.claim.sub','${uid(2)}',false);
      insert into sales.entries(sale_date,unit_id,payment_method,amount)
      select date '1900-01-01'+n,'${B}','Stone',case n%3 when 0 then 0.01 when 1 then 0.10 else 0.29 end from generate_series(0,1000) n`);
    await login(9); const first = await full();
    expect(first.rows).toHaveLength(500); expect(first.record_count).toBe(1002);
    const second = await page(["full", null, null, null, null, 500, 500, first.token]);
    const third = await page(["full", null, null, null, null, 1000, 500, first.token]);
    reconcile({ ...first, rows: [...first.rows, ...second.rows, ...third.rows] });
    expect(first.total).toBe("133.41");
    await owner(`select set_config('request.jwt.claim.sub','${uid(2)}',false);
      insert into sales.entries(sale_date,unit_id,payment_method,amount)
      select date '1800-01-01'+n,'${B}','PIX',0.01 from generate_series(0,19999) n`);
    await login(9); await denied(full, "54000");
  }, 30_000);
});
