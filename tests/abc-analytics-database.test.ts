import { Postgres } from "./integration/postgres.mjs";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STORAGE_STUB } from "./storage-stub";
import { contentHash } from "../apps/web/src/modules/abc/import/contentHash";
import { sum as decimalSum } from "../apps/web/src/modules/abc/import/decimal";
import type { ReportLine, ReportPayload } from "../apps/web/src/modules/abc/types";

// Analytics read model (20261021120000_abc_analytics_read_v1.sql): exact math, comparison rules
// and the same unit scope as the v1 read functions. Runs on PGlite or ABC_TEST_DATABASE_URL.
let db: PGlite;
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const users = { admin: uid(1), publisherA: uid(3), viewerA: uid(4), sectorA: uid(5), quality: uid(6), empty: uid(7), inactive: uid(8), publisherB: uid(9) };
const A = "10000000-0000-0000-0000-000000000001";
const B = "10000000-0000-0000-0000-000000000002";
const S = "20000000-0000-0000-0000-000000000001";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function login(id: string) {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`);
}
async function one<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows[0];
}
async function failure(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code;
  }
  throw new Error("expected failure");
}
let sha = 0;
async function publish(unit: string, code: string, month: string, lines: Partial<ReportLine>[], basis: "NET_PERIOD" | "GROSS_PERIOD" = "NET_PERIOD",
  version = 0, reason: string | null = null) {
  const hash = (++sha).toString(16).padStart(64, "0");
  const f = await one<{ file_id: string; object_key: string }>("select * from abc.begin_source_upload($1,'curva.xlsx',$2,1000)", [unit, hash]);
  const me = await one<{ sub: string }>("select current_setting('request.jwt.claim.sub',true) sub");
  await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('abc-source-files',$1,$2,$3)", [f.object_key, me.sub, { size: 1000, mimetype: XLSX }]);
  await db.query("select abc.confirm_source_upload($1)", [f.file_id]);
  const full: ReportLine[] = lines.map((l, i) => ({
    line_no: i + 1, code: l.code!, name: l.name ?? `Produto ${l.code}`, unit: l.unit ?? "KG", quantity: l.quantity!, unit_cost: l.unit_cost ?? "0",
    total: l.total!, source_share: null, erp_class: null, sheet: "Curva ABC Geral (Realizado)", row: i + 7,
  }));
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const draft: Omit<ReportPayload, "content_hash"> = {
    unit_code: code, period_start: `${month}-01`, period_end: `${month}-${last}`, cost_basis: basis,
    cost_basis_text: basis === "NET_PERIOD" ? "Custo Médio Líquido da Época" : "Custo Médio Bruto da Época",
    declared_total: decimalSum(full.map((l) => l.total)), subtotals: [], parser_version: "erp-curva-realizado-v1", file_sha256: hash, warnings: [], lines: full,
  };
  const payload = { ...draft, content_hash: await contentHash(draft) };
  return (await one<{ id: string }>("select abc.publish_revision($1,$2,$3,$4,true) id", [f.file_id, payload, version, reason])).id;
}
const json = async <T,>(sql: string, params: unknown[]) => (await one<{ j: T }>(`select ${sql} j`, params)).j;

type Item = { code: string; status: string; alert: boolean; unit_variation: string | null; total_delta: string | null; total_variation: string | null;
  price_effect: string | null; quantity_effect: string | null; base: { avg_cost: string | null } | null; current: { avg_cost: string | null } | null };
type Compare = { total_delta: string; total_variation: string; items: Item[]; summary: {
  counts: Record<string, number>; bridge: Record<string, string>; common_basket: { items: number; index: string };
  by_base_class: { class: string; count: number; delta: string }[] } };

beforeAll(async () => {
  db = process.env.ABC_TEST_DATABASE_URL ? (new Postgres(process.env.ABC_TEST_DATABASE_URL) as unknown as PGlite) : new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
 create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}', last_sign_in_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(STORAGE_STUB);
  for (const file of readdirSync("supabase/migrations").sort()) await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  const values = Object.values(users).map((id) => `('${id}','${id}@example.test',now())`).join(",");
  const assign = (user: string, key: string, scope: string, unit: string | null = null, sector: string | null = null) =>
    `insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select '${user}',id,'${scope}',${unit ? `'${unit}'` : "null"},${sector ? `'${sector}'` : "null"} from core.roles where key='${key}';`;
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ${values};
 select private.bootstrap_administrator('${users.admin}');
 insert into core.units(id,code,name) values ('${A}','A','Unit A'),('${B}','B','Unit B');
 insert into core.sectors(id,code,name) values ('${S}','S','Sector S');
 insert into core.unit_sectors values ('${A}','${S}');
 ${assign(users.publisherA, "costs", "unit", A)}
 ${assign(users.publisherB, "costs", "unit", B)}
 ${assign(users.viewerA, "costs_viewer", "unit", A)}
 ${assign(users.sectorA, "costs", "sector", A, S)}
 ${assign(users.quality, "quality", "global")}
 ${assign(users.inactive, "costs", "global")}
 update core.profiles set active=false where id='${users.inactive}';`);

  await login(users.publisherA);
  // June → July, NET. Base total 1076; current 1074.
  await publish(A, "A", "2026-06", [
    { code: "X1", quantity: "100", unit_cost: "10", total: "1000" },
    { code: "X2", unit: "UN", quantity: "10", unit_cost: "5", total: "50" },
    { code: "X3", quantity: "5", unit_cost: "5", total: "25" },
    { code: "X5", quantity: "0", total: "0" },
    { code: "X6", quantity: "1", unit_cost: "1", total: "1" },
  ]);
  await publish(A, "A", "2026-07", [
    { code: "X1", quantity: "80", unit_cost: "12", total: "960" },
    { code: "X2", unit: "L", quantity: "10", unit_cost: "6", total: "60" },
    { code: "X4", quantity: "4", unit_cost: "10", total: "40" },
    { code: "X5", quantity: "3", unit_cost: "3", total: "9" },
    { code: "X6", quantity: "1", unit_cost: "5", total: "5" },
  ]);
  // GROSS: thirds force rounded average costs; LT and L are the same unit.
  await publish(A, "A", "2026-06", [{ code: "T1", unit: "LT", quantity: "3", unit_cost: "0.3333333333", total: "1" }, { code: "001", quantity: "1", unit_cost: "2", total: "2" }], "GROSS_PERIOD");
  await publish(A, "A", "2026-07", [{ code: "T1", unit: "L", quantity: "3", unit_cost: "0.6666666667", total: "2" }, { code: "1", quantity: "1", unit_cost: "2", total: "2" }], "GROSS_PERIOD");
  // A superseded July revision keeps history; the current one is the replacement.
  await publish(A, "A", "2026-08", [{ code: "X1", quantity: "1", unit_cost: "1", total: "1" }]);
  await publish(A, "A", "2026-08", [{ code: "X1", quantity: "2", unit_cost: "1", total: "2" }], "NET_PERIOD", 1, "Reexportado do ERP");
  // Edge cases (GROSS, Jan → Feb): exact down/unchanged, UND≡UN, zero base cost, tiny divisor.
  await publish(A, "A", "2026-01", [
    { code: "D1", quantity: "10", unit_cost: "10", total: "100" },
    { code: "U1", quantity: "2", unit_cost: "2", total: "4" },
    { code: "N1", unit: "UND", quantity: "1", unit_cost: "3", total: "3" },
    { code: "Z1", quantity: "5", unit_cost: "0", total: "0" },
    { code: "M1", quantity: "1", unit_cost: "0.00000000000000001", total: "0.00000000000000001" },
  ], "GROSS_PERIOD");
  await publish(A, "A", "2026-02", [
    { code: "D1", quantity: "10", unit_cost: "5", total: "50" },
    { code: "U1", quantity: "2", unit_cost: "2", total: "4" },
    { code: "N1", unit: "UN", quantity: "1", unit_cost: "3", total: "3" },
    { code: "Z1", quantity: "5", unit_cost: "1.4", total: "7" },
    { code: "M1", quantity: "0.00000000000001", unit_cost: "1", total: "0.00000000000001" },
  ], "GROSS_PERIOD");
  await login(users.publisherB);
  await publish(B, "B", "2026-06", [{ code: "X1", quantity: "1", unit_cost: "999", total: "999" }]);
}, 60000);
afterAll(async () => {
  await db?.close();
});

describe("Curva ABC analytics read model", { concurrent: false }, () => {
  it("compares two competencies with exact variations, statuses and a closed bridge", async () => {
    await login(users.viewerA);
    const c = await json<Compare>("abc.compare($1,'NET_PERIOD','2026-06-01','2026-07-01')", [A]);
    const by = Object.fromEntries(c.items.map((i) => [i.code, i]));
    expect(c.total_delta).toBe("-2");
    // (1074 − 1076) / 1076 = −0.18587360594795539033…%
    expect(c.total_variation).toBe("-0.18587360594795539033");
    // Origin example: 100 KG × R$ 10 → 80 KG × R$ 12: average cost +20%, total −4%, price +160, quantity −200.
    expect(by.X1).toMatchObject({ status: "up", unit_variation: "20", total_delta: "-40", total_variation: "-4", price_effect: "160", quantity_effect: "-200", alert: false });
    expect(by.X2).toMatchObject({ status: "not_comparable", unit_variation: null, price_effect: null, total_delta: "10" });
    expect(by.X3).toMatchObject({ status: "absent", current: null, total_delta: null });
    expect(by.X4).toMatchObject({ status: "new", base: null, total_delta: null });
    // Zero base quantity: no average cost and no percentage (never a division by zero).
    expect(by.X5).toMatchObject({ status: "not_comparable", unit_variation: null, total_variation: null });
    expect(by.X5.base?.avg_cost).toBeNull();
    expect(by.X6).toMatchObject({ status: "up", unit_variation: "400", alert: true });
    expect(c.summary.counts).toEqual({ base: 5, current: 5, up: 2, down: 0, unchanged: 0, new: 1, absent: 1, not_comparable: 2, alerts: 1 });
    expect(c.summary.bridge).toEqual({ price_effect: "164", quantity_effect: "-200", new: "40", absent: "-25", not_comparable: "19", residual: "0" });
    // 100·(965 / (10·80 + 1·1) − 1)
    expect(c.summary.common_basket.items).toBe(2);
    expect(c.summary.common_basket.index.startsWith("20.4744069912609238")).toBe(true);
  });

  it("matches products only by exact code, merges LT/L and closes the bridge despite rounded averages", async () => {
    await login(users.publisherA);
    const c = await json<Compare>("abc.compare($1,'GROSS_PERIOD','2026-06-01','2026-07-01')", [A]);
    const by = Object.fromEntries(c.items.map((i) => [i.code, i]));
    expect(by["001"].status).toBe("absent");
    expect(by["1"].status).toBe("new");
    expect(by.T1).toMatchObject({ status: "up", unit_variation: "100" });
    expect(by.T1.base?.avg_cost).toBe("0.33333333333333333333");
    expect(by.T1.current?.avg_cost).toBe("0.66666666666666666667");
    // Displayed averages are rounded to 20 places, but effects use one division and close exactly.
    expect(by.T1).toMatchObject({ price_effect: "1", quantity_effect: "0" });
    expect(c.summary.bridge.residual).toBe("0");
  });

  it("handles exact direction, UND≡UN, zero base cost and a divisor below 1e-30 without errors", async () => {
    await login(users.viewerA);
    const c = await json<Compare>("abc.compare($1,'GROSS_PERIOD','2026-01-01','2026-02-01')", [A]);
    const by = Object.fromEntries(c.items.map((i) => [i.code, i]));
    expect(by.D1).toMatchObject({ status: "down", unit_variation: "-50", alert: false });
    expect(by.U1).toMatchObject({ status: "unchanged", unit_variation: "0", price_effect: "0", quantity_effect: "0" });
    expect(by.N1.status).toBe("unchanged");
    // Base cost zero, current positive: no percentage exists, so it is flagged for review.
    expect(by.Z1).toMatchObject({ status: "up", unit_variation: null, alert: true });
    // (1e-14 − 1e-31)·100 / 1e-31 = 1e19 − 100. T0·Q1 = 1e-31: the old cast rounded it to zero and raised division_by_zero.
    expect(by.M1).toMatchObject({ status: "up", unit_variation: "9999999999999999900", alert: true });
    expect(c.summary.counts).toMatchObject({ down: 1, unchanged: 2, up: 2, alerts: 2 });
    expect(c.summary.bridge.residual).toBe("0");
    await db.exec("reset role");
    expect(await json<string>("abc_private.ratio(2,0.0000000000000000000000000000014)::text", [])).toBe("1428571428571428571428571428571.42857142857142857143");
  });

  it("rejects equal or unpublished competencies with stable codes", async () => {
    await login(users.viewerA);
    expect(await failure(db.query("select abc.compare($1,'NET_PERIOD','2026-06-01','2026-06-01')", [A]))).toBe("23514");
    expect(await failure(db.query("select abc.compare($1,'NET_PERIOD','2026-06-01','2026-01-01')", [A]))).toBe("P0002");
    expect(await failure(db.query("select abc.overview($1,'CURRENT')", [A]))).toBe("23514");
  });

  it("summarizes the unit's competencies by calculated class", async () => {
    await login(users.viewerA);
    const o = await json<{ bases: string[]; competencies: { competency: string; calculated_total: string; revision_number: number;
      classes: { class: string; count: number; total: string; share: string }[]; unclassified: number }[] }>("abc.overview($1,'NET_PERIOD')", [A]);
    expect(o.bases.sort()).toEqual(["GROSS_PERIOD", "NET_PERIOD"]);
    expect(o.competencies.map((c) => [c.competency, c.calculated_total, c.revision_number])).toEqual([["2026-06-01", "1076", 1], ["2026-07-01", "1074", 1], ["2026-08-01", "2", 2]]);
    // June: X1 (A, 1000 = 92.94%), X2 (B, starts at 92.9%… → C), X3, X6 C; X5 total zero → unclassified.
    const june = o.competencies[0];
    expect(june.classes.map((k) => [k.class, k.count, k.total])).toEqual([["A", 1, "1000"], ["B", 0, "0"], ["C", 3, "76"]]);
    expect(june.classes[0].share).toBe("92.93680297397769516729");
    expect(june.unclassified).toBe(1);
  });

  it("lists a competency's products with rank, cumulative share, ERP×calculated matrix and units", async () => {
    await login(users.viewerA);
    const p = await json<{ revision: { number: number }; lines: { rank: number; code: string; cumulative_share: string | null; avg_cost: string | null }[];
      summary: { matrix: { erp_class: string | null; calculated_class: string | null; count: number }[]; units: { unit: string; count: number; total: string }[] } }>(
      "abc.competency_products($1,'NET_PERIOD','2026-07-01')", [A]);
    expect(p.lines.map((l) => [l.rank, l.code])).toEqual([[1, "X1"], [2, "X2"], [3, "X4"], [4, "X5"], [5, "X6"]]);
    expect(p.lines[0].cumulative_share).toBe("0");
    expect(p.lines[1].cumulative_share).toBe("89.38547486033519553073");
    expect(p.lines[0].avg_cost).toBe("12");
    // X1 starts at 0% (A); X2 at 960/1074 = 89.4% (B); X4, X5, X6 at ≥ 94.9% (C).
    expect(p.summary.matrix).toEqual([{ erp_class: null, calculated_class: "A", count: 1, total: "960" },
      { erp_class: null, calculated_class: "B", count: 1, total: "60" }, { erp_class: null, calculated_class: "C", count: 3, total: "54" }]);
    expect(p.summary.units.map((u) => [u.unit, u.count, u.total])).toEqual([["KG", 4, "1014"], ["L", 1, "60"]]);
  });

  it("returns a product's history across competencies by exact code", async () => {
    await login(users.viewerA);
    const h = await json<{ competency: string; total: string; revision_number: number }[]>("abc.product_history($1,'NET_PERIOD','X1')", [A]);
    expect(h.map((x) => [x.competency, x.total, x.revision_number])).toEqual([["2026-06-01", "1000", 1], ["2026-07-01", "960", 1], ["2026-08-01", "2", 2]]);
    expect(await json<unknown[]>("abc.product_history($1,'NET_PERIOD','x1')", [A])).toEqual([]);
  });

  it("lists current and superseded revisions with author and reason", async () => {
    await login(users.viewerA);
    const r = await json<{ competency: string; number: number; current: boolean; reason: string | null; line_count: number }[]>("abc.unit_revisions($1)", [A]);
    const august = r.filter((x) => x.competency === "2026-08-01").map((x) => [x.number, x.current, x.reason]);
    expect(august).toEqual([[2, true, "Reexportado do ERP"], [1, false, null]]);
    expect(r).toHaveLength(8);
  });

  it("denies every analytics function outside the reader's unit scope", async () => {
    const calls: [string, unknown[]][] = [
      ["abc.overview($1,'NET_PERIOD')", [A]],
      ["abc.compare($1,'NET_PERIOD','2026-06-01','2026-07-01')", [A]],
      ["abc.competency_products($1,'NET_PERIOD','2026-07-01')", [A]],
      ["abc.product_history($1,'NET_PERIOD','X1')", [A]],
      ["abc.unit_revisions($1)", [A]],
    ];
    for (const who of [users.publisherB, users.sectorA, users.quality, users.empty, users.inactive])
      for (const [sql, params] of calls) {
        await login(who);
        expect(await failure(db.query(`select ${sql}`, params)), `${who} ${sql}`).toBe("42501");
      }
    // Reading the other unit's own data still works for its publisher.
    await login(users.publisherB);
    expect((await json<{ competencies: unknown[] }>("abc.overview($1,'NET_PERIOD')", [B])).competencies).toHaveLength(1);
    await db.exec("reset role; set role anon;");
    for (const [sql, params] of calls) expect(await failure(db.query(`select ${sql}`, params)), `anon ${sql}`).toBe("42501");
    // Private helpers are not callable directly by API roles.
    await login(users.viewerA);
    for (const helper of ["abc_private.ratio(1,2)", "abc_private.unit_key('LT')", `abc_private.class_summary('${A}',1)`])
      expect(await failure(db.query(`select ${helper}`)), helper).toBe("42501");
  });
});
