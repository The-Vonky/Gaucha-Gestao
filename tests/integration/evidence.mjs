import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

// Evidence / Storage v1 against the real local Supabase stack (Auth, PostgREST, Storage API,
// PostgreSQL). Only the disposable Supabase CLI cluster is supported.
const config = JSON.parse(
  execFileSync("npx", ["--yes", "supabase@2.117.0", "status", "-o", "json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
for (const url of [config.API_URL, config.DB_URL])
  assert.equal(new URL(url).hostname, "127.0.0.1");
const BUCKET = "action-plan-evidence";
const PDF = "application/pdf";
const db = new pg.Client({ connectionString: config.DB_URL });
await db.connect();
const password = `Local-${randomUUID()}-aA1!`;
const users = {};
const clients = {};
const tag = randomUUID().slice(0, 8);
const A = randomUUID(),
  B = randomUUID(),
  S = randomUUID();
const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const must = (r) => {
  assert.equal(r.error, null, JSON.stringify(r.error));
  return r.data;
};
const ap = (u) => clients[u].schema("action_plans");
const bucket = (u) => clients[u].storage.from(BUCKET);
const bytes = Buffer.from("%PDF-1.4\n% evidence\n");
const pdf = (content = bytes) => new Blob([content], { type: PDF });
async function begin(u, plan, kind = "execution", name = "laudo.pdf") {
  return must(
    await ap(u).rpc("begin_evidence_upload", {
      p_plan: plan,
      p_kind: kind,
      p_original_name: name,
      p_content_type: PDF,
      p_size: bytes.length,
    }),
  )[0];
}
const upload = (u, key, body = pdf()) =>
  bucket(u).upload(key, body, { upsert: false, cacheControl: "0" });
const confirm = (u, id) =>
  ap(u).rpc("confirm_evidence_upload", { p_evidence: id });
async function attach(u, plan, kind = "execution", name = "laudo.pdf") {
  const b = await begin(u, plan, kind, name);
  must(await upload(u, b.object_key));
  must(await confirm(u, b.evidence_id));
  return b;
}
const list = async (u, plan) =>
  must(await ap(u).rpc("plan_evidence", { p_plan: plan }));
const version = async (id) =>
  (await db.query("select version from action_plans.plans where id=$1", [id]))
    .rows[0].version;
const values = {
  p_improvement_point: "Evidência",
  p_action: "Corrigir",
  p_how_to: "Revisar",
  p_responsible: "Equipe",
  p_due_date: new Date().toISOString().slice(0, 10),
  p_effectiveness_criterion: "Sem falhas",
  p_monitoring_start: null,
  p_monitoring_end: null,
  p_expected_evidence: "Fotos",
};
async function plan(unit = A, sector = null, status = "completed") {
  const id = must(
    await ap("global").rpc("create_manual_plan", {
      p_unit: unit,
      p_sector: sector,
      p_improvement_point: "Evidência",
    }),
  );
  must(
    await ap("global").rpc("update_plan", {
      ...values,
      p_id: id,
      p_version: 1,
    }),
  );
  if (status === "completed")
    must(
      await ap("global").rpc("set_plan_status", {
        p_id: id,
        p_version: 2,
        p_status: "completed",
      }),
    );
  return id;
}
const verify = async (u, id) =>
  ap(u).rpc("verify_plan", {
    p_id: id,
    p_version: await version(id),
    p_effectiveness: "effective",
    p_verified_on: values.p_due_date,
    p_notes: "Critério atendido",
  });
const report = async (planId) =>
  (
    await db.query(
      "select issue,evidence_id,object_key,detail from action_plans_private.evidence_reconciliation() where object_key like $1",
      [`${planId}/%`],
    )
  ).rows;
/** Backdates a pending upload beyond the 1-hour window (operator-side test setup). */
const expire = (id) =>
  db.query(`begin; alter table action_plans.evidence disable trigger guard_evidence;
 update action_plans.evidence set created_at=now()-interval '2 hours' where id='${id}';
 alter table action_plans.evidence enable trigger guard_evidence; commit;`);
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
const outcome = (query) =>
  query.then(
    () => ({ allowed: true }),
    (error) => ({ allowed: false, code: error.code, message: error.message }),
  );
/** Runs `second` while `first` holds its transaction open, then commits `first`. */
async function race(firstUser, first, secondUser, second) {
  const a = await session("evidence-first", firstUser);
  const b = await session("evidence-second", secondUser);
  try {
    await a.query("begin");
    const firstResult = await outcome(a.query(...first));
    const secondResult = outcome(b.query(...second));
    await waitForLock("evidence-second");
    await a.query("commit");
    return [firstResult, await secondResult];
  } finally {
    await a.end();
    await b.end();
  }
}
try {
  for (const name of [
    "global",
    "unit",
    "sector",
    "writer",
    "verifier",
    "other",
    "empty",
    "raceWriter",
  ]) {
    const email = `evidence-${name.toLowerCase()}-${randomUUID()}@example.test`;
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
    users[`${name}Email`] = email;
    clients[name] = createClient(config.API_URL, config.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    must(await clients[name].auth.signInWithPassword({ email, password }));
  }
  clients.anon = createClient(config.API_URL, config.ANON_KEY, {
    auth: { persistSession: false },
  });
  await db.query(
    "insert into core.units(id,code,name) values ($1,$3,'Evidência A'),($2,$4,'Evidência B')",
    [A, B, `EV-A-${tag}`, `EV-B-${tag}`],
  );
  await db.query(
    "insert into core.sectors(id,code,name) values ($1,$2,'Setor Evidência')",
    [S, `EV-S-${tag}`],
  );
  await db.query("insert into core.unit_sectors values($1,$2)", [A, S]);
  for (const [key, permissions] of Object.entries({
    all: ["read", "create_manual", "write", "verify"],
    writer: ["read", "write"],
    verifier: ["read", "verify"],
  })) {
    const role = (
      await db.query(
        "insert into core.roles(key,name) values($1,$1) returning id",
        [`evidence-${key}-${tag}`],
      )
    ).rows[0].id;
    for (const p of permissions)
      await db.query("insert into core.role_permissions values($1,$2)", [
        role,
        `action_plan.${p}`,
      ]);
  }
  for (const [name, role, scope, unit, sector] of [
    ["global", "quality", "global", null, null],
    ["unit", "quality", "unit", A, null],
    ["sector", `evidence-all-${tag}`, "sector", A, S],
    ["writer", `evidence-writer-${tag}`, "unit", A, null],
    ["verifier", `evidence-verifier-${tag}`, "unit", A, null],
    ["other", "quality", "unit", B, null],
    ["raceWriter", `evidence-writer-${tag}`, "unit", A, null],
  ])
    await db.query(
      "insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select $1,id,$3,$4,$5 from core.roles where key=$2",
      [users[name], role, scope, unit, sector],
    );

  // Full flow: begin -> Storage upload -> confirm -> list -> signed attachment download.
  const main = await plan();
  const name = "Relatório ação.pdf";
  const first = await begin("writer", main, "execution", name);
  assert.equal(first.object_key, `${main}/${first.evidence_id}`);
  must(await upload("writer", first.object_key));
  const object = (
    await db.query(
      "select owner_id,metadata from storage.objects where bucket_id=$1 and name=$2",
      [BUCKET, first.object_key],
    )
  ).rows[0];
  assert.equal(object.owner_id, users.writer);
  assert.equal(object.metadata.size, bytes.length);
  assert.equal(object.metadata.mimetype, PDF);
  assert.equal(object.metadata.cacheControl, "max-age=0");
  assert.deepEqual(await list("writer", main), []);
  must(await confirm("writer", first.evidence_id));
  must(await confirm("writer", first.evidence_id));
  const [row] = await list("unit", main);
  assert.equal(row.original_name, name);
  assert.equal(row.uploaded_by_name.length > 0, true);
  assert.equal(await version(main), 3);
  const signed = must(
    await bucket("unit").createSignedUrl(first.object_key, 60),
  ).signedUrl;
  const token = JSON.parse(
    Buffer.from(
      new URL(signed).searchParams.get("token").split(".")[1],
      "base64url",
    ),
  );
  assert.equal(token.exp - token.iat, 60);
  const url = new URL(signed);
  url.searchParams.set("download", name);
  const res = await fetch(url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), PDF);
  const disposition = res.headers.get("content-disposition");
  assert.match(disposition, /^attachment;/);
  assert.equal(
    decodeURIComponent(/filename\*=UTF-8''(.+)$/.exec(disposition)[1]),
    name,
  );
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes);
  const [event] = (
    await db.query(
      "select action,after_data,metadata from core.system_audit_log where entity_type='evidence' and entity_id=$1",
      [first.evidence_id],
    )
  ).rows;
  assert.equal(event.action, "evidence_add");
  assert.ok(!JSON.stringify(event).includes(first.object_key));
  assert.ok(!JSON.stringify(event).includes("token"));
  console.log(
    `OBSERVED Storage download headers: content-type=${res.headers.get("content-type")}; content-disposition=${disposition}; cache-control=${res.headers.get("cache-control") ?? "(absent)"}; x-content-type-options=${res.headers.get("x-content-type-options") ?? "(absent)"}`,
  );
  console.log(
    "PASS real upload/confirm/list/signed attachment download (60 s token, UTF-8 name, owner_id and metadata verified, idempotent confirm, safe audit)",
  );

  // The bucket rejects disallowed MIME types and oversize bodies even outside the UI.
  const direct = await begin("writer", main);
  for (const [body, pattern] of [
    [
      new Blob(["<html><script>1</script>"], { type: "text/html" }),
      /mime type/,
    ],
    [new Blob(["<svg/>"], { type: "image/svg+xml" }), /mime type/],
    [new Blob(["MZ"], { type: "application/x-msdownload" }), /mime type/],
    [new Blob([Buffer.alloc(10485761)], { type: PDF }), /maximum allowed size/],
  ]) {
    const { error } = await upload("writer", direct.object_key, body);
    assert.match(error?.message ?? "", pattern);
  }
  // Write-once: no upsert/update/move/copy/delete by clients.
  for (const attempt of [
    () =>
      bucket("writer").upload(first.object_key, pdf(), {
        upsert: true,
      }),
    () => bucket("writer").update(first.object_key, pdf()),
    () => bucket("writer").copy(first.object_key, `${main}/${randomUUID()}`),
    () => bucket("writer").move(first.object_key, `${main}/${randomUUID()}`),
  ])
    assert.ok((await attempt()).error);
  assert.deepEqual(must(await bucket("writer").remove([first.object_key])), []);
  assert.deepEqual(must(await bucket("unit").remove([first.object_key])), []);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from storage.objects where name=$1",
        [first.object_key],
      )
    ).rows[0].n,
    1,
  );
  console.log(
    "PASS bucket rejects HTML/SVG/executable/oversize; clients cannot upsert, update, copy, move or delete objects",
  );

  // Scope and guessed keys: Storage policies check metadata + current permission.
  const pending = await begin("writer", main);
  assert.match(
    (await upload("other", pending.object_key)).error?.message ?? "",
    /row-level security/,
  );
  assert.match(
    (await upload("unit", pending.object_key)).error?.message ?? "",
    /row-level security/,
  );
  assert.match(
    (await upload("writer", `${main}/${randomUUID()}`)).error?.message ?? "",
    /row-level security/,
  );
  for (const u of ["other", "sector", "empty", "anon"])
    assert.ok(
      (
        await clients[u].storage
          .from(BUCKET)
          .createSignedUrl(first.object_key, 60)
      ).error,
      `${u} must not sign`,
    );
  assert.ok(
    (await bucket("unit").createSignedUrl(`${main}/${randomUUID()}`, 60)).error,
  );
  assert.ok(
    (await bucket("writer").createSignedUrl(pending.object_key, 60)).error,
    "pending objects are not signable",
  );
  assert.notEqual(
    (
      await fetch(
        `${config.API_URL}/storage/v1/object/public/${BUCKET}/${first.object_key}`,
      )
    ).status,
    200,
  );
  for (const u of ["other", "sector", "empty"])
    assert.deepEqual(await list(u, main), []);
  assert.equal(
    (
      await ap("other").rpc("begin_evidence_upload", {
        p_plan: main,
        p_kind: "execution",
        p_original_name: "x.pdf",
        p_content_type: PDF,
        p_size: 1,
      })
    ).error?.code,
    "42501",
  );
  const sectorPlan = await plan(A, S);
  const sectorEvidence = await attach("sector", sectorPlan);
  assert.ok(
    must(await bucket("sector").createSignedUrl(sectorEvidence.object_key, 60))
      .signedUrl,
  );
  // Removed evidence can no longer be signed.
  must(
    await ap("writer").rpc("remove_evidence", {
      p_evidence: first.evidence_id,
    }),
  );
  assert.ok((await bucket("unit").createSignedUrl(first.object_key, 60)).error);
  console.log(
    "PASS Storage INSERT/SELECT policies: other unit/sector/anon/guessed keys denied, pending and removed objects unsignable",
  );

  // Partial failures stay invisible and are reported to operators.
  const failures = await plan();
  const neverUploaded = await begin("writer", failures);
  const neverConfirmed = await begin("writer", failures);
  must(await upload("writer", neverConfirmed.object_key));
  const lost = await attach("writer", failures);
  const orphan = `${failures}/${randomUUID()}`;
  must(await service.storage.from(BUCKET).upload(orphan, pdf()));
  must(await service.storage.from(BUCKET).remove([lost.object_key]));
  assert.ok((await bucket("unit").createSignedUrl(lost.object_key, 60)).error);
  await expire(neverUploaded.evidence_id);
  await expire(neverConfirmed.evidence_id);
  assert.equal(
    (await confirm("writer", neverConfirmed.evidence_id)).error?.message,
    "Upload expired",
  );
  assert.match(
    (await upload("writer", neverUploaded.object_key)).error?.message ?? "",
    /row-level security/,
  );
  assert.deepEqual(
    (await list("unit", failures)).map((e) => e.id),
    [lost.evidence_id],
  );
  const issues = (await report(failures)).map((r) => [
    r.issue,
    r.evidence_id ?? r.object_key,
    r.detail,
  ]);
  assert.deepEqual(
    issues.sort(),
    [
      ["available_missing_object", lost.evidence_id, null],
      ["expired_pending", neverConfirmed.evidence_id, "object present"],
      ["expired_pending", neverUploaded.evidence_id, "no object"],
      ["orphan_object", orphan, null],
    ].sort(),
  );
  console.log(
    "PASS interrupted upload, unconfirmed upload, object without metadata and metadata without object are inert and reported by reconciliation",
  );

  // Verification rounds with real Storage objects.
  const rounds = await plan();
  const execution = await attach("writer", rounds, "execution");
  const r1 = await attach("verifier", rounds, "verification");
  must(await verify("verifier", rounds));
  const r2 = await attach("verifier", rounds, "verification");
  assert.equal(
    (
      await ap("verifier").rpc("remove_evidence", {
        p_evidence: r1.evidence_id,
      })
    ).error?.message,
    "Verification round is closed",
  );
  assert.equal(
    (
      await ap("writer").rpc("remove_evidence", {
        p_evidence: execution.evidence_id,
      })
    ).error?.message,
    "Verified plan is locked",
  );
  must(await verify("verifier", rounds));
  assert.deepEqual(
    (await list("unit", rounds)).map((e) => [e.id, e.verification_round]),
    [
      [execution.evidence_id, null],
      [r1.evidence_id, 1],
      [r2.evidence_id, 2],
    ],
  );
  assert.deepEqual(
    (
      await db.query(
        "select action,(after_data->>'verification_round')::int n from core.system_audit_log where entity_type='plan' and entity_id=$1 and action in ('verify','re_verify') order by occurred_at",
        [rounds],
      )
    ).rows,
    [
      { action: "verify", n: 1 },
      { action: "re_verify", n: 2 },
    ],
  );
  console.log(
    "PASS verification rounds bind evidence to verify/re_verify; closed rounds and verified execution are frozen",
  );

  // Concurrency with real PostgreSQL sessions.
  const verifySql = async (id) => [
    "select action_plans.verify_plan($1,$2,'effective',current_date,'Corrida')",
    [id, await version(id)],
  ];
  const confirmSql = (id) => [
    "select action_plans.confirm_evidence_upload($1)",
    [id],
  ];
  const removeSql = (id) => ["select action_plans.remove_evidence($1)", [id]];
  const beginSql = (id, kind = "execution") => [
    "select * from action_plans.begin_evidence_upload($1,$2,'laudo.pdf',$3,$4)",
    [id, kind, PDF, bytes.length],
  ];
  // Verification commits first: the waiting execution confirm/remove and open-round confirm fail.
  const vr = await plan();
  const exPending = await begin("writer", vr);
  must(await upload("writer", exPending.object_key));
  const vrPending = await begin("verifier", vr, "verification");
  must(await upload("verifier", vrPending.object_key));
  const exDone = await attach("writer", vr);
  let [held, waited] = await race(
    "verifier",
    await verifySql(vr),
    "writer",
    confirmSql(exPending.evidence_id),
  );
  assert.deepEqual(held, { allowed: true });
  assert.equal(waited.code, "55000");
  assert.equal(waited.message, "Verified plan is locked");
  assert.equal(
    (await confirm("verifier", vrPending.evidence_id)).error?.message,
    "Verification round is closed",
  );
  assert.equal(
    (
      await ap("writer").rpc("remove_evidence", {
        p_evidence: exDone.evidence_id,
      })
    ).error?.message,
    "Verified plan is locked",
  );
  // Evidence change commits first: the verification waits and then records it in its round.
  const vr2 = await plan();
  const vr2Pending = await begin("verifier", vr2, "verification");
  must(await upload("verifier", vr2Pending.object_key));
  [held, waited] = await race(
    "verifier",
    confirmSql(vr2Pending.evidence_id),
    "verifier",
    await verifySql(vr2),
  );
  assert.deepEqual([held, waited], [{ allowed: true }, { allowed: true }]);
  assert.deepEqual(
    (await list("unit", vr2)).map((e) => e.verification_round),
    [1],
  );
  // Concurrent removal: one removes, the other is an idempotent no-op; one audit event.
  const rm = await attach("writer", await plan());
  [held, waited] = await race(
    "writer",
    removeSql(rm.evidence_id),
    "unit",
    removeSql(rm.evidence_id),
  );
  assert.deepEqual([held, waited], [{ allowed: true }, { allowed: true }]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from core.system_audit_log where entity_id=$1 and action='evidence_remove'",
        [rm.evidence_id],
      )
    ).rows[0].n,
    1,
  );
  // Two concurrent begins at 19 active items: exactly one succeeds.
  const limited = await plan(A, null, "pending");
  for (let n = 0; n < 19; n++) await begin("writer", limited);
  [held, waited] = await race(
    "writer",
    beginSql(limited),
    "unit",
    beginSql(limited),
  );
  assert.deepEqual(held, { allowed: true });
  assert.equal(waited.message, "Evidence limit reached");
  // Revocation committed while the caller waits on the plan lock is observed.
  const revoked = await plan(A, null, "pending");
  const locker = new pg.Client({ connectionString: config.DB_URL });
  await locker.connect();
  const caller = await session("evidence-caller", "raceWriter");
  try {
    await locker.query("begin");
    await locker.query(
      "select 1 from action_plans.plans where id=$1 for update",
      [revoked],
    );
    const pendingBegin = outcome(caller.query(...beginSql(revoked)));
    await waitForLock("evidence-caller");
    await locker.query(
      "update core.user_role_assignments set active=false where user_id=$1",
      [users.raceWriter],
    );
    await locker.query("commit");
    assert.equal((await pendingBegin).code, "42501");
  } finally {
    await locker.end();
    await caller.end();
  }
  // Simultaneous uploads by different users to the same plan.
  const shared = await plan();
  const both = await Promise.all([
    attach("writer", shared, "execution", "a.pdf"),
    attach("unit", shared, "execution", "b.pdf"),
  ]);
  assert.deepEqual(
    (await list("unit", shared)).map((e) => e.id).sort(),
    both.map((b) => b.evidence_id).sort(),
  );
  assert.equal(await version(shared), 3);
  console.log(
    "PASS verify serializes with confirm/remove, idempotent concurrent removal, limit under concurrent begins, revocation during lock wait, simultaneous uploads",
  );

  // Browser: real bundle, real Auth/Data API/Storage, 375px.
  const port = await new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  const outDir = mkdtempSync(join(tmpdir(), "evidence-e2e-"));
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
  assert.equal(await new Promise((r) => build.on("exit", r)), 0);
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
  let browser;
  try {
    const deadline = Date.now() + 60000;
    for (;;) {
      try {
        const r = await fetch(origin);
        if (r.ok && (await r.text()).includes('id="root"')) break;
      } catch {
        /* Not listening yet. */
      }
      if (Date.now() > deadline) throw Error("Preview server not ready");
      await new Promise((r) => setTimeout(r, 100));
    }
    browser = await chromium.launch();
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const noOverflow = async (what) =>
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `Mobile overflow: ${what}`,
      );
    await page.goto(origin);
    await page.getByLabel(/E-mail/i).fill(users.unitEmail);
    await page.getByLabel(/Senha/i).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page
      .getByRole("heading", { level: 2, name: "Planos de Ação", exact: true })
      .waitFor();
    const uiPlan = await plan();
    await page.goto(`${origin}/action-plans/${uiPlan}`);
    await page
      .getByRole("heading", { name: "Evidências da execução" })
      .waitFor();
    await page
      .getByText("Carregando", { exact: false })
      .first()
      .waitFor({ state: "hidden" });
    await noOverflow("plan detail");
    const longName = `${"Relatório de inspeção da cozinha central ".repeat(3).trim()}.pdf`;
    const inputs = page.locator('input[type="file"]');
    await inputs
      .first()
      .setInputFiles({ name: longName, mimeType: "", buffer: bytes });
    await page.getByText(longName).waitFor();
    await noOverflow("long evidence name");
    await inputs.last().setInputFiles({
      name: "foto.png",
      mimeType: "image/png",
      buffer: bytes,
    });
    await page.getByText(/não corresponde ao formato .png/).waitFor();
    await inputs.last().setInputFiles({
      name: "planilha.xls",
      mimeType: "application/vnd.ms-excel",
      buffer: bytes,
    });
    await page
      .getByText(/Formato não permitido/)
      .first()
      .waitFor();
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: "Baixar" }).first().click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), longName);
    await page.getByRole("button", { name: `Remover ${longName}` }).click();
    await page.getByRole("dialog").getByText("Remover evidência").waitFor();
    await noOverflow("remove dialog");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirmar" })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page
      .getByRole("listitem")
      .filter({ hasText: longName })
      .waitFor({ state: "detached" });
    assert.equal((await list("unit", uiPlan)).length, 0);
    await page
      .getByRole("heading", { name: "Evidências da verificação" })
      .waitFor();
    await inputs
      .last()
      .setInputFiles({ name: "verificacao.pdf", mimeType: PDF, buffer: bytes });
    await page.getByText("verificacao.pdf").waitFor();
    assert.deepEqual(
      (await list("unit", uiPlan)).map((e) => [e.kind, e.verification_round]),
      [["verification", 1]],
    );
    await noOverflow("verification evidence");
    console.log(
      "PASS browser at 375px: attach (execution/verification), client rejection of spoofed PNG and XLS, attachment download with original name, removal dialog, no horizontal overflow",
    );
  } finally {
    await browser?.close();
    server.kill();
    rmSync(outDir, { recursive: true, force: true });
  }
} finally {
  await db.end();
}
