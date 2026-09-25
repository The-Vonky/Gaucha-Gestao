import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";
import { chromium } from "playwright";

// Only the disposable Supabase CLI cluster is supported; never accept remote credentials.
const config = JSON.parse(
  execFileSync("npx", ["--yes", "supabase@2.117.0", "status", "-o", "json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
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
    "raceUpdate",
    "raceStatus",
    "raceVerify",
    "raceHold",
    "raceHoldWriter",
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
    "race-status": ["read", "write"],
    "race-verify": ["read", "verify"],
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
    ["raceUpdate", "review-writer", "unit", A, null],
    ["raceStatus", "review-race-status", "unit", A, null],
    ["raceVerify", "review-race-verify", "unit", A, null],
    ["raceHold", "quality", "unit", A, null],
    ["raceHoldWriter", "review-writer", "unit", A, null],
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
  // Authorization races: a caller waits on a row lock while its access is revoked
  // (0006 checked permissions before the wait), and a revocation must wait for an
  // operation that has already been authorized.
  const outcome = (query) =>
    query.then(
      () => ({ allowed: true }),
      (error) => ({ allowed: false, code: error.code }),
    );
  async function session(name, user) {
    const c = new pg.Client({
      connectionString: config.DB_URL,
      application_name: name,
    });
    await c.connect();
    await c.query("set role authenticated");
    await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
      users[user],
    ]);
    return c;
  }
  async function whileWaiting(user, hold, call, revoke) {
    const locker = new pg.Client({ connectionString: config.DB_URL });
    await locker.connect();
    const caller = await session("action-plan-caller", user);
    try {
      await locker.query("begin");
      await locker.query(...hold);
      const result = outcome(caller.query(...call));
      await waitForLock("action-plan-caller");
      if (revoke) await locker.query(...revoke);
      await locker.query("commit");
      return await result;
    } finally {
      await locker.end();
      await caller.end();
    }
  }
  async function revocationWaits(user, call, revoke) {
    const caller = await session("action-plan-holder", user);
    const revoker = new pg.Client({
      connectionString: config.DB_URL,
      application_name: "action-plan-revoker",
    });
    await revoker.connect();
    try {
      await caller.query("begin");
      assert.deepEqual(await outcome(caller.query(...call)), { allowed: true });
      const revoking = revoker.query(...revoke);
      await waitForLock("action-plan-revoker");
      await caller.query("commit");
      await revoking;
    } finally {
      await caller.end();
      await revoker.end();
    }
  }
  const version = async (id) =>
    (await db.query("select version from action_plans.plans where id=$1", [id]))
      .rows[0].version;
  const holdPlan = (id) => [
    "select 1 from action_plans.plans where id=$1 for update",
    [id],
  ];
  const updateCall = async (id) => [
    "select action_plans.update_plan($1,$2,'Corrida','Corrigir','Revisar','Equipe',current_date,'Sem falhas',null,null,'Inspeção')",
    [id, await version(id)],
  ];
  const statusCall = async (id, s) => [
    "select action_plans.set_plan_status($1,$2,$3)",
    [id, await version(id), s],
  ];
  const verifyCall = async (id) => [
    "select action_plans.verify_plan($1,$2,'effective',current_date,'Critério atendido')",
    [id, await version(id)],
  ];
  const denial = { allowed: false, code: "42501" };
  const fill = async (id) =>
    ok(
      await rpc("update_plan", "global", {
        ...values,
        p_id: id,
        p_version: await version(id),
      }),
    );
  // create_manual_plan: profile deactivated while waiting on the unit lock.
  const createCall = [
    "select action_plans.create_manual_plan($1,null,'Revoked during lock wait')",
    [A],
  ];
  const holdUnit = ["update core.units set name=name where id=$1", [A]];
  assert.deepEqual(await whileWaiting("race", holdUnit, createCall), {
    allowed: true,
  });
  assert.deepEqual(
    await whileWaiting("race", holdUnit, createCall, [
      "update core.profiles set active=false where id=$1",
      [users.race],
    ]),
    denial,
  );
  // update_plan: assignment revoked while waiting on the plan lock.
  const updated = await manual("global");
  assert.deepEqual(
    await whileWaiting(
      "raceUpdate",
      holdPlan(updated),
      await updateCall(updated),
    ),
    { allowed: true },
  );
  assert.deepEqual(
    await whileWaiting(
      "raceUpdate",
      holdPlan(updated),
      await updateCall(updated),
      [
        "update core.user_role_assignments set active=false where user_id=$1",
        [users.raceUpdate],
      ],
    ),
    denial,
  );
  // set_plan_status: role deactivated while waiting on the plan lock.
  const progressed = await manual("global");
  await fill(progressed);
  assert.deepEqual(
    await whileWaiting(
      "raceStatus",
      holdPlan(progressed),
      await statusCall(progressed, "in_progress"),
    ),
    { allowed: true },
  );
  assert.deepEqual(
    await whileWaiting(
      "raceStatus",
      holdPlan(progressed),
      await statusCall(progressed, "completed"),
      ["update core.roles set active=false where key='review-race-status'"],
    ),
    denial,
  );
  assert.equal((await get(progressed)).status, "in_progress");
  // verify_plan: permission removed from the role while waiting on the plan lock.
  const verified = await manual("global");
  await fill(verified);
  for (const s of ["in_progress", "completed"])
    ok(
      await rpc("set_plan_status", "global", {
        p_id: verified,
        p_version: await version(verified),
        p_status: s,
      }),
    );
  assert.deepEqual(
    await whileWaiting(
      "raceVerify",
      holdPlan(verified),
      await verifyCall(verified),
    ),
    { allowed: true },
  );
  const beforeReverify = await version(verified);
  assert.deepEqual(
    await whileWaiting(
      "raceVerify",
      holdPlan(verified),
      await verifyCall(verified),
      [
        "delete from core.role_permissions where permission_key='action_plan.verify' and role_id=(select id from core.roles where key='review-race-verify')",
      ],
    ),
    denial,
  );
  assert.equal(await version(verified), beforeReverify);
  // An already-authorized operation holds the caller's authorization rows until commit.
  await revocationWaits("raceHold", createCall, [
    "update core.profiles set active=false where id=$1",
    [users.raceHold],
  ]);
  const held = await manual("global");
  await revocationWaits("raceHoldWriter", await updateCall(held), [
    "update core.user_role_assignments set active=false where user_id=$1",
    [users.raceHoldWriter],
  ]);
  const held2 = await session("action-plan-after", "raceHoldWriter");
  try {
    assert.deepEqual(
      await outcome(held2.query(...(await updateCall(held)))),
      denial,
    );
  } finally {
    await held2.end();
  }
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from action_plans.plans where improvement_point='Revoked during lock wait'",
      )
    ).rows[0].n,
    2,
  );
  console.log(
    "PASS revocation during lock wait denied for create/update/status/verify; revocation waits for authorized in-flight create/update",
  );
  // Browser runs against actual local Auth + Data API on the real production bundle,
  // served from a temporary directory so apps/web/dist is untouched.
  const port = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  const outDir = mkdtempSync(join(tmpdir(), "action-plans-e2e-"));
  const vite = (args, stdio) =>
    spawn(
      process.execPath,
      [resolve("node_modules/vite/bin/vite.js"), ...args],
      {
        cwd: "apps/web",
        env: {
          ...process.env,
          VITE_SUPABASE_URL: config.API_URL,
          VITE_SUPABASE_PUBLISHABLE_KEY: config.ANON_KEY,
        },
        stdio,
      },
    );
  const build = vite(["build", "--outDir", outDir, "--emptyOutDir"], "inherit");
  const code = await new Promise((r) => build.on("exit", r));
  assert.equal(code, 0, "vite build failed");
  const server = vite(
    [
      "preview",
      "--outDir",
      outDir,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    ["ignore", "pipe", "pipe"],
  );
  let serverLog = "";
  let exited = null;
  server.stdout.on("data", (d) => (serverLog += d));
  server.stderr.on("data", (d) => (serverLog += d));
  server.on("exit", (c) => (exited = c ?? "signal"));
  let browser;
  try {
    // Readiness: the preview server answers the SPA shell on the exact origin used below.
    const deadline = Date.now() + 60000;
    for (;;) {
      if (exited !== null)
        throw Error(`Preview server exited (${exited}):\n${serverLog}`);
      try {
        const res = await fetch(origin);
        if (res.ok && (await res.text()).includes('id="root"')) break;
      } catch {
        /* Not listening yet. */
      }
      if (Date.now() > deadline)
        throw Error(`Preview server not ready at ${origin}:\n${serverLog}`);
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 375, height: 812 },
    });
    await page.goto(origin);
    await page.getByLabel(/E-mail/i).fill(users.globalEmail);
    await page.getByLabel(/Senha/i).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page
      // The mobile sidebar is collapsed; the permission-driven Home entry is visible.
      .getByRole("heading", { level: 2, name: "Planos de Ação", exact: true })
      .waitFor();
    for (const route of [
      "/action-plans",
      `/action-plans?inspection=${inspection}`,
      `/action-plans/${source}`,
      `/action-plans/${unitPlan}`,
    ]) {
      await page.goto(`${origin}${route}`);
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
    await page.goto(`${origin}/action-plans`);
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
    server.kill();
    rmSync(outDir, { recursive: true, force: true });
  }
  await db.query("drop database if exists action_plan_sql_review");
  await db.query("create database action_plan_sql_review");
  const sqlUrl = new URL(config.DB_URL);
  sqlUrl.pathname = "/action_plan_sql_review";
  execFileSync(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "tests/action-plans-database.test.ts",
    ],
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
