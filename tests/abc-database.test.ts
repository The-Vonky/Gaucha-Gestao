import { Postgres } from "./integration/postgres.mjs";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STORAGE_STUB } from "./storage-stub";
import { contentHash } from "../apps/web/src/modules/abc/import/contentHash";
import { buildPayload, parseReport } from "../apps/web/src/modules/abc/import/parser";
import { erpWorkbook, syntheticProducts } from "./abc-erp-workbook.mjs";
import { JSDOM } from "jsdom";

// The browser parser needs DOMParser; this suite runs in Node for PGlite/PostgreSQL.
globalThis.DOMParser ??= new JSDOM().window.DOMParser;
import { sum as decimalSum } from "../apps/web/src/modules/abc/import/decimal";
import type { ReportLine, ReportPayload } from "../apps/web/src/modules/abc/types";

let db: PGlite;
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const users = {
  admin: uid(1),
  global: uid(2),
  publisherA: uid(3),
  viewerA: uid(4),
  sectorA: uid(5),
  quality: uid(6),
  empty: uid(7),
  inactive: uid(8),
  publisherB: uid(9),
};
const A = "10000000-0000-0000-0000-000000000001";
const B = "10000000-0000-0000-0000-000000000002";
const C = "10000000-0000-0000-0000-000000000003";
const S = "20000000-0000-0000-0000-000000000001";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function login(id: string) {
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`);
}
async function one<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows[0];
}
async function owner<T>(sql: string, params: unknown[] = []) {
  const who = await one<{ sub: string; role: string }>(
    "select current_setting('request.jwt.claim.sub',true) sub, current_user::text as role",
  );
  await db.exec("reset role");
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    if (who.role !== "postgres") await login(who.sub);
  }
}
async function failure(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; message: string };
    return { code: err.code, message: err.message };
  }
  throw new Error("expected failure");
}

let sha = 0;
async function readyFile(unit: string, opts: { sha?: string } = {}) {
  const hash = opts.sha ?? (++sha).toString(16).padStart(64, "0");
  const f = await one<{ file_id: string; object_key: string }>(
    "select * from abc.begin_source_upload($1,'curva.xlsx',$2,1000)",
    [unit, hash],
  );
  const me = await one<{ sub: string }>("select current_setting('request.jwt.claim.sub',true) sub");
  await db.query(
    "insert into storage.objects(bucket_id,name,owner_id,metadata) values('abc-source-files',$1,$2,$3)",
    [f.object_key, me.sub, { size: 1000, mimetype: XLSX }],
  );
  await db.query("select abc.confirm_source_upload($1)", [f.file_id]);
  return { id: f.file_id, sha: hash, key: f.object_key };
}

function line(n: number, code: string, total: string, erp: "A" | "B" | "C" | null = "A"): ReportLine {
  return {
    line_no: n, code, name: `Produto ${code}`, unit: "KG",
    quantity: "1", unit_cost: total, total, source_share: null, erp_class: erp,
    sheet: "Curva ABC Geral (Realizado)", row: n + 3,
  };
}
type Draft = Omit<ReportPayload, "content_hash">;
function report(fileSha: string, over: Partial<Draft> = {}): Draft {
  const lines = over.lines ?? [line(1, "1.01.001", "50"), line(2, "1.01.002", "25"), line(3, "1.01.003", "15", "B"), line(4, "1.01.004", "10", "C")];
  const sum = (c: string) => decimalSum(lines.filter((l) => l.erp_class === c).map((l) => l.total));
  return {
    unit_code: "A", period_start: "2026-07-01", period_end: "2026-07-31",
    cost_basis: "NET_PERIOD", cost_basis_text: "Custo Médio Líquido da Época",
    declared_total: "100",
    subtotals: (["A", "B", "C"] as const).filter((c) => lines.some((l) => l.erp_class === c)).map((c) => ({ class: c, total: sum(c) })),
    parser_version: "erp-curva-realizado-v1", file_sha256: fileSha, warnings: [],
    ...over, lines,
  };
}
async function publish(file: string, draft: Draft, version = 0, reason: string | null = null, accept = false, hash?: string) {
  const payload = { ...draft, content_hash: hash ?? (await contentHash(draft)) };
  return (await one<{ id: string }>("select abc.publish_revision($1,$2,$3,$4,$5) id", [file, payload, version, reason, accept])).id;
}
const classes = async (revision: string) =>
  (await owner<{ product_code: string; calculated_class: string | null }>(
    "select product_code,calculated_class from abc.revision_lines where revision_id=$1 order by line_no", [revision],
  )).map((r) => `${r.product_code}:${r.calculated_class}`);

beforeAll(async () => {
  db = process.env.ABC_TEST_DATABASE_URL
    ? (new Postgres(process.env.ABC_TEST_DATABASE_URL) as unknown as PGlite)
    : new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
 create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}', last_sign_in_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(STORAGE_STUB);
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  const values = Object.values(users).map((id) => `('${id}','${id}@example.test',now())`).join(",");
  const assign = (user: string, key: string, scope: string, unit: string | null = null, sector: string | null = null) =>
    `insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select '${user}',id,'${scope}',${unit ? `'${unit}'` : "null"},${sector ? `'${sector}'` : "null"} from core.roles where key='${key}';`;
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ${values};
 select private.bootstrap_administrator('${users.admin}');
 insert into core.units(id,code,name) values ('${A}','A','Unit A'),('${B}','B','Unit B'),('${C}','0042','Unit C');
 insert into core.sectors(id,code,name) values ('${S}','S','Sector S');
 insert into core.unit_sectors values ('${A}','${S}');
 ${assign(users.global, "costs", "global")}
 ${assign(users.publisherA, "costs", "unit", A)}
 ${assign(users.publisherB, "costs", "unit", B)}
 ${assign(users.viewerA, "costs_viewer", "unit", A)}
 ${assign(users.sectorA, "costs", "sector", A, S)}
 ${assign(users.quality, "quality", "global")}
 ${assign(users.inactive, "costs", "global")}
 update core.profiles set active=false where id='${users.inactive}';`);
}, 60000);
afterAll(async () => {
  await db?.close();
});

describe("Curva ABC database", { concurrent: false }, () => {
  it("grants the new permissions only to the intended system roles", async () => {
    const rows = await owner<{ key: string; perms: string[] }>(
      "select r.key,array_agg(rp.permission_key order by rp.permission_key) perms from core.roles r join core.role_permissions rp on rp.role_id=r.id where rp.permission_key like 'abc.%' group by r.key order by r.key",
    );
    expect(rows).toEqual([
      { key: "costs", perms: ["abc.report.publish", "abc.report.read"] },
      { key: "costs_viewer", perms: ["abc.report.read"] },
      { key: "platform_administrator", perms: ["abc.report.publish", "abc.report.read"] },
    ]);
  });

  it("publishes a revision with ABC classes computed by the database", async () => {
    await login(users.publisherA);
    const f = await readyFile(A);
    const id = await publish(f.id, report(f.sha));
    expect(await classes(id)).toEqual(["1.01.001:A", "1.01.002:A", "1.01.003:B", "1.01.004:C"]);
    const [rev] = await owner<{ number: number; calculated_total: string; difference: string; line_count: number }>(
      "select number,calculated_total::text,difference::text,line_count from abc.report_revisions where id=$1", [id],
    );
    expect(rev).toEqual({ number: 1, calculated_total: "100", difference: "0", line_count: 4 });
    const [log] = await owner<{ actor_user_id: string; unit_id: string; action: string }>(
      "select actor_user_id,unit_id,action from core.system_audit_log where module='abc' and entity_id=$1", [id],
    );
    expect(log).toEqual({ actor_user_id: users.publisherA, unit_id: A, action: "revision.publish" });
    const detail = await one<{ d: { lines: { total: string; calculated_class: string }[]; current: boolean } }>(
      "select abc.revision_detail($1) d", [id],
    );
    expect(detail.d.current).toBe(true);
    expect(typeof detail.d.lines[0].total).toBe("string");
  });

  it("keeps the item that crosses a threshold in the band where it started", async () => {
    await login(users.publisherA);
    const f = await readyFile(A);
    const lines = [line(1, "X1", "95"), line(2, "X2", "5")];
    const id = await publish(f.id, report(f.sha, { lines, period_start: "2026-01-01", period_end: "2026-01-31" }));
    expect(await classes(id)).toEqual(["X1:A", "X2:C"]);
  });

  it("orders ties by code and gives zero totals no class", async () => {
    await login(users.publisherA);
    const f = await readyFile(A);
    const zero = { ...line(4, "B3", "0", null), quantity: "0", unit_cost: "0" };
    const lines = [line(1, "B2", "25"), line(2, "B1", "25"), line(3, "Z0", "50"), zero];
    const id = await publish(f.id, report(f.sha, {
      lines, period_start: "2026-02-01", period_end: "2026-02-28",
    }));
    // Z0 starts at 0% (A), B1 at 50% (A), B2 at 75% (B): the tie is broken by code.
    expect(await classes(id)).toEqual(["B2:B", "B1:A", "Z0:A", "B3:null"]);
  });

  it("keeps values beyond binary float precision exact", async () => {
    await login(users.publisherA);
    const f = await readyFile(A);
    const big = "123456789012345678901.23";
    const lines = [line(1, "G1", big), line(2, "G2", "0.01")];
    const id = await publish(f.id, report(f.sha, {
      lines, declared_total: "123456789012345678901.24", period_start: "2026-08-01", period_end: "2026-08-31",
    }));
    const [r] = await owner<{ total: string; calculated_total: string }>(
      "select l.total::text,v.calculated_total::text from abc.revision_lines l join abc.report_revisions v on v.id=l.revision_id where l.revision_id=$1 and l.product_code='G1'", [id],
    );
    expect(r).toEqual({ total: big, calculated_total: "123456789012345678901.24" });
    expect(await classes(id)).toEqual(["G1:A", "G2:C"]);
  });

  it("denies access by scope: inactive, no role, other module, other unit, sector and read-only", async () => {
    for (const who of [users.inactive, users.empty, users.quality, users.publisherB, users.sectorA, users.viewerA]) {
      await login(who);
      expect((await failure(db.query("select * from abc.begin_source_upload($1,'a.xlsx',$2,10)", [A, "f".repeat(64)]))).code).toBe("42501");
    }
    for (const who of [users.inactive, users.empty, users.quality, users.publisherB, users.sectorA]) {
      await login(who);
      expect((await db.query("select * from abc.revision_lines")).rows.length).toBe(0);
      expect((await db.query("select * from abc.units()")).rows.map((r) => (r as { code: string }).code)).not.toContain("A");
      expect((await failure(db.query("select abc.unit_series($1)", [A]))).code).toBe("42501");
    }
    await login(users.viewerA);
    expect((await db.query("select * from abc.revision_lines")).rows.length).toBeGreaterThan(0);
    await login(users.global);
    expect((await db.query<{ code: string }>("select code from abc.units()")).rows.map((r) => r.code)).toEqual(["A", "B", "0042"]);
  });

  it("denies guessed revision IDs from another unit", async () => {
    await login(users.publisherA);
    const [rev] = await owner<{ id: string }>("select id from abc.report_revisions limit 1");
    await login(users.publisherB);
    expect((await failure(db.query("select abc.revision_detail($1)", [rev.id]))).code).toBe("42501");
    expect((await failure(db.query("select abc.record_file_check($1,$2)", [rev.id, "0".repeat(64)]))).code).toBe("42501");
  });

  it("blocks forged or inconsistent payloads without writing anything", async () => {
    await login(users.publisherA);
    const f = await readyFile(A);
    const base = report(f.sha, { period_start: "2026-03-01", period_end: "2026-03-31" });
    const cases: [string, Draft][] = [
      ["Total Geral", { ...base, declared_total: "100.05" }],
      ["Subtotal", { ...base, subtotals: base.subtotals.filter((s) => s.class !== "B") }],
      ["quantidade × custo", { ...base, lines: base.lines.map((l, i) => (i === 0 ? { ...l, unit_cost: "49.98" } : l)) }],
      ["duplicado", { ...base, lines: base.lines.map((l, i) => (i === 1 ? { ...l, code: "1.01.001" } : l)) }],
      ["inválidos ou negativos", { ...base, lines: base.lines.map((l, i) => (i === 0 ? { ...l, total: "-50" } : l)) }],
      ["inválidos ou negativos", { ...base, lines: base.lines.map((l, i) => (i === 0 ? { ...l, total: "1e2" } : l)) }],
      ["quantidade zero", { ...base, lines: base.lines.map((l, i) => (i === 3 ? { ...l, quantity: "0", unit_cost: "0" } : l)) }],
      ["mês completo", { ...base, period_end: "2026-03-30" }],
      ["mês completo", { ...base, period_end: "2026-04-30" }],
      ["Modalidade", { ...base, cost_basis: "CURRENT" as never }],
      ["unidade selecionada", { ...base, unit_code: "B" }],
      ["unidade selecionada", { ...base, unit_code: "Z" }],
      ["arquivo enviado", { ...base, file_sha256: "e".repeat(64) }],
    ];
    for (const [message, draft] of cases) {
      const err = await failure(publish(f.id, draft));
      expect(err.message, message).toContain(message);
    }
    expect((await failure(publish(f.id, base, 0, null, false, "0".repeat(64)))).message).toContain("alterado após a prévia");
    const [n] = await owner<{ n: number }>("select count(*)::int n from abc.report_series where competency='2026-03-01'");
    expect(n.n).toBe(0);
  });

  it("requires the inactive unit and the file's unit to match", async () => {
    await db.exec(`reset role; update core.units set active=false where id='${B}'`);
    await login(users.publisherB);
    expect((await failure(db.query("select * from abc.begin_source_upload($1,'a.xlsx',$2,10)", [B, "a".repeat(64)]))).code).toBe("42501");
    await db.exec(`reset role; update core.units set active=true where id='${B}'`);
  });

  it("matches the unit code as exact text, keeping leading zeros", async () => {
    await login(users.global);
    const f = await readyFile(C);
    expect((await failure(publish(f.id, report(f.sha, { unit_code: "42" })))).message).toContain("unidade selecionada");
    expect(await publish(f.id, report(f.sha, { unit_code: "0042" }))).toBeTruthy();
  });

  it("replaces the current revision only with a reason, accepted warning and current version", async () => {
    await login(users.publisherA);
    const f1 = await readyFile(A);
    const draft = report(f1.sha, { period_start: "2026-05-01", period_end: "2026-05-31" });
    const first = await publish(f1.id, draft);
    expect(await publish(f1.id, draft, 99)).toBe(first);
    const f2 = await readyFile(A);
    const second = report(f2.sha, { period_start: "2026-05-01", period_end: "2026-05-31" });
    expect((await failure(publish(f2.id, second, 0, "Novo arquivo", true))).code).toBe("40001");
    expect((await failure(publish(f2.id, second, 1, "Novo arquivo", false))).message).toContain("Warnings must be accepted");
    expect((await failure(publish(f2.id, second, 1, "  ", true))).message).toContain("motivo");
    const id = await publish(f2.id, second, 1, "Arquivo reexportado do ERP", true);
    const [s] = await owner<{ version: number; current_revision_id: string }>(
      "select version,current_revision_id from abc.report_series where competency='2026-05-01' and unit_id=$1", [A],
    );
    expect(s).toEqual({ version: 2, current_revision_id: id });
    const [r] = await owner<{ number: number; parent_revision_id: string; warnings: string[] }>(
      "select number,parent_revision_id,warnings from abc.report_revisions where id=$1", [id],
    );
    expect(r).toEqual({ number: 2, parent_revision_id: first, warnings: ["Substitui a revisão vigente"] });
  });

  it("leaves no partial state when publication fails after inserting lines", async () => {
    await db.exec(`reset role; create function public.boom() returns trigger language plpgsql as $$ begin
 if new.version>0 then raise exception 'injected'; end if; return new; end $$;
 create trigger boom before update on abc.report_series for each row execute function public.boom();`);
    await login(users.publisherA);
    const f = await readyFile(A);
    expect((await failure(publish(f.id, report(f.sha, { period_start: "2026-06-01", period_end: "2026-06-30" })))).message).toContain("injected");
    await db.exec("reset role; drop trigger boom on abc.report_series; drop function public.boom();");
    const [n] = await owner<{ r: number; l: number }>(
      "select (select count(*)::int from abc.report_revisions where period_start='2026-06-01') r,(select count(*)::int from abc.revision_lines l join abc.report_revisions v on v.id=l.revision_id where v.period_start='2026-06-01') l",
    );
    expect(n).toEqual({ r: 0, l: 0 });
  });

  it("keeps published revisions and lines immutable", async () => {
    await db.exec("reset role");
    expect((await failure(db.query("update abc.report_revisions set reason='x'"))).code).toBe("55000");
    expect((await failure(db.query("delete from abc.revision_lines"))).code).toBe("55000");
    await login(users.global);
    expect((await failure(db.query("update abc.report_revisions set reason='x'"))).code).toBe("42501");
  });

  it("records file checks and returns whether the content matches", async () => {
    await login(users.viewerA);
    const [rev] = await owner<{ id: string; content_hash: string }>(
      "select id,content_hash from abc.report_revisions where unit_id=$1 limit 1", [A],
    );
    expect((await one<{ ok: boolean }>("select abc.record_file_check($1,$2) ok", [rev.id, rev.content_hash])).ok).toBe(true);
    expect((await one<{ ok: boolean }>("select abc.record_file_check($1,$2) ok", [rev.id, "0".repeat(64)])).ok).toBe(false);
    const actions = await owner<{ action: string }>(
      "select action from core.system_audit_log where module='abc' and entity_id=$1 and action like 'revision.file_check%' order by occurred_at", [rev.id],
    );
    expect(actions.map((a) => a.action)).toEqual(["revision.file_check_ok", "revision.file_check_mismatch"]);
  });

  it("limits storage uploads to the caller's pending key and reads to the unit scope", async () => {
    await login(users.publisherA);
    const pending = await one<{ file_id: string; object_key: string }>(
      "select * from abc.begin_source_upload($1,'b.xlsx',$2,10)", [A, "b".repeat(64)],
    );
    await login(users.publisherB);
    expect(await failure(db.query(
      "insert into storage.objects(bucket_id,name,owner_id,metadata) values('abc-source-files',$1,$2,'{}')",
      [pending.object_key, users.publisherB],
    ))).toBeTruthy();
    expect(await failure(db.query(
      "insert into storage.objects(bucket_id,name,owner_id,metadata) values('abc-source-files','units/x/abc/y.xlsx',$1,'{}')",
      [users.publisherB],
    ))).toBeTruthy();
    const [ready] = await owner<{ object_key: string }>("select object_key from abc.source_files where unit_id=$1 and status='ready' limit 1", [A]);
    expect((await db.query("select * from storage.objects where name=$1", [ready.object_key])).rows.length).toBe(0);
    await login(users.viewerA);
    expect((await db.query("select * from storage.objects where name=$1", [ready.object_key])).rows.length).toBe(1);
  });

  it("publishes the browser parser's payload for an ERP-shaped workbook, byte-exact and hash-equal", async () => {
    // Unit C has a leading-zero code: the ERP branch code must match it as exact text.
    await login(users.global);
    const products = syntheticProducts(234);
    const { bytes } = erpWorkbook({ branch: "0042", products, month: "2026-06" });
    const preview = await parseReport(bytes, { expectedBranchCode: "0042", today: "2026-10-21" });
    expect(preview.blocked).toBe(false);
    const payload = await buildPayload(preview);
    const f = await readyFile(C, { sha: payload.file_sha256 });
    // The browser's content_hash is accepted only if the SQL serialization reproduces it.
    const id = (await one<{ id: string }>("select abc.publish_revision($1,$2,0,null,true) id", [f.id, payload])).id;
    const rows = await owner<{ product_code: string; product_name: string; quantity: string; unit_cost: string; total: string; erp_class: string }>(
      "select product_code,product_name,quantity::text,unit_cost::text,total::text,erp_class from abc.revision_lines where revision_id=$1 order by line_no", [id],
    );
    expect(rows).toEqual(products.map((p) => ({ product_code: p.code, product_name: p.name, quantity: p.quantity, unit_cost: p.unitCost, total: p.total, erp_class: p.cls })));
    const [rev] = await owner<{ content_hash: string; declared_total: string; zero: boolean }>(
      "select content_hash,declared_total::text,difference=0 zero from abc.report_revisions where id=$1", [id],
    );
    expect(rev).toEqual({ content_hash: payload.content_hash, declared_total: preview.declaredTotal, zero: true });
  });

  it("accepts a parser payload with many zero/zero lines (aggregated client warnings)", async () => {
    await login(users.global);
    const products = [
      ...syntheticProducts(3),
      ...Array.from({ length: 80 }, (_, i) => ({ code: `9.${i}`, name: `Sem movimento ${i}`, unit: "KG", quantity: "0", unitCost: "0", total: "0", cls: "C" })),
    ];
    const preview = await parseReport(erpWorkbook({ branch: "0042", products, month: "2026-05" }).bytes, { expectedBranchCode: "0042", today: "2026-10-21" });
    const payload = await buildPayload(preview);
    const f = await readyFile(C, { sha: payload.file_sha256 });
    const id = (await one<{ id: string }>("select abc.publish_revision($1,$2,0,null,true) id", [f.id, payload])).id;
    expect((await owner<{ n: number }>("select count(*)::int n from abc.revision_lines where revision_id=$1 and calculated_class is null", [id]))[0].n).toBe(80);
  });

  it("rejects confirming an upload whose stored object does not match", async () => {
    await login(users.publisherA);
    const f = await one<{ file_id: string; object_key: string }>(
      "select * from abc.begin_source_upload($1,'c.xlsx',$2,1000)", [A, "c".repeat(64)],
    );
    await db.query(
      "insert into storage.objects(bucket_id,name,owner_id,metadata) values('abc-source-files',$1,$2,$3)",
      [f.object_key, users.publisherA, { size: 999, mimetype: XLSX }],
    );
    expect((await failure(db.query("select abc.confirm_source_upload($1)", [f.file_id]))).message).toContain("does not match");
  });
});
