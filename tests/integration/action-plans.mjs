import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { chromium } from "playwright";

// Only the disposable Supabase CLI cluster is supported; never accept remote credentials.
const config = JSON.parse(
  execFileSync("npx", ["--yes", "supabase@2.117.0", "status", "-o", "json"], {
    encoding: "utf8",
  }),
);
for (const url of [config.API_URL, config.DB_URL])
  assert.equal(new URL(url).hostname, "127.0.0.1");
const db = new pg.Client({ connectionString: config.DB_URL });
await db.connect();
const password = `Local-${randomUUID()}-aA1!`;
const users = {};
const tokens = {};
const A = randomUUID(),
  B = randomUUID(),
  S = randomUUID(),
  T = randomUUID();
async function request(
  path,
  token,
  body,
  method = "POST",
  schema = "action_plans",
) {
  const res = await fetch(`${config.API_URL}${path}`, {
    method,
    headers: {
      apikey: config.ANON_KEY,
      Authorization: `Bearer ${token ?? config.ANON_KEY}`,
      "Content-Type": "application/json",
      "Accept-Profile": schema,
      "Content-Profile": schema,
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}
const rpc = (name, user, args = {}, schema = "action_plans") =>
  request(`/rest/v1/rpc/${name}`, tokens[user], args, "POST", schema);
function ok(r) {
  assert.ok(r.status < 300, JSON.stringify(r));
  return r.data;
}
function denied(r) {
  assert.ok([401, 403].includes(r.status), JSON.stringify(r));
}
const get = async (id, user = "global") =>
  ok(await rpc("plan_summaries", user, { p_plan: id }))[0]?.plan;
const manual = async (user, unit = A, sector = null) =>
  ok(
    await rpc("create_manual_plan", user, {
      p_unit: unit,
      p_sector: sector,
      p_improvement_point: "Revisão independente",
    }),
  );
const today = new Date().toISOString().slice(0, 10);
async function waitForLock(client) {
  for (let n = 0; n < 100; n++) {
    const result = await db.query(
      "select 1 from pg_stat_activity where application_name=$1 and wait_event_type='Lock'",
      [client],
    );
    if (result.rowCount) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw Error("Expected concurrent session to wait on a database lock");
}
try {
  for (const name of [
    "global",
    "unit",
    "sector",
    "writer",
    "verifier",
    "audit",
    "empty",
    "inactive",
    "race",
  ]) {
    const email = `${name}-${randomUUID()}@example.test`;
    const admin = await fetch(`${config.API_URL}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: config.SERVICE_ROLE_KEY,
        Authorization: `Bearer ${config.SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    assert.equal(admin.status, 200);
    users[name] = (await admin.json()).id;
    const login = await request("/auth/v1/token?grant_type=password", null, {
      email,
      password,
    });
    tokens[name] = ok(login).access_token;
    assert.ok(tokens[name]);
    users[`${name}Email`] = email;
  }
  await db.query(
    "insert into core.units(id,code,name) values ($1,'REVIEW-A','Unidade A'),($2,'REVIEW-B','Unidade B')",
    [A, B],
  );
  await db.query(
    "insert into core.sectors(id,code,name) values ($1,'REVIEW-S','Setor S'),($2,'REVIEW-T','Setor T')",
    [S, T],
  );
  await db.query("insert into core.unit_sectors values($1,$2),($3,$4)", [
    A,
    S,
    B,
    T,
  ]);
  for (const [key, permissions] of Object.entries({
    all: ["read", "create_manual", "write", "verify"],
    writer: ["read", "write"],
    verifier: ["read", "verify"],
  })) {
    const role = (
      await db.query(
        "insert into core.roles(key,name) values($1,$1) returning id",
        [`review-${key}`],
      )
    ).rows[0].id;
    for (const permission of permissions)
      await db.query("insert into core.role_permissions values($1,$2)", [
        role,
        `action_plan.${permission}`,
      ]);
  }
  for (const [name, role, scope, unit, sector] of [
    ["global", "quality", "global", null, null],
    ["unit", "quality", "unit", A, null],
    ["sector", "review-all", "sector", A, S],
    ["writer", "review-writer", "unit", A, null],
    ["verifier", "review-verifier", "unit", A, null],
    ["inactive", "quality", "global", null, null],
    ["race", "quality", "unit", A, null],
    ["audit", "auditor", "unit", A, null],
  ]) {
    // Audit-only role is isolated from Action Plan permissions.
    if (name === "audit") {
      await db.query(
        "insert into core.roles(key,name) values('review-audit','Audit')",
      );
      await db.query(
        "insert into core.role_permissions select id,p from core.roles cross join unnest(array['audit.inspection.read','audit.inspection.create','audit.inspection.edit']) p where key='review-audit'",
      );
    }
    await db.query(
      "insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select $1,id,$3,$4,$5 from core.roles where key=$2",
      [
        users[name],
        name === "audit" ? "review-audit" : role,
        scope,
        unit,
        sector,
      ],
    );
  }
  await db.query("update core.profiles set active=false where id=$1", [
    users.inactive,
  ]);
  const unitPlan = await manual("unit"),
    sectorPlan = await manual("sector", A, S),
    otherPlan = await manual("global", B);
  assert.ok(await get(otherPlan));
  assert.equal(await get(otherPlan, "unit"), undefined);
  assert.equal(await get(unitPlan, "sector"), undefined);
  assert.ok(await get(sectorPlan, "sector"));
  for (const name of ["empty", "inactive", "audit"]) {
    assert.equal(await get(unitPlan, name), undefined);
    denied(
      await rpc("create_manual_plan", name, {
        p_unit: A,
        p_sector: null,
        p_improvement_point: "Denied",
      }),
    );
  }
  denied(
    await rpc("create_manual_plan", "sector", {
      p_unit: A,
      p_sector: null,
      p_improvement_point: "Denied",
    }),
  );
  denied(
    await rpc("create_manual_plan", "unit", {
      p_unit: B,
      p_sector: null,
      p_improvement_point: "Denied",
    }),
  );
  denied(await request("/rest/v1/rpc/plan_summaries", null, {}));
  for (const name of ["empty", "inactive", "sector"])
    assert.deepEqual(
      ok(
        await request(
          `/rest/v1/plans?id=eq.${unitPlan}`,
          tokens[name],
          undefined,
          "GET",
        ),
      ),
      [],
    );
  denied(
    await request(
      `/rest/v1/plans?id=eq.${unitPlan}`,
      tokens.global,
      { status: "completed", version: 99, verified_by: users.global },
      "PATCH",
    ),
  );
  const privateCall = await request(
    "/rest/v1/rpc/lock_plan",
    tokens.global,
    {},
    "POST",
    "action_plans_private",
  );
  assert.ok(privateCall.status >= 400);
  console.log(
    "PASS Auth/JWT/PostgREST, anonymous/inactive/guessed ID, global/unit/sector, direct-write and private-schema denial",
  );
  const inspection = ok(
    await rpc(
      "create_inspection",
      "audit",
      { p_unit: A, p_applied_on: today },
      "audit",
    ),
  );
  const answer = (response, user = "audit", item = "item-001") =>
    request(
      `/rest/v1/inspection_answers?inspection_id=eq.${inspection}&item_key=eq.${item}`,
      tokens[user],
      { response, observation: `Observation ${response}` },
      "PATCH",
      "audit",
    );
  ok(await answer("AP"));
  let plans = ok(
    await rpc("plan_summaries", "global", { p_inspection: inspection }),
  );
  assert.equal(plans.length, 1);
  const source = plans[0].plan.id;
  ok(await answer("NAT"));
  assert.equal((await get(source)).source_response, "NAT");
  const values = {
    p_id: source,
    p_version: (await get(source)).version,
    p_improvement_point: "Cannot replace checklist",
    p_action: "Corrigir",
    p_how_to: "Revisar",
    p_responsible: "Equipe",
    p_due_date: today,
    p_effectiveness_criterion: "Sem falhas",
    p_monitoring_start: null,
    p_monitoring_end: null,
    p_expected_evidence: "Inspeção documentada",
  };
  denied(await rpc("update_plan", "verifier", values));
  ok(await rpc("update_plan", "writer", values));
  let p = await get(source);
  const status = (s, user = "writer", version = p.version) =>
    rpc("set_plan_status", user, {
      p_id: source,
      p_version: version,
      p_status: s,
    });
  ok(await status("in_progress"));
  p = await get(source);
  ok(await status("completed"));
  p = await get(source);
  assert.equal(p.completed_by, users.writer);
  assert.ok(p.completed_at);
  const verification = {
    p_id: source,
    p_version: p.version,
    p_effectiveness: "effective",
    p_verified_on: today,
    p_notes: "Critério atendido",
  };
  denied(await rpc("verify_plan", "writer", verification));
  ok(await rpc("verify_plan", "verifier", verification));
  assert.equal(
    (await rpc("verify_plan", "verifier", verification)).data.code,
    "40001",
  );
  assert.equal(
    (
      await rpc("update_plan", "writer", {
        ...values,
        p_version: (await get(source)).version,
      })
    ).data.code,
    "55000",
  );
  for (const response of ["AT", "AP", "NAP", "NAT", null, "AP"]) {
    ok(await answer(response));
    p = await get(source);
    assert.equal(p.source_active, ["AP", "NAT"].includes(response));
    assert.equal(p.action, "Corrigir");
    assert.equal(p.effectiveness, "effective");
    assert.equal(p.verified_by, users.verifier);
  }
  assert.equal(p.source_reactivated_after_verification, true);
  assert.equal(p.source_observation, "Observation AP");
  for (const effectiveness of ["partially_effective", "ineffective"]) {
    ok(
      await rpc("verify_plan", "verifier", {
        ...verification,
        p_version: (await get(source)).version,
        p_effectiveness: effectiveness,
      }),
    );
  }
  assert.equal(
    (await get(source)).source_reactivated_after_verification,
    false,
  );
  const blocked = await answer("NAT", "writer");
  assert.ok(blocked.status >= 400 || blocked.data.length === 0);
  assert.equal((await get(source)).source_response, "AP");
  // Two independent HTTP/database transactions contend on the same Audit answer.
  await Promise.all([
    answer("AP", "audit", "item-002"),
    answer("NAT", "audit", "item-002"),
  ]).then((rs) => rs.forEach(ok));
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from action_plans.plans where source_inspection_id=$1 and source_item_key=$2",
        [inspection, "item-002"],
      )
    ).rows[0].n,
    1,
  );
  // Simultaneous expected-version writes and verifications: exactly one succeeds.
  const v = (await get(unitPlan)).version;
  const races = await Promise.all(
    [1, 2].map(() =>
      rpc("update_plan", "writer", { ...values, p_id: unitPlan, p_version: v }),
    ),
  );
  assert.equal(races.filter((r) => r.status < 300).length, 1);
  assert.equal(races.filter((r) => r.data?.code === "40001").length, 1);
  const vv = (await get(source)).version;
  const verifies = await Promise.all(
    [1, 2].map(() =>
      rpc("verify_plan", "verifier", { ...verification, p_version: vv }),
    ),
  );
  assert.equal(verifies.filter((r) => r.status < 300).length, 1);
  assert.equal(verifies.filter((r) => r.data?.code === "40001").length, 1);
  const logs = (
    await db.query(
      "select * from core.system_audit_log where module='action_plans' and entity_id=$1",
      [source],
    )
  ).rows;
  for (const action of [
    "create",
    "update",
    "status",
    "verify",
    "re_verify",
    "source_activate",
    "source_deactivate",
  ])
    assert.ok(
      logs.some((l) => l.action === action),
      action,
    );
  for (const log of logs) {
    assert.equal(log.unit_id, A);
    assert.equal(log.sector_id, null);
    assert.ok(log.actor_user_id);
    assert.equal(log.after_data.id, source);
    if (log.action !== "create") assert.equal(log.before_data.id, source);
  }
  console.log(
    "PASS Audit AP/NAT/null sync, history and verification preservation, write/verify, simultaneous stale writes/verifications, duplicate prevention, system audit",
  );
  // Hold a unit row while an authorized creator waits, then revoke its profile.
  const locker = new pg.Client({ connectionString: config.DB_URL });
  const caller = new pg.Client({
    connectionString: config.DB_URL,
    application_name: "action-plan-revocation",
  });
  await locker.connect();
  await caller.connect();
  try {
    await locker.query("begin");
    await locker.query("update core.units set name=name where id=$1", [A]);
    await caller.query("set role authenticated");
    await caller.query("select set_config('request.jwt.claim.sub',$1,false)", [
      users.race,
    ]);
    const creating = caller
      .query(
        "select action_plans.create_manual_plan($1,null,'Revoked during lock wait')",
        [A],
      )
      .then(
        () => ({ allowed: true }),
        (error) => ({ allowed: false, code: error.code }),
      );
    await waitForLock("action-plan-revocation");
    await locker.query("update core.profiles set active=false where id=$1", [
      users.race,
    ]);
    await locker.query("commit");
    const outcome = await creating;
    if (
      existsSync(
        "supabase/migrations/202609250007_action_plans_authorization.sql",
      )
    )
      assert.deepEqual(outcome, { allowed: false, code: "42501" });
    else {
      assert.equal(outcome.allowed, true);
      console.log(
        "REPRODUCED: published 0006 allows creation after profile revocation while waiting for unit lock",
      );
    }
  } finally {
    await locker.query("rollback");
    await locker.end();
    await caller.end();
  }
  // Browser runs against actual local Auth + Data API, including mobile layouts.
  const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1"], {
    env: {
      ...process.env,
      VITE_SUPABASE_URL: config.API_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: config.ANON_KEY,
    },
    stdio: "ignore",
  });
  let browser;
  try {
    for (let n = 0; n < 100; n++) {
      try {
        if ((await fetch("http://127.0.0.1:5173")).ok) break;
      } catch { /* Vite is still starting. */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    await page.goto("http://127.0.0.1:5173");
    await page.getByLabel(/E-mail/i).fill(users.globalEmail);
    await page.getByLabel(/Senha/i).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page
      .getByRole("link", { name: "Planos de Ação", exact: true })
      .waitFor();
    for (const route of [
      "/action-plans",
      `/action-plans?inspection=${inspection}`,
      `/action-plans/${source}`,
      `/action-plans/${unitPlan}`,
    ]) {
      await page.goto(`http://127.0.0.1:5173${route}`);
      await page.locator("h1").waitFor();
      await page
        .getByText("Carregando", { exact: false })
        .waitFor({ state: "hidden" });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `Mobile overflow: ${route}`,
      );
    }
    await page.goto("http://127.0.0.1:5173/action-plans");
    await page.getByRole("button", { name: /Novo plano/i }).click();
    await page.getByRole("dialog").waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    console.log(
      "PASS browser login, queue, inspection filter, manual/source details and creation dialog at 375px without horizontal overflow",
    );
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
  }
  await db.query("create database action_plan_sql_review");
  const sqlUrl = new URL(config.DB_URL);
  sqlUrl.pathname = "/action_plan_sql_review";
  execFileSync(
    "npx",
    ["vitest", "run", "tests/action-plans-database.test.ts"],
    {
      env: { ...process.env, ACTION_PLANS_TEST_DATABASE_URL: sqlUrl.href },
      stdio: "inherit",
    },
  );
  console.log(
    "PASS full SQL suite on PostgreSQL, migrations from zero and pre-existing Audit AP/NAT backfill",
  );
} finally {
  await db.end();
}
