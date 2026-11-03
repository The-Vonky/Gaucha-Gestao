import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase } from "./pglite";
import { STORAGE_STUB } from "./storage-stub";
import { Postgres } from "./integration/postgres.mjs";
import { SalesLocalDatabase } from "./integration/sales-local.mjs";
import { salesCiUrl } from "./integration/sales-ci.mjs";
import { parseSalesDashboard } from "../apps/web/src/modules/sales/analytics";
import type { SalesDashboard, SalesEntry } from "../apps/web/src/modules/sales/types";

let db: PGlite;
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const unit = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const A = unit(1), B = unit(2), C = unit(3);
async function login(n: number | null, role = "authenticated") {
  await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${n ? uid(n) : ""}',false)`);
}
async function owner(sql: string) {
  await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
  try { return await db.exec(sql); } catch (error) { throw new Error(`Comando sintético: ${sql}`, { cause: error }); }
}
async function dashboard(from = "2026-09-01", to = from, units: string[] | null = [A], scope = "stone", daily: string | null = null) {
  const result = await db.query<{ result: SalesDashboard }>(
    "select public.sales_dashboard($1,$2,$3,$4,$5) result", [from, to, units, scope, daily]);
  return parseSalesDashboard(result.rows[0].result);
}
async function create(date: string, amount: string, u = A, method = "Stone") {
  return (await db.query<{ result: SalesEntry }>("select public.sales_entry_create($1,$2,$3,$4) result", [date, u, method, amount])).rows[0].result;
}
const money = (cents: bigint) => `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
// Oráculo independente em centavos inteiros; jamais derivado do payload SQL.
const oracle = { stone: [10000n, 15000n], pix: [2000n, 3000n], adjustment: 5000n, last: 2n, days: 30n };
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

beforeAll(async () => {
  const local = !!process.env.VEN03_LOCAL_TEST;
  db = local ? await SalesLocalDatabase.open() as unknown as PGlite
    : process.env.SALES_CI_DATABASE_URL
      ? new Postgres(salesCiUrl()) as unknown as PGlite : createTestDatabase();
  if (!local) {
    await db.exec(readFileSync("tests/fixtures/room-booking-auth.sql", "utf8"));
    await db.exec(STORAGE_STUB);
    for (const file of readdirSync("supabase/migrations").sort())
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  }
  if (!local) expect((await db.query<{ n: number }>("select count(*)::int n from core.role_permissions where permission_key like 'sales.%'")).rows[0].n).toBe(16);
  const fixture = readFileSync("tests/fixtures/sales-operations.sql", "utf8");
  await db.exec(local ? fixture.replace("select private.bootstrap_administrator('00000000-0000-0000-0000-000000000001');", "") : fixture);
  if (local) await owner(`insert into core.user_role_assignments(user_id,role_id,scope_type)
    select '${uid(1)}',id,'global' from core.roles where key='platform_administrator'`);
  await db.exec(readFileSync("tests/fixtures/sales-analytics.sql", "utf8"));
}, 60_000);
afterAll(async () => { await db?.close(); });

describe("VEN-03 — motor analítico", () => {
  it("administrador possui dashboard global pela composição explícita", async () => {
    await login(2);
    const expected = await dashboard();
    await login(1);
    expect(await dashboard()).toEqual(expected);
    expect((await db.query<{ scope_type: string }>("select scope_type from core.my_access() where permission='sales.dashboard.read'")).rows).toEqual([{ scope_type: "global" }]);
  });
  it("oráculo financeiro independente: 300/350, diário 250/300 e projeções 3750/4500", async () => {
    await login(2);
    for (const scope of ["stone", "combined"]) {
      const daily = sum(oracle.stone) + (scope === "combined" ? sum(oracle.pix) : 0n);
      const d = await dashboard(undefined, undefined, [A], scope);
      const m = d.months[0];
      expect(m).toMatchObject({ partial: true, status_basis: "snapshot", last_day_with_data: 2,
        total: money(daily + oracle.adjustment), daily_total: money(daily),
        projection: money(daily / oracle.last * oracle.days), adjustment_total: "50.00",
        daily_average: money((daily + oracle.adjustment) / oracle.last), reconciliation_difference: "0.00" });
      const lastPoint = d.daily.points.filter(p => p.competency === "2026-09-01").at(-1)!;
      expect(lastPoint.cumulative).toBe(money(daily));
      expect(d.summary.total).toBe(m.total);
      expect(d.payment_mix).toMatchObject({ stone: "300.00", pix: "50.00", stone_share_pct: "85.714286" });
      expect(m.comparison).toMatchObject({ available: false, reference_month: null, variation_pct: null });
      expect(d.insights.pace).toMatchObject({ projection: m.projection, is_estimate: true });
    }
  });

  it("nega anônimo, sem identidade, apenas entry.read, setor e inativo", async () => {
    for (const [n, role] of [[null, "anon"], [null, "authenticated"], [5, "authenticated"], [6, "authenticated"], [8, "authenticated"]] as const) {
      await login(n, role);
      await expect(dashboard()).rejects.toMatchObject({ code: "42501" });
    }
    await login(7); // apenas dashboard: não ganha entry.read nem CRUD.
    expect((await dashboard()).summary.total).toBe("300.00");
    await expect(create("2026-09-03", "1")).rejects.toMatchObject({ code: "42501" });
    await expect(db.exec("select public.sales_entries_list()" )).rejects.toMatchObject({ code: "42501" });
  });

  it("status histórico restrito indisponível não fabrica fechamento ou métricas", async () => {
    await login(3);
    const d = await dashboard();
    expect(d.metadata.global_status_visible).toBe(false);
    expect(d.months[0]).toMatchObject({ status_basis: "historical_unavailable", partial: null,
      is_closed: null, total: "300.00", daily_total: "250.00", last_day_with_data: 2,
      daily_average: null, projection: null, comparison: { available: false, variation_pct: null } });
    expect(d.summary).toMatchObject({ best_closed: null, daily_average: null });
  });

  it("limita período/volume e rejeita seleção proibida por inteiro", async () => {
    await login(3);
    await expect(dashboard(undefined, undefined, [A, B])).rejects.toMatchObject({ code: "42501" });
    for (const args of [
      ["2026-09-02", "2026-09-01", [A], "stone", null],
      ["2026-09-01", "2026-08-01", [A], "stone", null],
      ["2024-01-01", "2026-01-01", [A], "stone", null],
      ["2026-09-01", "2026-09-01", [], "stone", null],
      ["2026-09-01", "2026-09-01", [A], "PIX", null],
      ["2026-09-01", "2026-09-01", [A], "stone", "2026-08-01"],
      ["infinity", "infinity", [A], "stone", null],
      ["2026-09-01", "2026-09-01", Array(101).fill(A), "stone", null],
      ["2026-09-01", "2026-09-01", [null], "stone", null],
    ]) await expect(db.query("select public.sales_dashboard($1,$2,$3,$4,$5)", args)).rejects.toMatchObject({ code: "23514" });
    await login(2);
    expect((await dashboard("2023-01-01")).months).toEqual([]);
    expect((await dashboard("2023-01-01")).summary).toMatchObject({ total: "0.00", leader: null, daily_average: null });
  });

  it("usa a competência anterior disponível fora da janela e corte 30→28 sem ajuste diário", async () => {
    await login(2);
    await create("2025-02-01", "40");
    await create("2025-02-28", "60");
    await create("2025-04-01", "100");
    await create("2025-04-29", "200");
    await owner(`insert into sales.month_statuses values('2025-04-01',false,29,'synthetic',null,null,now());
      insert into sales.legacy_monthly_adjustments(competency,unit_id,payment_method,amount,reason)
      values('2025-04-01','${A}','Stone',50,'synthetic')`);
    await login(2);
    const d = await dashboard("2025-04-01");
    expect(d.months[0]).toMatchObject({ total: "350.00", projection: "310.34", daily_average: "12.07",
      comparison: { reference_month: "2025-02-01", cutoff_day: 28, current_amount: "100.00",
        reference_amount: "100.00", variation_pct: "0.000000", available: true } });
    expect(d.daily.points.filter(p => p.competency === "2025-02-01")).toHaveLength(28);
    const withGaps = await dashboard("2025-02-01", "2025-04-01");
    expect(withGaps.metadata.missing_months).toEqual(["2025-03-01"]);
  });

  it("preserva dias 28/29/30/31, bissexto e is_closed=false no último dia completo", async () => {
    await login(2);
    for (const [date, days] of [["2024-02-29", 29], ["2024-03-31", 31], ["2024-04-30", 30], ["2024-05-31", 31]] as const) {
      await create(date, "0.10");
      const month = date.slice(0, 7) + "-01";
      await owner(`insert into sales.month_statuses(competency,is_closed,last_day_with_data) values('${month}',false,${days})`);
      await login(2);
      const d = await dashboard(month);
      expect(d.months[0]).toMatchObject({ days_in_month: days, last_day_with_data: days, partial: false, is_closed: false, projection: null });
      expect(d.daily.points.filter(p => p.competency === month)).toHaveLength(days);
    }
    await create("2024-06-02", "0.29");
    expect((await dashboard("2024-06-01")).months[0]).toMatchObject({ partial: false, status_basis: "derived", days_in_month: 30 });
    await login(3);
    expect((await dashboard("2024-06-01")).months[0]).toMatchObject({ partial: null, status_basis: "historical_unavailable" });
  });

  it("corrente sem snapshot deriva apenas dados autorizados, incluindo PIX no último dia", async () => {
    const { month } = (await db.query<{ month: string }>("select to_char(timezone('America/Sao_Paulo',now()),'YYYY-MM') as month")).rows[0];
    await login(2);
    await create(`${month}-01`, "1");
    await create(`${month}-03`, "1", A, "PIX");
    await create(`${month}-20`, "999", B);
    await login(3);
    expect((await dashboard(`${month}-01`)).months[0]).toMatchObject({ status_basis: "scoped_dates", partial: true, last_day_with_data: 3, total: "1.00" });
  });

  it("sem divisor e referência zero retorna indisponível, jamais percentual fictício", async () => {
    await owner(`insert into sales.month_statuses(competency,is_closed,last_day_with_data)
      values('2023-04-01',false,0),('2023-06-01',false,0);
      insert into sales.legacy_monthly_adjustments(competency,unit_id,payment_method,amount,reason)
      values('2023-06-01','${A}','Stone',1,'synthetic')`);
    await login(2);
    const m = (await dashboard("2023-06-01")).months[0];
    expect(m).toMatchObject({ partial: true, last_day_with_data: 0, daily_average: null, projection: null,
      comparison: { reference_month: "2023-04-01", reference_amount: "0.00", variation_pct: null, available: false } });
  });

  it("snapshot fechado mantém total mensal com ajuste e comparação integral; dias reais superam snapshot", async () => {
    await login(2);
    await create("2023-08-02", "100");
    await create("2023-10-02", "200");
    await create("2023-10-10", "100");
    await owner(`insert into sales.month_statuses(competency,is_closed,last_day_with_data)
      values('2023-08-01',true,2),('2023-10-01',true,2);
      insert into sales.legacy_monthly_adjustments(competency,unit_id,payment_method,amount,reason)
      values('2023-08-01','${A}','Stone',100,'synthetic'),('2023-10-01','${A}','Stone',100,'synthetic')`);
    await login(2);
    const d = await dashboard("2023-10-01");
    expect(d.months[0]).toMatchObject({ total: "400.00", daily_total: "300.00", partial: false,
      last_day_with_data: 10, daily_average: "12.90", projection: null,
      comparison: { reference_month: "2023-08-01", cutoff_day: null, current_amount: "400.00",
        reference_amount: "200.00", variation_pct: "100.000000", trend: "up" } });
    expect(d.daily.totals.filter(p => p.competency === "2023-10-01").at(-1)?.cumulative).toBe("300.00");
  });

  it("centavos exatos, soma de muitos centavos, exclusão e correção VEN-02 imediatas", async () => {
    await login(2);
    for (let day = 1; day <= 31; day++) await create(`2024-07-${String(day).padStart(2, "0")}`, "0.01");
    await create("2024-07-01", "0.10", A, "PIX");
    const edited = await create("2024-07-02", "0.29", A, "PIX");
    expect((await dashboard("2024-07-01", undefined, [A], "combined")).summary.total).toBe(money(31n + 10n + 29n));
    await db.query("select public.sales_entry_update($1,1,$2,$3,'PIX','0.01')", [edited.id, edited.sale_date, A]);
    expect((await dashboard("2024-07-01", undefined, [A], "combined")).summary.total).toBe("0.42");
    await db.query("select public.sales_entry_delete($1,2)", [edited.id]);
    expect((await dashboard("2024-07-01", undefined, [A], "combined")).summary.total).toBe("0.41");
    expect((await dashboard("2024-07-01")).summary.total).toBe("0.31");
  });

  it("ranking, desempate UUID, matriz e insights determinísticos com unidades inativas/sem movimento", async () => {
    await login(2);
    for (const [date, amount] of [["2024-08-01", "10"], ["2024-09-01", "20"], ["2024-10-01", "5"]]) {
      await create(date, amount, A); await create(date, amount, B);
    }
    await owner(`update core.units set active=false where id='${B}'`);
    await login(2);
    const d = await dashboard("2024-08-01", "2024-10-01", [A, B, C]);
    expect(d.ranking.map(r => r.unit_id)).toEqual([A, B]);
    expect(d.ranking.map(r => r.share_pct)).toEqual(["50.000000", "50.000000"]);
    expect(d.summary).toMatchObject({ total: "70.00", top_two_share_pct: "100.000000", best_closed: { competency: "2024-09-01" } });
    expect(d.insights).toMatchObject({ strongest_advance: { competency: "2024-09-01", comparison: { variation_pct: "100.000000" } },
      largest_decline: { competency: "2024-10-01", comparison: { variation_pct: "-75.000000" } } });
    expect(d.unit_months).toHaveLength(9);
    expect(d.unit_months.filter(r => r.unit_id === C).every(r => r.total === "0.00")).toBe(true);
    expect(d.units.find(u => u.id === B)?.active).toBe(false);
    expect(d.unit_months.find(r => r.competency === "2024-09-01" && r.unit_id === A)?.intensity).toBe("1.000000");
    expect((await dashboard("2024-08-01", "2024-10-01", [A, B, C]))).toEqual(d);
    await owner(`update core.units set active=true where id='${B}'`);
  });

  it("não interferência: dados/status globais de B não mudam nenhuma saída de A", async () => {
    await login(3);
    const before = await dashboard("2024-01-01", "2024-12-01", null);
    await login(9);
    await create("2024-01-28", "999999999999.99", B, "PIX");
    await create("2024-08-29", "999999999999.99", B);
    await owner(`insert into sales.month_statuses(competency,is_closed,last_day_with_data)
      values('2024-01-01',true,31),('2024-08-01',false,30)`);
    await login(3);
    expect(await dashboard("2024-01-01", "2024-12-01", null)).toEqual(before);
    expect(JSON.stringify(before)).not.toContain(B);
    await expect(dashboard("2024-08-01", undefined, [B])).rejects.toMatchObject({ code: "42501" });
    await login(9);
    const b = await dashboard("2024-01-01", "2024-12-01", [B]);
    expect(JSON.stringify(b)).not.toContain(A);
  });

  it("revogação de atribuição, catálogo, papel/capacidade e perfil inativo negam na próxima leitura", async () => {
    for (const [sql, undo] of [
      [`update core.user_role_assignments set active=false where user_id='${uid(3)}'`, `update core.user_role_assignments set active=true where user_id='${uid(3)}'`],
      ["update core.permissions set active=false where key='sales.dashboard.read'", "update core.permissions set active=true where key='sales.dashboard.read'"],
      ["update core.roles set active=false where key='ven02_operator'", "update core.roles set active=true where key='ven02_operator'"],
      [`update core.profiles set active=false where id='${uid(3)}'`, `update core.profiles set active=true where id='${uid(3)}'; update core.user_role_assignments set active=true where user_id='${uid(3)}'`],
      ["delete from core.role_permissions where role_id='30000000-0000-0000-0000-000000000001' and permission_key='sales.dashboard.read'",
        "insert into core.role_permissions(role_id,permission_key) values('30000000-0000-0000-0000-000000000001','sales.dashboard.read')"],
    ]) {
      await owner(sql); await login(3);
      await expect(dashboard()).rejects.toMatchObject({ code: "42501" });
      await owner(undo); await login(3);
      expect((await dashboard()).summary.total).toBe("300.00");
    }
  });

  it("tabelas/helpers privados; SECURITY DEFINER com search_path fixo e grants mínimos", async () => {
    await login(3);
    for (const sql of ["select * from sales.entries", "select * from sales.month_statuses", "select sales_private.money(1)", "select sales_private.comparison(null,1,1,1)"])
      await expect(db.exec(sql)).rejects.toMatchObject({ code: "42501" });
    await owner("reset role");
    const result = (await db.query(`select prosecdef,proconfig,has_function_privilege('anon',oid,'execute') anon,
      has_function_privilege('authenticated',oid,'execute') authenticated from pg_proc
      where oid='public.sales_dashboard(date,date,uuid[],text,date)'::regprocedure`)).rows[0];
    expect(result).toMatchObject({ prosecdef: true, anon: false, authenticated: true });
    expect(result.proconfig).toContain('search_path=""');
  });
});
