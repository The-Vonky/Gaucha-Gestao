import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STORAGE_STUB } from "./storage-stub";
import type { HistoryReport, InspectionReport, ReportInspection } from "../apps/web/src/modules/audit/reporting/types";

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const A = "10000000-0000-0000-0000-000000000001";
const B = "10000000-0000-0000-0000-000000000002";
let db: PGlite;
let inspectionA: string;
let inspectionB: string;

async function as(user: number, role = "authenticated") {
  await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id(user)}',false);`);
}
async function report(name: string, args: unknown[]) {
  const params = args.map((_, i) => `$${i + 1}`).join(",");
  return (await db.query<{ report: (InspectionReport & HistoryReport) | null }>(`select audit.${name}(${params}) report`, args)).rows[0].report;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(STORAGE_STUB);
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) select
    ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid, n || '@example.test', now()
    from generate_series(1,9) n;
    select private.bootstrap_administrator('${id(1)}');
    insert into core.units(id,code,name) values ('${A}','A','Unidade Á'),('${B}','B','Unidade B');
    insert into core.roles(key,name) values ('report-read','Read'),('report-export','Export'),('report-both','Both');
    insert into core.role_permissions select id,'audit.inspection.read' from core.roles where key in ('report-read','report-both');
    insert into core.role_permissions select id,'audit.inspection.export' from core.roles where key in ('report-export','report-both');
    insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
      select '${id(2)}',id,'unit','${A}' from core.roles where key='report-both';
    insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
      select '${id(3)}',id,'unit','${A}' from core.roles where key='report-read';
    insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
      select '${id(4)}',id,'unit','${A}' from core.roles where key='report-export';
    insert into core.user_role_assignments(user_id,role_id,scope_type)
      select '${id(5)}',id,'global' from core.roles where key='report-read';
    insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
      select '${id(5)}',id,'unit','${A}' from core.roles where key='report-export';
    insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
      select '${id(6)}',id,'unit','${A}' from core.roles where key='report-read';
    insert into core.user_role_assignments(user_id,role_id,scope_type)
      select '${id(6)}',id,'global' from core.roles where key='report-export';
    insert into core.sectors(id,code,name) values ('20000000-0000-0000-0000-000000000001','S','Setor');
    insert into core.unit_sectors values ('${A}','20000000-0000-0000-0000-000000000001');
    insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id)
      select '${id(7)}',id,'sector','${A}','20000000-0000-0000-0000-000000000001' from core.roles where key='report-both';
    insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id)
      select '${id(8)}',id,'unit','${A}' from core.roles where key='report-both';
    update core.profiles set active=false where id='${id(8)}';`);
  await as(1);
  inspectionA = (await db.query<{ id: string }>("select audit.create_inspection($1,'2026-09-01') id", [A])).rows[0].id;
  inspectionB = (await db.query<{ id: string }>("select audit.create_inspection($1,'2026-09-02') id", [B])).rows[0].id;
}, 60000);
afterAll(async () => { await db?.close(); });

describe.sequential("Audit reporting RPCs", () => {
  it("returns the complete ordered draft with undefined score", async () => {
    await as(2);
    const data = await report("inspection_export", [inspectionA]);
    expect(data?.schema_version).toBe(1);
    expect(data?.unit).toMatchObject({ id: A, code: "A", name: "Unidade Á" });
    expect(data?.inspection).toMatchObject({ id: inspectionA, status: "draft", score: null, classification: null });
    expect(data?.inspection.counts).toMatchObject({ total: 158, answered: 0, unanswered: 158 });
    expect(data?.sections).toHaveLength(9);
    expect(data?.sections.flatMap((section) => section.items)).toHaveLength(158);
    expect(data?.sections.flatMap((section) => section.items).map((item) => item.number)).not.toContain(32);
    expect(data?.sections[0].items[0]).toMatchObject({ key: "item-001", response: null, observation: "", version: 1 });
  });
  it("requires read and export on the same unit, without ID enumeration", async () => {
    for (const n of [3, 4, 7, 8, 9]) {
      await as(n);
      await expect(report("inspection_export", [inspectionA])).rejects.toThrow(/Forbidden/);
      await expect(report("unit_history_export", [A, null, null])).rejects.toThrow(/Forbidden/);
    }
    await as(2);
    for (const target of [inspectionB, id(999)])
      await expect(report("inspection_export", [target])).rejects.toThrow(/Forbidden/);
    for (const target of [B, id(999)])
      await expect(report("unit_history_export", [target, null, null])).rejects.toThrow(/Forbidden/);
    await as(2, "anon");
    await expect(report("inspection_export", [inspectionA])).rejects.toThrow();
    await as(5);
    expect((await report("inspection_export", [inspectionA]))?.inspection.id).toBe(inspectionA);
    await as(6);
    expect((await report("unit_history_export", [A, null, null]))?.record_count).toBe(1);
  });
  it("returns inclusive filtered history and rechecks grants per request", async () => {
    await as(2);
    const data = await report("unit_history_export", [A, "2026-09-01", "2026-09-01"]);
    expect(data?.record_count).toBe(1);
    expect(data?.filters).toEqual({ from: "2026-09-01", to: "2026-09-01" });
    expect(data?.records[0]).toMatchObject({ id: inspectionA, score: null, delta_pp: null });
    expect((await report("unit_history_export", [A, "2026-09-02", null]))?.records).toEqual([]);
    await db.exec("reset role");
    await db.query("update core.user_role_assignments set active=false where user_id=$1", [id(2)]);
    await as(2);
    await expect(report("inspection_export", [inspectionA])).rejects.toThrow(/Forbidden/);
  });
  it("preserves Unicode, multiline observations, scores and lifecycle", async () => {
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);");
    await db.query("update audit.inspection_answers set response='AP',observation=$2 where inspection_id=$1 and item_key='item-001'", [inspectionB, "=SUM(1,2)\nÁgua <script>alert(1)</script> 😀"]);
    await as(1);
    let data = await report("inspection_export", [inspectionB]);
    expect(data?.inspection.counts).toMatchObject({ ap: 1, unanswered: 157, applicable: 1 });
    expect(data?.inspection.score).toBe(50);
    expect(data?.inspection.classification).toBeNull();
    expect(data?.sections[0].items[0].observation).toBe("=SUM(1,2)\nÁgua <script>alert(1)</script> 😀");
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);");
    await db.query("update audit.inspection_answers set response='AT' where inspection_id=$1 and response is null", [inspectionB]);
    await as(1);
    await db.query("select audit.finalize_inspection($1,1)", [inspectionB]);
    data = await report("inspection_export", [inspectionB]);
    expect(data?.inspection).toMatchObject({ status: "finalized", classification: "adequate", score: 15750 / 158 });
    expect(data?.inspection.counts).toMatchObject({ at: 157, ap: 1, unanswered: 0 });
    expect(data?.inspection.finalized_by).toBe(id(1));
    await db.query("select audit.reopen_inspection($1,2)", [inspectionB]);
    data = await report("inspection_export", [inspectionB]);
    expect(data?.inspection).toMatchObject({ status: "draft", classification: null, finalized_at: null });
    expect(data?.inspection.score).toBe(15750 / 158);
  });
  it("keeps all NAP undefined and uses unrounded classification thresholds", async () => {
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);");
    await db.query("update audit.inspection_answers set response='NAP' where inspection_id=$1", [inspectionB]);
    await as(1);
    await db.query("select audit.finalize_inspection($1,3)", [inspectionB]);
    let data = await report("inspection_export", [inspectionB]);
    expect(data?.inspection).toMatchObject({ status: "finalized", score: null, classification: null });
    expect(data?.inspection.counts).toMatchObject({ nap: 158, applicable: 0, unanswered: 0 });
    for (const [atCount, expected] of [[80, "inadequate"], [81, "partial"], [120, "partial"], [121, "adequate"]] as const) {
      await as(1);
      const next = (await db.query<{ id: string }>("select audit.create_inspection($1,'2026-09-03') id", [B])).rows[0].id;
      await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);");
      await db.query(`update audit.inspection_answers a set response=case when c.position<=$2 then 'AT' else 'NAT' end
        from audit.checklist_items c where a.inspection_id=$1 and c.key=a.item_key and c.template_version=a.template_version`, [next, atCount]);
      await as(1);
      await db.query("select audit.finalize_inspection($1,1)", [next]);
      data = await report("inspection_export", [next]);
      expect(data?.inspection.classification).toBe(expected);
      expect(data?.inspection.score).toBe(100 * atCount / 158);
    }
    const history = await report("unit_history_export", [B, "2026-09-03", "2026-09-03"]);
    expect(history?.record_count).toBe(4);
    expect(history?.records.at(-1)?.delta_pp).toBeNull();
    for (let i = 0; i < 3; i++)
      expect(history?.records[i].delta_pp).toBeCloseTo(history!.records[i].score! - history!.records[i + 1].score!, 8);
  });
  it("returns 5000 rows in a deterministic order and rejects 5001", async () => {
    await db.exec("reset role");
    await db.query(`insert into audit.inspections(unit_id,template_version,applied_on,responsible_id,created_at)
      select $1,'checklist-geral-2026-09-22-v1','2026-09-01',$2,'2026-09-01T12:00:00Z'
      from generate_series(1,4999)`, [A, id(1)]);
    await as(1);
    const started = performance.now();
    const data = await report("unit_history_export", [A, "2026-09-01", "2026-09-01"]);
    expect(data?.record_count).toBe(5000);
    expect(data?.records).toHaveLength(5000);
    const ordered = [...data!.records].sort((a: ReportInspection, b: ReportInspection) =>
      b.applied_on.localeCompare(a.applied_on) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    expect(data?.records.map((record) => record.id)).toEqual(ordered.map((record) => record.id));
    console.info(`Reporting 5000 PGlite: ${Math.round(performance.now() - started)}ms, ${JSON.stringify(data).length} JSON bytes`);
    await db.exec("reset role");
    await db.query("insert into audit.inspections(unit_id,template_version,applied_on,responsible_id) values($1,'checklist-geral-2026-09-22-v1','2026-09-01',$2)", [A, id(1)]);
    await as(1);
    await expect(report("unit_history_export", [A, null, null])).rejects.toThrow(/Narrow the date range/);
    expect((await report("unit_history_export", [A, "2026-09-02", null]))?.record_count).toBe(0);
  }, 60000);
});
