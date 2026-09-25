import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STORAGE_STUB } from "./storage-stub";
const catalog = JSON.parse(
  readFileSync("docs/reference/AUDIT_CHECKLIST_V1.json", "utf8"),
) as {
  catalogVersion: string;
  sections: {
    key: string;
    order: number;
    name: string;
    items: { key: string; number: number; text: string }[];
  }[];
};
let db: PGlite;
const uid = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const users = {
  admin: uid(1),
  global: uid(2),
  unitA: uid(3),
  sector: uid(4),
  empty: uid(5),
  inactive: uid(6),
  reader: uid(7),
  creator: uid(8),
  editor: uid(9),
  finalizer: uid(10),
  reopener: uid(11),
};
const A = "10000000-0000-0000-0000-000000000001";
const B = "10000000-0000-0000-0000-000000000002";
const C = "10000000-0000-0000-0000-000000000003";
const S = "20000000-0000-0000-0000-000000000001";
async function login(id: string, role = "authenticated") {
  await db.exec(
    `reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function one<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows[0];
}
async function rows(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows;
}
async function create(unit: string) {
  return (
    await one<{ id: string }>(
      "select audit.create_inspection($1,current_date,null) as id",
      [unit],
    )
  ).id;
}
async function inspection(id: string) {
  return one<{
    status: string;
    version: number;
    final_score: string | null;
    final_classification: string | null;
  }>("select * from audit.inspections where id=$1", [id]);
}
/** Answers every item: first `counts` entries in item order, rest with `rest`. */
async function answerAll(
  id: string,
  counts: [string, number][],
  rest: string | null = null,
) {
  const values: (string | null)[] = [];
  for (const [r, n] of counts) values.push(...Array(n).fill(r));
  await db.query(
    `update audit.inspection_answers a set response=coalesce(v.r[x.position],$3)
     from audit.checklist_items x, (select $2::text[] r) v
     where a.inspection_id=$1 and x.template_version=a.template_version and x.key=a.item_key`,
    [id, values, rest],
  );
}
beforeAll(async () => {
  db = new PGlite();
  // Minimal Supabase Auth contract; real PostgreSQL roles, grants, triggers and RLS.
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
 create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(STORAGE_STUB);
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  const values = Object.values(users)
    .map((id) => `('${id}','${id}@example.test',now())`)
    .join(",");
  const role = (key: string, permissions: string[]) =>
    `insert into core.roles(key,name) values ('${key}','${key}'); insert into core.role_permissions select id,p from core.roles cross join unnest(array['${permissions.join("','")}']) p where key='${key}';`;
  const assign = (
    user: string,
    key: string,
    scope = "unit",
    unit: string | null = A,
    sector: string | null = null,
  ) =>
    `insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select '${user}',id,'${scope}',${unit ? `'${unit}'` : "null"},${sector ? `'${sector}'` : "null"} from core.roles where key='${key}';`;
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ${values};
 select private.bootstrap_administrator('${users.admin}');
 insert into core.units(id,code,name) values ('${A}','A','Unit A'),('${B}','B','Unit B'),('${C}','C','Unit C');
 insert into core.sectors(id,code,name) values ('${S}','S','Sector S');
 insert into core.unit_sectors values ('${A}','${S}');
 ${role("audit-reader", ["audit.inspection.read"])}
 ${role("audit-creator", ["audit.inspection.read", "audit.inspection.create"])}
 ${role("audit-editor", ["audit.inspection.read", "audit.inspection.edit"])}
 ${role("audit-finalizer", ["audit.inspection.read", "audit.inspection.finalize"])}
 ${role("audit-reopener", ["audit.inspection.read", "audit.inspection.reopen"])}
 ${assign(users.global, "quality", "global", null)}
 ${assign(users.unitA, "quality")}
 ${assign(users.sector, "quality", "sector", A, S)}
 ${assign(users.inactive, "quality", "global", null)}
 ${assign(users.reader, "audit-reader")}
 ${assign(users.creator, "audit-creator")}
 ${assign(users.editor, "audit-editor")}
 ${assign(users.finalizer, "audit-finalizer")}
 ${assign(users.reopener, "audit-reopener")}
 update core.units set active=false where id='${C}';
 update core.profiles set active=false where id='${users.inactive}';`);
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("Audit domain database", () => {
  it("seeds exactly the canonical catalog from the reference JSON", async () => {
    await db.exec("reset role");
    const template = await one<{
      version: string;
      item_count: number;
      active: boolean;
    }>("select * from audit.checklist_templates");
    expect(template).toMatchObject({
      version: "checklist-geral-2026-09-22-v1",
      item_count: 158,
      active: true,
    });
    const sections = await rows(
      "select key,position,name from audit.checklist_sections order by position",
    );
    expect(sections).toEqual(
      catalog.sections.map((s) => ({
        key: s.key,
        position: s.order,
        name: s.name,
      })),
    );
    const items = await rows(
      "select key,section_key,number,text from audit.checklist_items order by position",
    );
    expect(items).toEqual(
      catalog.sections.flatMap((s) =>
        s.items.map((i) => ({
          key: i.key,
          section_key: s.key,
          number: i.number,
          text: i.text,
        })),
      ),
    );
    expect(items).toHaveLength(158);
  });
  it("keeps the catalog immutable and client read-only", async () => {
    await db.exec("reset role");
    await expect(
      db.query(
        "update audit.checklist_items set text='x' where key='item-001'",
      ),
    ).rejects.toThrow();
    await expect(
      db.query("delete from audit.checklist_sections"),
    ).rejects.toThrow();
    await login(users.global);
    expect(await rows("select key from audit.checklist_items")).toHaveLength(
      158,
    );
    await expect(
      db.query(
        "insert into audit.checklist_templates(version,name,item_count) values ('x','x',1)",
      ),
    ).rejects.toThrow();
    await expect(
      db.query("update audit.checklist_items set text='x'"),
    ).rejects.toThrow();
  });
  it("creates one inspection with exactly 158 unanswered answers atomically", async () => {
    await login(users.unitA);
    const id = await create(A);
    const counts = await one<{ total: number; answered: number }>(
      "select count(*)::int total,count(response)::int answered from audit.inspection_answers where inspection_id=$1",
      [id],
    );
    expect(counts).toEqual({ total: 158, answered: 0 });
    const s = await one<{
      answered: number;
      total_items: number;
      final_score: null;
      status: string;
    }>("select * from audit.inspection_summaries(p_inspection=>$1)", [id]);
    expect(s).toMatchObject({
      answered: 0,
      total_items: 158,
      final_score: null,
      status: "draft",
    });
    await db.exec("reset role");
    expect(
      await one(
        "select action,module,unit_id from core.system_audit_log where entity_id=$1",
        [id],
      ),
    ).toEqual({ action: "create", module: "audit", unit_id: A });
  });
  it("rejects creation for inactive or out-of-scope units without partial rows", async () => {
    await login(users.global);
    await expect(create(C)).rejects.toThrow();
    await login(users.unitA);
    await expect(create(B)).rejects.toThrow();
    await db.exec("reset role");
    expect(
      await rows("select 1 from audit.inspections where unit_id in ($1,$2)", [
        B,
        C,
      ]),
    ).toEqual([]);
  });
  it("finalizes only complete inspections with a server-computed result", async () => {
    await login(users.unitA);
    const id = await create(A);
    const draft = await inspection(id);
    await answerAll(id, [], "AT");
    await db.query(
      "update audit.inspection_answers set response=null where inspection_id=$1 and item_key='item-161'",
      [id],
    );
    await expect(
      db.query("select audit.finalize_inspection($1,$2)", [id, draft.version]),
    ).rejects.toThrow(/incomplete/);
    await answerAll(id, [], "AT");
    await expect(
      db.query("select audit.finalize_inspection($1,$2)", [
        id,
        draft.version + 5,
      ]),
    ).rejects.toThrow(/Concurrent/);
    // Clients cannot set lifecycle or result columns directly.
    await expect(
      db.query(
        "update audit.inspections set status='finalized',final_score=100 where id=$1",
        [id],
      ),
    ).rejects.toThrow();
    await db.query("select audit.finalize_inspection($1,$2)", [
      id,
      draft.version,
    ]);
    const final = await inspection(id);
    expect(final).toMatchObject({
      status: "finalized",
      final_classification: "adequate",
      version: draft.version + 1,
    });
    expect(Number(final.final_score)).toBe(100);
    // Finalized answers are read-only, and a second finalize is stale.
    expect(
      await rows(
        "update audit.inspection_answers set response='NAT' where inspection_id=$1 returning item_key",
        [id],
      ),
    ).toEqual([]);
    await expect(
      db.query("select audit.finalize_inspection($1,$2)", [id, final.version]),
    ).rejects.toThrow();
  });
  it("reopens explicitly, preserves answers and recomputes on re-finalization", async () => {
    await login(users.unitA);
    const id = await create(A);
    await answerAll(id, [], "AT");
    await db.query("select audit.finalize_inspection($1,$2)", [
      id,
      (await inspection(id)).version,
    ]);
    const finalized = await inspection(id);
    await login(users.editor);
    await expect(
      db.query("select audit.reopen_inspection($1,$2)", [
        id,
        finalized.version,
      ]),
    ).rejects.toThrow(/Forbidden/);
    await login(users.unitA);
    await expect(
      db.query("select audit.reopen_inspection($1,$2)", [
        id,
        finalized.version - 1,
      ]),
    ).rejects.toThrow(/Concurrent/);
    await db.query("select audit.reopen_inspection($1,$2)", [
      id,
      finalized.version,
    ]);
    const reopened = await inspection(id);
    expect(reopened).toMatchObject({
      status: "draft",
      final_score: null,
      final_classification: null,
    });
    expect(
      (
        await one<{ n: number }>(
          "select count(*)::int n from audit.inspection_answers where inspection_id=$1 and response='AT'",
          [id],
        )
      ).n,
    ).toBe(158);
    await answerAll(id, [["AT", 79]], "NAT");
    await db.query("select audit.finalize_inspection($1,$2)", [
      id,
      reopened.version,
    ]);
    const again = await inspection(id);
    expect(Number(again.final_score)).toBe(50);
    expect(again.final_classification).toBe("inadequate");
    await db.exec("reset role");
    expect(
      (
        await rows(
          "select action from core.system_audit_log where entity_id=$1 order by occurred_at",
          [id],
        )
      ).map((x) => (x as { action: string }).action),
    ).toEqual(["create", "finalize", "reopen", "finalize"]);
  });
  it("scores AP as half, excludes NAP and leaves all-NAP undefined", async () => {
    await login(users.unitA);
    const ap = await create(A);
    // 100 AT + 50 AP + 8 NAP => (100 + 25) / 150 = 83.33%
    await answerAll(
      ap,
      [
        ["AT", 100],
        ["AP", 50],
      ],
      "NAP",
    );
    await db.query("select audit.finalize_inspection($1,1)", [ap]);
    const r = await inspection(ap);
    expect(Number(r.final_score)).toBeCloseTo((125 / 150) * 100, 10);
    expect(r.final_classification).toBe("adequate");
    const nap = await create(A);
    await answerAll(nap, [], "NAP");
    await db.query("select audit.finalize_inspection($1,1)", [nap]);
    expect(await inspection(nap)).toMatchObject({
      status: "finalized",
      final_score: null,
      final_classification: null,
    });
  });
  it("classifies thresholds on the unrounded score", async () => {
    await db.exec("reset role");
    const cases: [string, string][] = [
      ["audit_private.classify(50.99)", "inadequate"],
      ["audit_private.classify(51)", "partial"],
      ["audit_private.classify(75.99)", "partial"],
      ["audit_private.classify(75.9999)", "partial"],
      ["audit_private.classify(76)", "adequate"],
      ["audit_private.classify(audit_private.conformity(19,0,6))", "adequate"],
      ["audit_private.classify(audit_private.conformity(51,0,49))", "partial"],
    ];
    for (const [expr, expected] of cases)
      expect((await one<{ c: string }>(`select ${expr} c`)).c).toBe(expected);
    expect(
      (await one<{ c: null }>("select audit_private.conformity(0,0,0) c")).c,
    ).toBeNull();
  });
  it("denies anonymous, inactive and unassigned users", async () => {
    await login("", "anon");
    for (const sql of [
      "select * from audit.inspections",
      "select * from audit.inspection_answers",
      "select * from audit.checklist_items",
      "select * from audit.units()",
      "select * from audit.inspection_summaries()",
    ])
      await expect(db.query(sql)).rejects.toThrow();
    for (const user of [users.inactive, users.empty]) {
      await login(user);
      for (const table of [
        "inspections",
        "inspection_answers",
        "checklist_items",
      ])
        expect(await rows(`select * from audit.${table}`)).toEqual([]);
      expect(await rows("select * from audit.units()")).toEqual([]);
      expect(await rows("select * from audit.inspection_summaries()")).toEqual(
        [],
      );
      await expect(create(A)).rejects.toThrow(/Forbidden/);
    }
  });
  it("applies global and unit scope; sector-only and guessed IDs do not leak", async () => {
    await login(users.global);
    const b = await create(B);
    await login(users.unitA);
    const visible = await rows(
      "select distinct unit_id from audit.inspections",
    );
    expect(visible).toEqual([{ unit_id: A }]);
    expect(await rows("select id from audit.units()")).toEqual([{ id: A }]);
    expect(
      await rows("select * from audit.inspections where id=$1", [b]),
    ).toEqual([]);
    expect(
      await rows(
        "select * from audit.inspection_answers where inspection_id=$1",
        [b],
      ),
    ).toEqual([]);
    expect(
      await rows("select * from audit.inspection_summaries(p_inspection=>$1)", [
        b,
      ]),
    ).toEqual([]);
    expect(
      await rows(
        "update audit.inspection_answers set response='AT' where inspection_id=$1 returning item_key",
        [b],
      ),
    ).toEqual([]);
    await expect(
      db.query("select audit.finalize_inspection($1,1)", [b]),
    ).rejects.toThrow(/Forbidden/);
    await expect(
      db.query("select audit.reopen_inspection($1,1)", [b]),
    ).rejects.toThrow(/Forbidden/);
    await login(users.sector);
    expect(await rows("select * from audit.inspections")).toEqual([]);
    expect(await rows("select * from audit.inspection_answers")).toEqual([]);
    expect(await rows("select * from audit.units()")).toEqual([]);
    await expect(create(A)).rejects.toThrow(/Forbidden/);
    await login(users.global);
    expect(
      (await rows("select distinct unit_id from audit.inspections order by 1"))
        .length,
    ).toBe(2);
  });
  it("requires each lifecycle permission separately", async () => {
    await login(users.creator);
    const id = await create(A);
    expect(
      await rows(
        "update audit.inspection_answers set response='AT' where inspection_id=$1 returning item_key",
        [id],
      ),
    ).toEqual([]);
    await login(users.reader);
    await expect(create(A)).rejects.toThrow(/Forbidden/);
    expect(
      await rows("select id from audit.inspections where id=$1", [id]),
    ).toHaveLength(1);
    await login(users.editor);
    await expect(create(A)).rejects.toThrow(/Forbidden/);
    expect(
      await rows(
        "update audit.inspection_answers set response='AT' where inspection_id=$1 returning item_key",
        [id],
      ),
    ).toHaveLength(158);
    await expect(
      db.query("select audit.finalize_inspection($1,1)", [id]),
    ).rejects.toThrow(/Forbidden/);
    await login(users.finalizer);
    expect(
      await rows(
        "update audit.inspection_answers set response='NAT' where inspection_id=$1 returning item_key",
        [id],
      ),
    ).toEqual([]);
    await db.query("select audit.finalize_inspection($1,1)", [id]);
    await expect(
      db.query("select audit.reopen_inspection($1,2)", [id]),
    ).rejects.toThrow(/Forbidden/);
    await login(users.reopener);
    await db.query("select audit.reopen_inspection($1,2)", [id]);
    expect((await inspection(id)).status).toBe("draft");
  });
  it("rejects stale answer writes while independent answers both succeed", async () => {
    await login(users.unitA);
    const id = await create(A);
    const write = (key: string, response: string, version: number) =>
      rows(
        "update audit.inspection_answers set response=$1 where inspection_id=$2 and item_key=$3 and version=$4 returning version",
        [response, id, key, version],
      );
    expect(await write("item-001", "AT", 1)).toEqual([{ version: 2 }]);
    expect(await write("item-002", "NAT", 1)).toEqual([{ version: 2 }]);
    expect(await write("item-001", "NAP", 1)).toEqual([]);
    expect(
      await one(
        "select response,updated_by from audit.inspection_answers where inspection_id=$1 and item_key='item-001'",
        [id],
      ),
    ).toEqual({ response: "AT", updated_by: users.unitA });
    // Only response/observation are writable.
    await expect(
      db.query(
        "update audit.inspection_answers set item_key='item-003' where inspection_id=$1",
        [id],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("delete from audit.inspection_answers where inspection_id=$1", [
        id,
      ]),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into audit.inspection_answers(inspection_id,template_version,item_key) values ($1,'checklist-geral-2026-09-22-v1','item-001')",
        [id],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("delete from audit.inspections where id=$1", [id]),
    ).rejects.toThrow();
  });
  it("grants execute only on the audit RPCs to authenticated", async () => {
    await db.exec("reset role");
    const fns = await db.query<{
      proname: string;
      nspname: string;
      anon: boolean;
      auth: boolean;
    }>(
      `select p.proname,n.nspname,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') auth
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('audit','audit_private')`,
    );
    for (const f of fns.rows) {
      expect(f.anon).toBe(false);
      expect(f.auth).toBe(f.nspname === "audit");
    }
  });
});
