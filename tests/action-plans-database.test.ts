import { Postgres } from "./integration/postgres.mjs";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STORAGE_STUB } from "./storage-stub";
let db: PGlite;
const uid = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const users = {
  admin: uid(1),
  global: uid(2),
  unitA: uid(3),
  sector: uid(4),
  writer: uid(5),
  verifier: uid(6),
  auditOnly: uid(7),
  empty: uid(8),
  inactive: uid(9),
};
const A = "10000000-0000-0000-0000-000000000001";
const B = "10000000-0000-0000-0000-000000000002";
const C = "10000000-0000-0000-0000-000000000003";
const S = "20000000-0000-0000-0000-000000000001";
const T = "20000000-0000-0000-0000-000000000002";
const U = "20000000-0000-0000-0000-000000000003";
let backfilled = "";
type Plan = {
  id: string;
  unit_id: string;
  sector_id: string | null;
  source_type: string;
  source_active: boolean | null;
  source_response: string | null;
  source_observation: string | null;
  source_reactivated_after_verification: boolean;
  improvement_point: string;
  action: string;
  status: string;
  effectiveness: string | null;
  verified_by: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_by: string | null;
  version: number;
};
async function login(id: string, role = "authenticated") {
  await db.exec(
    `reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function rows(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows;
}
async function one<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows[0];
}
/** Reads as the database owner so assertions do not depend on the caller's RLS. */
async function asOwner<T>(fn: () => Promise<T>) {
  const who = await one<{ sub: string; role: string }>(
    "select current_setting('request.jwt.claim.sub',true) sub, current_user::text as role",
  );
  await db.exec("reset role");
  try {
    return await fn();
  } finally {
    if (who.role !== "postgres") await login(who.sub, who.role);
  }
}
const planFor = (inspection: string, item: string) =>
  asOwner(() =>
    one<Plan>(
      "select * from action_plans.plans where source_inspection_id=$1 and source_item_key=$2",
      [inspection, item],
    ),
  );
const plan = (id: string) =>
  asOwner(() =>
    one<Plan>("select * from action_plans.plans where id=$1", [id]),
  );
const countFor = (inspection: string) =>
  asOwner(
    async () =>
      (
        await one<{ n: number }>(
          "select count(*)::int n from action_plans.plans where source_inspection_id=$1",
          [inspection],
        )
      ).n,
  );
async function answer(
  inspection: string,
  item: string,
  response: string | null,
  observation?: string,
) {
  await db.query(
    "update audit.inspection_answers set response=$3,observation=coalesce($4,observation) where inspection_id=$1 and item_key=$2",
    [inspection, item, response, observation ?? null],
  );
}
async function createInspection(unit: string) {
  return (
    await one<{ id: string }>(
      "select audit.create_inspection($1,current_date,null) id",
      [unit],
    )
  ).id;
}
async function manual(unit: string, sector: string | null, point = "Ponto") {
  return (
    await one<{ id: string }>(
      "select action_plans.create_manual_plan($1,$2,$3) id",
      [unit, sector, point],
    )
  ).id;
}
const complete = {
  action: "Reinstalar telas",
  how: "Contratar manutenção",
  responsible: "Equipe de Manutenção",
  due: "2026-10-30",
  criterion: "Sem novos insetos",
  start: null as string | null,
  end: null as string | null,
  evidence: "Checklist diário por 5 dias",
};
async function update(
  id: string,
  version: number,
  over: Partial<typeof complete> & { point?: string } = {},
) {
  const f = { ...complete, ...over };
  await db.query(
    "select action_plans.update_plan($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
    [
      id,
      version,
      over.point ?? "Ponto",
      f.action,
      f.how,
      f.responsible,
      f.due,
      f.criterion,
      f.start,
      f.end,
      f.evidence,
    ],
  );
}
const status = (id: string, version: number, s: string) =>
  db.query("select action_plans.set_plan_status($1,$2,$3)", [id, version, s]);
const verify = (
  id: string,
  version: number,
  result = "effective",
  notes: string | null = "Sem reincidência no período",
  date: string | null = "2026-09-20",
) =>
  db.query("select action_plans.verify_plan($1,$2,$3,$4,$5)", [
    id,
    version,
    result,
    date,
    notes,
  ]);
beforeAll(async () => {
  db = process.env.ACTION_PLANS_TEST_DATABASE_URL
    ? (new Postgres(
        process.env.ACTION_PLANS_TEST_DATABASE_URL,
      ) as unknown as PGlite)
    : new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
 create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(STORAGE_STUB);
  const files = readdirSync("supabase/migrations").sort();
  const actionPlans = files.filter((f) => f.includes("action_plans"));
  for (const file of files.filter((f) => !actionPlans.includes(f)))
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  const values = Object.values(users)
    .map((id) => `('${id}','${id}@example.test',now())`)
    .join(",");
  const role = (key: string, permissions: string[]) =>
    `insert into core.roles(key,name) values ('${key}','${key}'); insert into core.role_permissions select id,p from core.roles cross join unnest(array['${permissions.join("','")}']) p where key='${key}';`;
  const assign = (
    user: string,
    key: string,
    scope: string,
    unit: string | null = null,
    sector: string | null = null,
  ) =>
    `insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select '${user}',id,'${scope}',${unit ? `'${unit}'` : "null"},${sector ? `'${sector}'` : "null"} from core.roles where key='${key}';`;
  const ap = ["read", "create_manual", "write", "verify"].map(
    (p) => `action_plan.${p}`,
  );
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ${values};
 select private.bootstrap_administrator('${users.admin}');
 insert into core.units(id,code,name) values ('${A}','A','Unit A'),('${B}','B','Unit B'),('${C}','C','Unit C');
 insert into core.sectors(id,code,name) values ('${S}','S','Sector S'),('${T}','T','Sector T'),('${U}','U','Sector U');
 insert into core.unit_sectors values ('${A}','${S}'),('${A}','${T}'),('${B}','${U}');
 ${role("ap-all", ap)}
 ${role("ap-writer", ["action_plan.read", "action_plan.write"])}
 ${role("ap-verifier", ["action_plan.read", "action_plan.verify"])}
 ${role("audit-editor", ["audit.inspection.read", "audit.inspection.create", "audit.inspection.edit"])}
 ${assign(users.global, "quality", "global")}
 ${assign(users.unitA, "quality", "unit", A)}
 ${assign(users.sector, "ap-all", "sector", A, S)}
 ${assign(users.writer, "ap-writer", "unit", A)}
 ${assign(users.verifier, "ap-verifier", "unit", A)}
 ${assign(users.auditOnly, "audit-editor", "unit", A)}
 ${assign(users.inactive, "quality", "global")}`);
  // Existing Audit data before Action Plans is installed.
  await login(users.unitA);
  backfilled = await createInspection(A);
  await answer(backfilled, "item-001", "AP", "Piso trincado");
  await answer(backfilled, "item-002", "NAT");
  await answer(backfilled, "item-003", "AT");
  await answer(backfilled, "item-004", "NAP");
  await db.exec("reset role");
  for (const file of actionPlans)
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(`update core.units set active=false where id='${C}';
 update core.sectors set active=false where id='${T}';
 update core.profiles set active=false where id='${users.inactive}';`);
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("Action Plans database", () => {
  it("backfills plans only for current AP/NAT answers and logs them", async () => {
    await db.exec("reset role");
    const plans = await rows(
      "select source_item_key,source_response,source_observation,source_active,status,unit_id,improvement_point from action_plans.plans order by source_item_key",
    );
    const criterion = (key: string) =>
      one<{ text: string }>(
        "select text from audit.checklist_items where key=$1",
        [key],
      );
    expect(plans).toEqual([
      {
        source_item_key: "item-001",
        source_response: "AP",
        source_observation: "Piso trincado",
        source_active: true,
        status: "pending",
        unit_id: A,
        improvement_point: (await criterion("item-001")).text,
      },
      {
        source_item_key: "item-002",
        source_response: "NAT",
        source_observation: "",
        source_active: true,
        status: "pending",
        unit_id: A,
        improvement_point: (await criterion("item-002")).text,
      },
    ]);
    expect(
      (
        await one<{ n: number }>(
          "select count(*)::int n from core.system_audit_log where module='action_plans' and metadata->>'backfill'='true'",
        )
      ).n,
    ).toBe(2);
  });
  it("exposes only the intended schema, functions and source shapes", async () => {
    await db.exec("reset role");
    // The private schema is not in the Data API; authenticated gets USAGE only so Storage
    // policies can call the two evidence predicates, which are its only executable functions.
    const usage = await one<{ exposed: boolean; privateUsage: boolean }>(
      `select has_schema_privilege('authenticated','action_plans','usage') exposed,
       has_schema_privilege('authenticated','action_plans_private','usage') "privateUsage"`,
    );
    expect(usage).toEqual({ exposed: true, privateUsage: true });
    const predicates = [
      "can_read_evidence_object",
      "can_upload_evidence_object",
    ];
    const fns = await db.query<{
      nspname: string;
      proname: string;
      anon: boolean;
      auth: boolean;
    }>(
      `select n.nspname,p.proname,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') auth
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('action_plans','action_plans_private')`,
    );
    for (const f of fns.rows) {
      expect(f.anon).toBe(false);
      expect(f.auth).toBe(
        f.nspname === "action_plans" || predicates.includes(f.proname),
      );
    }
    const insert = (source: string, extra = "") =>
      db.query(
        `insert into action_plans.plans(unit_id,source_type,improvement_point${extra ? "," + extra.split("=")[0] : ""}) values ($1,$2,'x'${extra ? "," + extra.split("=")[1] : ""})`,
        [A, source],
      );
    await expect(insert("occurrence")).rejects.toThrow();
    await expect(insert("checklist")).rejects.toThrow(/source_shape/);
    await expect(
      insert("manual", `source_item_key='item-001'`),
    ).rejects.toThrow(/source_shape/);
    await expect(
      db.query(
        "insert into action_plans.plans(unit_id,source_type,source_inspection_id,source_item_key,source_active,source_response,source_observation,improvement_point) values ($1,'checklist',$2,'item-001',true,'AP','','x')",
        [A, backfilled],
      ),
    ).rejects.toThrow(/unique|duplicate/);
    await expect(
      db.query(
        "insert into action_plans.plans(unit_id,source_type,source_inspection_id,source_item_key,source_active,source_response,source_observation,improvement_point) values ($1,'checklist',$2,'item-005',true,'AP','','x')",
        [B, backfilled],
      ),
    ).rejects.toThrow(/unit must match/);
    // Clients have no direct writes.
    await login(users.global);
    await expect(
      db.query(
        "insert into action_plans.plans(unit_id,source_type,improvement_point) values ($1,'manual','x')",
        [A],
      ),
    ).rejects.toThrow();
    await expect(
      db.query("update action_plans.plans set status='completed'"),
    ).rejects.toThrow();
    await expect(db.query("delete from action_plans.plans")).rejects.toThrow();
  });
  it("syncs exactly one checklist plan through AP/NAT/AT/NAP/null changes", async () => {
    await login(users.unitA);
    const i = await createInspection(A);
    await answer(i, "item-010", "AT");
    await answer(i, "item-011", "NAP");
    // Clearing an answer without a plan must not create one (NULL response).
    await answer(i, "item-010", null);
    expect(await countFor(i)).toBe(0);
    await answer(i, "item-010", "AP", "Lâmpada queimada");
    const created = await planFor(i, "item-010");
    expect(created).toMatchObject({
      source_type: "checklist",
      source_active: true,
      source_response: "AP",
      source_observation: "Lâmpada queimada",
      status: "pending",
      unit_id: A,
      sector_id: null,
      created_by: users.unitA,
    });
    await answer(i, "item-011", "NAT");
    expect((await planFor(i, "item-011")).source_response).toBe("NAT");
    await answer(i, "item-010", "NAT");
    expect(await countFor(i)).toBe(2);
    expect((await planFor(i, "item-010")).id).toBe(created.id);
    // User planning survives source refreshes.
    await update(created.id, (await plan(created.id)).version);
    await answer(i, "item-010", "NAT", "Nova observação");
    let p = await planFor(i, "item-010");
    expect(p).toMatchObject({
      source_observation: "Nova observação",
      action: complete.action,
    });
    for (const r of ["AT", "NAP", null]) {
      await answer(i, "item-010", "AP");
      await answer(i, "item-010", r);
      p = await planFor(i, "item-010");
      expect(p.id).toBe(created.id);
      expect(p.source_active).toBe(false);
      expect(p.action).toBe(complete.action);
    }
    await answer(i, "item-010", "AP");
    p = await planFor(i, "item-010");
    expect(p).toMatchObject({
      id: created.id,
      source_active: true,
      source_response: "AP",
    });
    expect(await countFor(i)).toBe(2);
    const actions = await asOwner(async () =>
      (
        await rows(
          "select action from core.system_audit_log where module='action_plans' and entity_id=$1 order by occurred_at",
          [created.id],
        )
      ).map((x) => (x as { action: string }).action),
    );
    expect(actions).toEqual([
      "create",
      "source_update",
      "update",
      "source_update",
      "source_deactivate",
      "source_activate",
      "source_deactivate",
      "source_activate",
      "source_deactivate",
      "source_activate",
    ]);
  });
  it("keeps a prior verification and flags reactivation of a verified source", async () => {
    await login(users.unitA);
    const i = await createInspection(A);
    await answer(i, "item-020", "NAT");
    const p = await planFor(i, "item-020");
    await update(p.id, p.version);
    await status(p.id, p.version + 1, "completed");
    await verify(p.id, p.version + 2);
    await answer(i, "item-020", "AT");
    await answer(i, "item-020", "AP");
    const r = await planFor(i, "item-020");
    expect(r).toMatchObject({
      source_active: true,
      effectiveness: "effective",
      source_reactivated_after_verification: true,
      action: complete.action,
    });
    await verify(r.id, r.version, "ineffective");
    expect(await planFor(i, "item-020")).toMatchObject({
      effectiveness: "ineffective",
      source_reactivated_after_verification: false,
    });
  });
  it("does not grant plan access through automatic generation", async () => {
    await login(users.auditOnly);
    const i = await createInspection(A);
    await answer(i, "item-030", "NAT");
    expect(await countFor(i)).toBe(1);
    expect(await rows("select * from action_plans.plans")).toEqual([]);
    expect(
      await rows(
        "select * from action_plans.plan_summaries(p_inspection=>$1)",
        [i],
      ),
    ).toEqual([]);
  });
  it("creates manual plans only within the create_manual scope", async () => {
    await login(users.writer);
    await expect(manual(A, null)).rejects.toThrow(/Forbidden/);
    await login(users.global);
    const g = await manual(B, U, "Ponto B");
    expect(await plan(g)).toMatchObject({
      source_type: "manual",
      status: "pending",
      unit_id: B,
      sector_id: U,
      created_by: users.global,
      version: 1,
    });
    await login(users.unitA);
    expect(await manual(A, null)).toBeTruthy();
    expect(await manual(A, S)).toBeTruthy();
    await expect(manual(B, null)).rejects.toThrow(/Forbidden/);
    await login(users.sector);
    expect(await manual(A, S)).toBeTruthy();
    await expect(manual(A, null)).rejects.toThrow(/Forbidden/);
    await expect(manual(A, T)).rejects.toThrow(/Forbidden/);
    await login(users.global);
    await expect(manual(C, null)).rejects.toThrow(/Inactive unit/);
    await expect(manual(A, T)).rejects.toThrow(/Invalid sector/);
    await expect(manual(A, U)).rejects.toThrow(/Invalid sector/);
    await expect(manual(A, null, "  ")).rejects.toThrow();
    const scopes = await rows(
      "select unit_id,sector_id from action_plans.creation_scopes()",
    );
    expect(scopes).not.toContainEqual({ unit_id: C, sector_id: null });
    expect(scopes).not.toContainEqual({ unit_id: A, sector_id: T });
    await login(users.sector);
    expect(
      await rows(
        "select unit_id,sector_id from action_plans.creation_scopes()",
      ),
    ).toEqual([{ unit_id: A, sector_id: S }]);
    await asOwner(async () =>
      expect(
        (
          await one<{ n: number }>(
            "select count(*)::int n from core.system_audit_log where module='action_plans' and action='create' and metadata->>'source'='manual'",
          )
        ).n,
      ).toBe(4),
    );
  });
  it("applies read scope; sector-only and guessed IDs do not leak", async () => {
    await login(users.global);
    const unitWideA = await manual(A, null, "Unit-wide A");
    const sectorA = await manual(A, S, "Sector S A");
    const unitB = await manual(B, null, "Unit B");
    const visible = async () =>
      (await rows("select id from action_plans.plans")).map(
        (x) => (x as { id: string }).id,
      );
    expect(await visible()).toEqual(
      expect.arrayContaining([unitWideA, sectorA, unitB]),
    );
    await login(users.unitA);
    expect(await visible()).toEqual(
      expect.arrayContaining([unitWideA, sectorA]),
    );
    expect(await visible()).not.toContain(unitB);
    await login(users.sector);
    const sectorVisible = await visible();
    expect(sectorVisible).toContain(sectorA);
    expect(sectorVisible).not.toContain(unitWideA);
    expect(
      await rows("select * from action_plans.plans where id=$1", [unitWideA]),
    ).toEqual([]);
    expect(
      await rows("select * from action_plans.plan_summaries(p_plan=>$1)", [
        unitWideA,
      ]),
    ).toEqual([]);
    await expect(status(unitWideA, 1, "in_progress")).rejects.toThrow(
      /Forbidden/,
    );
    await login(users.unitA);
    await expect(update(unitB, 1)).rejects.toThrow(/Forbidden/);
    for (const user of [users.empty, users.inactive]) {
      await login(user);
      expect(await visible()).toEqual([]);
      expect(await rows("select * from action_plans.plan_summaries()")).toEqual(
        [],
      );
      expect(
        await rows("select * from action_plans.creation_scopes()"),
      ).toEqual([]);
      await expect(manual(A, null)).rejects.toThrow(/Forbidden/);
    }
    await login("", "anon");
    await expect(
      db.query("select * from action_plans.plans"),
    ).rejects.toThrow();
    await expect(
      db.query("select * from action_plans.plan_summaries()"),
    ).rejects.toThrow();
  });
  it("enforces planning completeness and server-controlled completion", async () => {
    await login(users.unitA);
    const id = await manual(A, null, "Completude");
    expect((await plan(id)).status).toBe("pending");
    await expect(status(id, 1, "in_progress")).rejects.toThrow(/plans_ready/);
    const fields = [
      "action",
      "how",
      "responsible",
      "due",
      "criterion",
      "evidence",
    ] as const;
    let v = 1;
    for (const field of fields) {
      await update(id, v, { [field]: field === "due" ? null : "" });
      v++;
      await expect(status(id, v, "in_progress")).rejects.toThrow(/plans_ready/);
    }
    await expect(
      update(id, v, { start: "2026-10-10", end: "2026-10-01" }),
    ).rejects.toThrow(/plans_monitoring/);
    await expect(update(id, v, { start: "2026-10-10" })).rejects.toThrow(
      /plans_monitoring/,
    );
    await update(id, v, { start: "2026-10-01", end: "2026-10-10" });
    v++;
    await status(id, v, "in_progress");
    v++;
    // Completeness also holds while executing.
    await expect(update(id, v, { action: "" })).rejects.toThrow(/plans_ready/);
    await status(id, v, "completed");
    v++;
    expect(await plan(id)).toMatchObject({
      status: "completed",
      completed_by: users.unitA,
      version: v,
    });
    expect((await plan(id)).completed_at).not.toBeNull();
    await status(id, v, "in_progress");
    v++;
    expect(await plan(id)).toMatchObject({
      completed_by: null,
      completed_at: null,
    });
    const columns = await asOwner(async () =>
      (
        await rows(
          "select column_name from information_schema.columns where table_schema='action_plans' and table_name='plans'",
        )
      ).map((x) => (x as { column_name: string }).column_name),
    );
    expect(columns).not.toContain("overdue");
    await asOwner(async () =>
      expect(
        (
          await rows(
            "select action from core.system_audit_log where entity_id=$1 and action='status'",
            [id],
          )
        ).length,
      ).toBe(3),
    );
  });
  it("separates write and verify and locks verified plans", async () => {
    await login(users.unitA);
    const id = await manual(A, null, "Verificação");
    await update(id, 1);
    await login(users.verifier);
    await expect(update(id, 2)).rejects.toThrow(/Forbidden/);
    await expect(status(id, 2, "completed")).rejects.toThrow(/Forbidden/);
    await expect(verify(id, 2)).rejects.toThrow(/Only completed/);
    await login(users.writer);
    await status(id, 2, "completed");
    await expect(verify(id, 3)).rejects.toThrow(/Forbidden/);
    await login(users.verifier);
    await expect(verify(id, 3, "effective", "")).rejects.toThrow(/required/);
    await expect(verify(id, 3, "effective", "ok", null)).rejects.toThrow(
      /required/,
    );
    await expect(verify(id, 3, "great")).rejects.toThrow(
      /plans_effectiveness_check|check/,
    );
    await expect(verify(id, 2)).rejects.toThrow(/Concurrent/);
    await verify(id, 3, "partially_effective");
    expect(await plan(id)).toMatchObject({
      effectiveness: "partially_effective",
      verified_by: users.verifier,
      version: 4,
    });
    await login(users.writer);
    await expect(update(id, 4)).rejects.toThrow(/Verified plan is locked/);
    await expect(status(id, 4, "in_progress")).rejects.toThrow(
      /Verified plan is locked/,
    );
    await login(users.verifier);
    await expect(verify(id, 3, "effective")).rejects.toThrow(/Concurrent/);
    await verify(id, 4, "effective", "Reavaliado após novo ciclo");
    await asOwner(async () =>
      expect(
        (
          await rows(
            "select action from core.system_audit_log where entity_id=$1 and action in ('verify','re_verify') order by occurred_at",
            [id],
          )
        ).map((x) => (x as { action: string }).action),
      ).toEqual(["verify", "re_verify"]),
    );
  });
  it("rejects stale plan writes", async () => {
    await login(users.unitA);
    const id = await manual(A, null, "Concorrência");
    await update(id, 1, { action: "Sessão 1" });
    await expect(update(id, 1, { action: "Sessão 2" })).rejects.toThrow(
      /Concurrent/,
    );
    expect((await plan(id)).action).toBe("Sessão 1");
    await expect(status(id, 1, "in_progress")).rejects.toThrow(/Concurrent/);
  });
});
const PDF = "application/pdf";
type Begun = { evidence_id: string; object_key: string };
const beginEvidence = (
  planId: string,
  kind = "execution",
  name = "laudo.pdf",
  type: string | null = PDF,
  size: number | null = 100,
) =>
  one<Begun>(
    "select * from action_plans.begin_evidence_upload($1,$2,$3,$4,$5)",
    [planId, kind, name, type, size],
  );
/** Stands in for the Storage upload: the object row Storage writes for the uploader. */
const storeObject = (key: string, owner: string, size = 100, type = PDF) =>
  asOwner(() =>
    db.query(
      "insert into storage.objects(bucket_id,name,owner_id,metadata) values('action-plan-evidence',$1,$2,$3)",
      [key, owner, JSON.stringify({ size, mimetype: type })],
    ),
  );
const confirmEvidence = (id: string) =>
  db.query("select action_plans.confirm_evidence_upload($1)", [id]);
const removeEvidence = (id: string) =>
  db.query("select action_plans.remove_evidence($1)", [id]);
const listEvidence = async (planId: string) =>
  (await rows("select * from action_plans.plan_evidence($1)", [planId])) as {
    id: string;
    kind: string;
    verification_round: number | null;
    object_key: string;
    uploaded_by_name: string;
  }[];
async function attach(planId: string, user: string, kind = "execution") {
  const b = await beginEvidence(planId, kind);
  await storeObject(b.object_key, user);
  await confirmEvidence(b.evidence_id);
  return b;
}
const evidenceRow = (id: string) =>
  asOwner(() =>
    one<{
      status: string;
      verification_round: number | null;
      created_by: string;
      removed_by: string | null;
    }>("select * from action_plans.evidence where id=$1", [id]),
  );
const evidenceEvents = (id: string) =>
  asOwner(() =>
    rows(
      "select action,actor_user_id,unit_id,sector_id,before_data,after_data,metadata from core.system_audit_log where entity_type='evidence' and entity_id=$1 order by occurred_at",
      [id],
    ),
  );
/** Backdates a pending upload past the 1-hour window (bypassing the immutability guard). */
const expire = (id: string) =>
  asOwner(() =>
    db.exec(`alter table action_plans.evidence disable trigger guard_evidence;
 update action_plans.evidence set created_at=now()-interval '2 hours' where id='${id}';
 alter table action_plans.evidence enable trigger guard_evidence;`),
  );
/** A completed plan in unit A (optionally sector-scoped) at version 3. */
async function completedPlan(sector: string | null = null) {
  await login(users.unitA);
  const id = await manual(A, sector, "Evidência");
  await update(id, 1);
  await status(id, 2, "completed");
  return id;
}
const affected = (r: { affectedRows?: number; rowCount?: number | null }) =>
  r.affectedRows ?? r.rowCount ?? 0;
describe.sequential("Action Plan evidence", () => {
  it("installs a private bucket, RLS and only INSERT/SELECT Storage policies", async () => {
    await db.exec("reset role");
    expect(
      await one(
        "select public,file_size_limit::int size,allowed_mime_types from storage.buckets where id='action-plan-evidence'",
      ),
    ).toEqual({
      public: false,
      size: 10485760,
      allowed_mime_types: [
        "image/jpeg",
        "image/png",
        PDF,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
    });
    expect(
      await rows(
        "select polcmd::text from pg_policy where polrelid='storage.objects'::regclass and polname like 'action_plan_evidence%' order by 1",
      ),
    ).toEqual([{ polcmd: "a" }, { polcmd: "r" }]);
    expect(
      await one(
        `select relrowsecurity rls,has_table_privilege('authenticated','action_plans.evidence','select') sel,
         has_table_privilege('authenticated','action_plans.evidence','insert') ins,
         has_table_privilege('authenticated','action_plans.evidence','update') upd,
         has_table_privilege('authenticated','action_plans.evidence','delete') del
         from pg_class where oid='action_plans.evidence'::regclass`,
      ),
    ).toEqual({ rls: true, sel: true, ins: false, upd: false, del: false });
    await expect(
      db.query(
        "insert into action_plans.evidence(plan_id,kind,original_name,content_type,size_bytes,created_by) select id,'other','a.pdf',$1,1,$2 from action_plans.plans limit 1",
        [PDF, users.global],
      ),
    ).rejects.toThrow(/kind_check/);
    await expect(
      db.query(
        "insert into action_plans.evidence(plan_id,kind,verification_round,original_name,content_type,size_bytes,created_by) select id,'execution',1,'a.pdf',$1,1,$2 from action_plans.plans limit 1",
        [PDF, users.global],
      ),
    ).rejects.toThrow(/evidence_round/);
  });
  it("validates kind, type, extension, size and file name server-side", async () => {
    await login(users.unitA);
    const id = await manual(A, null, "Arquivos");
    await expect(beginEvidence(id, "photo")).rejects.toThrow(
      /Invalid evidence kind/,
    );
    for (const [name, type] of [
      ["planilha.xls", "application/vnd.ms-excel"],
      ["texto.doc", "application/msword"],
      ["macro.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12"],
      ["macro.docm", "application/vnd.ms-word.document.macroEnabled.12"],
      ["foto.heic", "image/heic"],
      ["logo.svg", "image/svg+xml"],
      ["pagina.html", "text/html"],
      ["setup.exe", "application/x-msdownload"],
      ["script.js", "text/javascript"],
      ["pacote.zip", "application/zip"],
      ["sem-tipo.pdf", null],
    ])
      await expect(beginEvidence(id, "execution", name, type)).rejects.toThrow(
        /type not allowed/,
      );
    await expect(beginEvidence(id, "execution", "foto.png")).rejects.toThrow(
      /does not match/,
    );
    await expect(
      beginEvidence(id, "execution", "laudo.pdf.exe"),
    ).rejects.toThrow(/does not match/);
    await expect(
      beginEvidence(id, "execution", "laudo.pdf", PDF, 0),
    ).rejects.toThrow(/size not allowed/);
    await expect(
      beginEvidence(id, "execution", "laudo.pdf", PDF, 10485761),
    ).rejects.toThrow(/size not allowed/);
    for (const name of [
      "../x.pdf",
      "a\\b.pdf",
      "a/b.pdf",
      "linha\r\nquebra.pdf",
      "nulo\u0001.pdf",
      "fdp\u202efdp.pdf",
      '"a".pdf',
      "a:b.pdf",
      ".oculto.pdf",
      "laudo.pdf.",
      "laudo.pdf ",
      "a".repeat(177) + ".pdf",
      "sem-extensao",
      "",
      "é.pdf",
    ])
      await expect(beginEvidence(id, "execution", name)).rejects.toThrow(
        /name not allowed|does not match/,
      );
    const ok: [string, string, number][] = [
      ["x.exe.pdf", PDF, 10485760],
      ["Relatório ação.PDF", PDF, 1],
      ["foto.JPG", "image/jpeg", 1],
      ["foto.jpeg", "image/jpeg", 1],
      ["tela.png", "image/png", 1],
      [
        "planilha.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        1,
      ],
      [
        "texto.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        1,
      ],
      ["a".repeat(176) + ".pdf", PDF, 1],
    ];
    for (const [name, type, size] of ok) {
      const b = await beginEvidence(id, "execution", name, type, size);
      // The key never contains user input.
      expect(b.object_key).toBe(`${id}/${b.evidence_id}`);
    }
  });
  it("separates execution (write) from verification (verify) evidence", async () => {
    const id = await completedPlan();
    await login(users.writer);
    const ex = await attach(id, users.writer, "execution");
    await expect(beginEvidence(id, "verification")).rejects.toThrow(
      /Forbidden/,
    );
    await login(users.verifier);
    await expect(beginEvidence(id, "execution")).rejects.toThrow(/Forbidden/);
    await expect(removeEvidence(ex.evidence_id)).rejects.toThrow(/Forbidden/);
    const ve = await attach(id, users.verifier, "verification");
    await login(users.writer);
    await expect(removeEvidence(ve.evidence_id)).rejects.toThrow(/Forbidden/);
    const list = await listEvidence(id);
    expect(list.map((e) => [e.kind, e.verification_round])).toEqual([
      ["execution", null],
      ["verification", 1],
    ]);
    expect(list[0].uploaded_by_name).toBeTruthy();
    // Evidence mutations never bump the plan version (plan edits keep their optimistic lock).
    expect((await plan(id)).version).toBe(3);
    await login(users.unitA);
    const open = await manual(A, null, "Aberto");
    await expect(beginEvidence(open, "verification")).rejects.toThrow(
      /Only completed/,
    );
  });
  it("applies read scope; guessed, foreign, anonymous and inactive access is denied", async () => {
    const unitWide = await completedPlan();
    const sectorPlan = await completedPlan(S);
    await login(users.unitA);
    const a = await attach(unitWide, users.unitA);
    const s = await attach(sectorPlan, users.unitA);
    await login(users.global);
    const bPlan = await manual(B, null, "B");
    const b = await attach(bPlan, users.global);
    expect(await listEvidence(unitWide)).toHaveLength(1);
    expect(await listEvidence(bPlan)).toHaveLength(1);
    await login(users.unitA);
    expect(await listEvidence(sectorPlan)).toHaveLength(1);
    expect(await listEvidence(bPlan)).toEqual([]);
    await login(users.sector);
    expect(await listEvidence(sectorPlan)).toHaveLength(1);
    expect(await listEvidence(unitWide)).toEqual([]);
    expect(
      await rows("select id from action_plans.evidence where id=any($1)", [
        [a.evidence_id, b.evidence_id, s.evidence_id],
      ]),
    ).toEqual([{ id: s.evidence_id }]);
    await login(users.unitA);
    const guess = "30000000-0000-0000-0000-000000000099";
    await expect(beginEvidence(guess)).rejects.toThrow(/Forbidden/);
    await expect(beginEvidence(bPlan)).rejects.toThrow(/Forbidden/);
    await expect(confirmEvidence(guess)).rejects.toThrow(/Forbidden/);
    await expect(removeEvidence(guess)).rejects.toThrow(/Forbidden/);
    await expect(confirmEvidence(b.evidence_id)).rejects.toThrow(/Forbidden/);
    await expect(removeEvidence(b.evidence_id)).rejects.toThrow(/Forbidden/);
    await login(users.inactive);
    await expect(beginEvidence(unitWide)).rejects.toThrow(/Forbidden/);
    expect(await listEvidence(unitWide)).toEqual([]);
    expect(await rows("select id from action_plans.evidence")).toEqual([]);
    await login(users.empty);
    await expect(beginEvidence(unitWide)).rejects.toThrow(/Forbidden/);
    expect(await listEvidence(unitWide)).toEqual([]);
    await login("", "anon");
    await expect(beginEvidence(unitWide)).rejects.toThrow(/permission denied/);
    await expect(listEvidence(unitWide)).rejects.toThrow(/permission denied/);
    await expect(
      db.query("select * from action_plans.evidence"),
    ).rejects.toThrow(/permission denied/);
  });
  it("confirms only the uploader's matching live object, idempotently, and audits safely", async () => {
    const id = await completedPlan();
    await login(users.unitA);
    const b = await beginEvidence(id, "execution", "Relatório.pdf", PDF, 100);
    const replaceObject = async (owner: string, size = 100, type = PDF) => {
      await asOwner(() =>
        db.query("delete from storage.objects where name=$1", [b.object_key]),
      );
      await storeObject(b.object_key, owner, size, type);
    };
    await login(users.writer);
    await expect(confirmEvidence(b.evidence_id)).rejects.toThrow(/Forbidden/);
    await login(users.unitA);
    await expect(confirmEvidence(b.evidence_id)).rejects.toThrow(
      /does not match/,
    );
    for (const [owner, size, type] of [
      [users.writer, 100, PDF],
      [users.unitA, 99, PDF],
      [users.unitA, 100, "image/png"],
    ] as const) {
      await replaceObject(owner, size, type);
      await expect(confirmEvidence(b.evidence_id)).rejects.toThrow(
        /does not match/,
      );
    }
    // Pending rows are invisible.
    expect(await listEvidence(id)).toEqual([]);
    expect(
      await rows("select id from action_plans.evidence where id=$1", [
        b.evidence_id,
      ]),
    ).toEqual([]);
    await replaceObject(users.unitA);
    await confirmEvidence(b.evidence_id);
    await confirmEvidence(b.evidence_id);
    expect(await evidenceRow(b.evidence_id)).toMatchObject({
      status: "available",
      created_by: users.unitA,
    });
    const events = (await evidenceEvents(b.evidence_id)) as {
      action: string;
      after_data: Record<string, unknown>;
    }[];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "evidence_add",
      actor_user_id: users.unitA,
      unit_id: A,
      sector_id: null,
      before_data: null,
      metadata: { plan_id: id, kind: "execution", verification_round: null },
    });
    expect(Object.keys(events[0].after_data).sort()).toEqual(
      [
        "content_type",
        "created_by",
        "id",
        "kind",
        "original_name",
        "plan_id",
        "removed_at",
        "removed_by",
        "size_bytes",
        "status",
        "uploaded_at",
        "verification_round",
      ].sort(),
    );
    expect(JSON.stringify(events[0])).not.toContain(b.object_key);
    const late = await beginEvidence(id);
    await storeObject(late.object_key, users.unitA);
    await expire(late.evidence_id);
    await expect(confirmEvidence(late.evidence_id)).rejects.toThrow(
      /Upload expired/,
    );
  });
  it("expires pending uploads at decision time, not at transaction start", async () => {
    const id = await completedPlan();
    const b = await beginEvidence(id);
    await storeObject(b.object_key, users.unitA);
    await asOwner(() =>
      db.exec(`alter table action_plans.evidence disable trigger guard_evidence;
 update action_plans.evidence set created_at=now()-interval '1 hour'+interval '2 seconds' where id='${b.evidence_id}';
 alter table action_plans.evidence enable trigger guard_evidence;`),
    );
    // A confirm whose transaction started inside the window but waited on the plan lock
    // past it must see the upload as expired.
    await db.exec("begin");
    try {
      await db.query("select pg_sleep(2.5)");
      await expect(confirmEvidence(b.evidence_id)).rejects.toThrow(
        /Upload expired/,
      );
    } finally {
      await db.exec("rollback");
    }
  });
  it("removes logically and idempotently; removed evidence is hidden and audited once", async () => {
    const id = await completedPlan();
    await login(users.writer);
    const b = await attach(id, users.writer);
    await login(users.unitA);
    const p = await beginEvidence(id);
    await expect(removeEvidence(p.evidence_id)).rejects.toThrow(/Forbidden/);
    await removeEvidence(b.evidence_id);
    await removeEvidence(b.evidence_id);
    expect(await evidenceRow(b.evidence_id)).toMatchObject({
      status: "removed",
      removed_by: users.unitA,
    });
    expect(await listEvidence(id)).toEqual([]);
    expect(
      await rows("select id from action_plans.evidence where id=$1", [
        b.evidence_id,
      ]),
    ).toEqual([]);
    const events = (await evidenceEvents(b.evidence_id)) as {
      action: string;
      before_data: { status: string };
      after_data: { status: string };
    }[];
    expect(events.map((x) => x.action)).toEqual([
      "evidence_add",
      "evidence_remove",
    ]);
    expect(events[1].before_data.status).toBe("available");
    expect(events[1].after_data.status).toBe("removed");
    // The object is kept (no purge in v1).
    expect(
      await asOwner(() =>
        rows("select 1 from storage.objects where name=$1", [b.object_key]),
      ),
    ).toHaveLength(1);
    expect((await plan(id)).version).toBe(3);
  });
  it("binds verification evidence to rounds; recorded rounds and verified execution are frozen", async () => {
    const id = await completedPlan();
    const round = async () =>
      ((await plan(id)) as unknown as { verification_round: number })
        .verification_round;
    expect(await round()).toBe(0);
    await login(users.writer);
    const ex = await attach(id, users.writer, "execution");
    const exPending = await beginEvidence(id, "execution");
    await storeObject(exPending.object_key, users.writer);
    await login(users.verifier);
    const r1 = await attach(id, users.verifier, "verification");
    const r1Pending = await beginEvidence(id, "verification");
    await storeObject(r1Pending.object_key, users.verifier);
    await verify(id, 3);
    expect(await round()).toBe(1);
    expect((await plan(id)).version).toBe(4);
    await login(users.writer);
    await expect(beginEvidence(id, "execution")).rejects.toThrow(
      /Verified plan is locked/,
    );
    await expect(confirmEvidence(exPending.evidence_id)).rejects.toThrow(
      /Verified plan is locked/,
    );
    await expect(removeEvidence(ex.evidence_id)).rejects.toThrow(
      /Verified plan is locked/,
    );
    await login(users.verifier);
    await expect(confirmEvidence(r1Pending.evidence_id)).rejects.toThrow(
      /round is closed/,
    );
    await expect(removeEvidence(r1.evidence_id)).rejects.toThrow(
      /round is closed/,
    );
    const r2 = await attach(id, users.verifier, "verification");
    expect((await evidenceRow(r2.evidence_id)).verification_round).toBe(2);
    await removeEvidence(r2.evidence_id);
    const r2b = await attach(id, users.verifier, "verification");
    await verify(id, 4, "effective", "Reverificado");
    expect(await round()).toBe(2);
    await expect(removeEvidence(r2b.evidence_id)).rejects.toThrow(
      /round is closed/,
    );
    // Re-verification without new evidence is allowed (evidence is optional).
    await verify(id, 5, "ineffective", "Sem anexos novos");
    expect(
      (await listEvidence(id)).map((e) => [e.kind, e.verification_round]),
    ).toEqual([
      ["execution", null],
      ["verification", 1],
      ["verification", 2],
    ]);
    // Each round is correlated with exactly one verify/re_verify event.
    expect(
      await asOwner(() =>
        rows(
          "select action,(after_data->>'verification_round')::int round from core.system_audit_log where entity_type='plan' and entity_id=$1 and action in ('verify','re_verify') order by occurred_at",
          [id],
        ),
      ),
    ).toEqual([
      { action: "verify", round: 1 },
      { action: "re_verify", round: 2 },
      { action: "re_verify", round: 3 },
    ]);
    await expect(
      db.query(
        "update action_plans.plans set verification_round=0 where id=$1",
        [id],
      ),
    ).rejects.toThrow();
    await asOwner(() =>
      expect(
        db.query(
          "update action_plans.plans set verification_round=0 where id=$1",
          [id],
        ),
      ).rejects.toThrow(/plans_verification_round/),
    );
  });
  it("allows completion and verification without any evidence", async () => {
    const id = await completedPlan();
    await login(users.verifier);
    await verify(id, 3);
    expect(await plan(id)).toMatchObject({
      effectiveness: "effective",
      verification_round: 1,
    });
  });
  it("limits active evidence to 20 per plan, excluding removed and expired", async () => {
    await login(users.unitA);
    const id = await manual(A, null, "Limite");
    const done: Begun[] = [];
    for (let n = 0; n < 19; n++) done.push(await attach(id, users.unitA));
    const pending = await beginEvidence(id);
    await expect(beginEvidence(id)).rejects.toThrow(/limit reached/);
    await removeEvidence(done[0].evidence_id);
    const replacement = await beginEvidence(id);
    await expect(beginEvidence(id)).rejects.toThrow(/limit reached/);
    await expire(pending.evidence_id);
    await expire(replacement.evidence_id);
    await beginEvidence(id);
    await beginEvidence(id);
    await expect(beginEvidence(id)).rejects.toThrow(/limit reached/);
  });
  it("enforces Storage INSERT/SELECT policies and denies UPDATE/DELETE", async () => {
    await login(users.unitA);
    const id = await manual(A, null, "Storage");
    const mine = await beginEvidence(id);
    const put = (key: string, bucket = "action-plan-evidence") =>
      db.query(
        "insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4)",
        [
          bucket,
          key,
          users.unitA,
          JSON.stringify({ size: 100, mimetype: PDF }),
        ],
      );
    await login(users.global);
    await expect(put(mine.object_key)).rejects.toThrow(/row-level security/);
    await login(users.unitA);
    await expect(put(`${id}/${crypto.randomUUID()}`)).rejects.toThrow(
      /row-level security/,
    );
    await asOwner(() =>
      db.query(
        "insert into storage.buckets(id,name) values('other','other') on conflict do nothing",
      ),
    );
    await expect(put(mine.object_key, "other")).rejects.toThrow(
      /row-level security/,
    );
    const late = await beginEvidence(id);
    await expire(late.evidence_id);
    await expect(put(late.object_key)).rejects.toThrow(/row-level security/);
    await put(mine.object_key);
    const readable = () =>
      rows("select name from storage.objects where name=$1", [mine.object_key]);
    // Pending objects cannot be read (or signed), even by the uploader.
    expect(await readable()).toEqual([]);
    await confirmEvidence(mine.evidence_id);
    expect(await readable()).toHaveLength(1);
    await login(users.sector);
    expect(await readable()).toEqual([]);
    await login(users.unitA);
    expect(
      affected(
        await db.query("update storage.objects set name='x' where name=$1", [
          mine.object_key,
        ]),
      ),
    ).toBe(0);
    expect(
      affected(
        await db.query("delete from storage.objects where name=$1", [
          mine.object_key,
        ]),
      ),
    ).toBe(0);
    await removeEvidence(mine.evidence_id);
    expect(await readable()).toEqual([]);
    expect(await asOwner(() => readable())).toHaveLength(1);
  });
  it("reports orphans and inconsistencies to operators only", async () => {
    await login(users.unitA);
    const id = await manual(A, null, "Reconciliação");
    const noObject = await beginEvidence(id);
    const withObject = await beginEvidence(id);
    await storeObject(withObject.object_key, users.unitA);
    const lost = await attach(id, users.unitA);
    const purged = await attach(id, users.unitA);
    await removeEvidence(purged.evidence_id);
    await expire(noObject.evidence_id);
    await expire(withObject.evidence_id);
    const orphan = `${id}/${crypto.randomUUID()}`;
    await asOwner(async () => {
      await db.query("delete from storage.objects where name=any($1)", [
        [lost.object_key, purged.object_key],
      ]);
      await db.query(
        "insert into storage.objects(bucket_id,name,owner_id,metadata) values('action-plan-evidence',$1,null,'{}')",
        [orphan],
      );
      const report = await rows(
        "select * from action_plans_private.evidence_reconciliation() where object_key like $1",
        [`${id}/%`],
      );
      expect(report).toEqual(
        expect.arrayContaining([
          {
            issue: "available_missing_object",
            evidence_id: lost.evidence_id,
            object_key: lost.object_key,
            detail: null,
          },
          {
            issue: "expired_pending",
            evidence_id: noObject.evidence_id,
            object_key: noObject.object_key,
            detail: "no object",
          },
          {
            issue: "expired_pending",
            evidence_id: withObject.evidence_id,
            object_key: withObject.object_key,
            detail: "object present",
          },
          {
            issue: "orphan_object",
            evidence_id: null,
            object_key: orphan,
            detail: null,
          },
        ]),
      );
      expect(report).toHaveLength(4);
    });
    await expect(
      db.query("select * from action_plans_private.evidence_reconciliation()"),
    ).rejects.toThrow(/permission denied/);
  });
});
