import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import pg from "pg";
import { chromium } from "playwright";

// Audit Domain v1 against real Supabase Auth, PostgREST and PostgreSQL sessions.
// Only the disposable Supabase CLI cluster is supported; never accept remote credentials.
const config = JSON.parse(
  execFileSync("npx", ["--yes", "supabase@2.117.0", "status", "-o", "json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  }),
);
for (const url of [config.API_URL, config.DB_URL])
  assert.equal(new URL(url).hostname, "127.0.0.1");
const catalog = JSON.parse(
  readFileSync("docs/reference/AUDIT_CHECKLIST_V1.json", "utf8"),
);
const VERSION = "checklist-geral-2026-09-22-v1";
const db = new pg.Client({ connectionString: config.DB_URL });
await db.connect();
const password = `Local-${randomUUID()}-aA1!`;
const users = {};
const tokens = {};
const A = randomUUID(),
  B = randomUUID(),
  C = randomUUID(),
  S = randomUUID();
const AUDIT = ["read", "create", "edit", "finalize", "reopen"].map(
  (p) => `audit.inspection.${p}`,
);
async function request(path, token, body, method = "POST", schema = "audit") {
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
const rpc = (name, user, args = {}, schema = "audit") =>
  request(`/rest/v1/rpc/${name}`, tokens[user], args, "POST", schema);
const get = (path, user) =>
  request(`/rest/v1/${path}`, tokens[user], undefined, "GET");
const patchAnswer = (user, inspection, item, values, version) =>
  request(
    `/rest/v1/inspection_answers?inspection_id=eq.${inspection}&item_key=eq.${item}${version ? `&version=eq.${version}` : ""}`,
    tokens[user],
    values,
    "PATCH",
  );
function ok(r) {
  assert.ok(r.status < 300, JSON.stringify(r));
  return r.data;
}
function denied(r) {
  assert.ok([401, 403].includes(r.status), JSON.stringify(r));
}
function fails(r, code) {
  assert.ok(r.status >= 400, JSON.stringify(r));
  assert.equal(r.data?.code, code, JSON.stringify(r));
}
async function authUser(name, login = true) {
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
  users[`${name}Email`] = email;
  if (login) {
    const r = await request("/auth/v1/token?grant_type=password", null, {
      email,
      password,
    });
    tokens[name] = ok(r).access_token;
  }
  return users[name];
}
async function role(key, permissions) {
  const id = (
    await db.query(
      "insert into core.roles(key,name) values($1,$1) returning id",
      [key],
    )
  ).rows[0].id;
  for (const p of permissions)
    await db.query("insert into core.role_permissions values($1,$2)", [id, p]);
  return id;
}
async function assign(user, roleKey, scope = "unit", unit = A, sector = null) {
  await db.query(
    "insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select $1,id,$3,$4,$5 from core.roles where key=$2",
    [users[user], roleKey, scope, scope === "global" ? null : unit, sector],
  );
}
const tag = randomUUID().slice(0, 8);
const inspectionRow = async (id) =>
  (await db.query("select * from audit.inspections where id=$1", [id])).rows[0];
const answerRow = async (id, item) =>
  (
    await db.query(
      "select * from audit.inspection_answers where inspection_id=$1 and item_key=$2",
      [id, item],
    )
  ).rows[0];
/** Operator fill by checklist position: responses[i] answers position i+1, `rest` the others. */
async function fill(id, responses, rest = null) {
  await db.query(
    `update audit.inspection_answers a set response=coalesce(($2::text[])[x.position],$3)
     from audit.checklist_items x where a.inspection_id=$1 and x.template_version=a.template_version and x.key=a.item_key`,
    [id, responses, rest],
  );
}
const repeat = (...parts) => parts.flatMap(([r, n]) => Array(n).fill(r));
const create = async (
  user,
  unit = A,
  applied = "2026-09-20",
  previous = null,
) =>
  ok(
    await rpc("create_inspection", user, {
      p_unit: unit,
      p_applied_on: applied,
      p_previous_visit_on: previous,
    }),
  );
async function waitForLock(match) {
  for (let n = 0; n < 200; n++) {
    const r = await db.query(
      "select 1 from pg_stat_activity where wait_event_type='Lock' and (application_name=$1 or query ilike $2)",
      [match, `%${match}%`],
    );
    if (r.rowCount) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error(`Expected ${match} to wait on a database lock`);
}
const outcome = (query) =>
  query.then(
    (r) => ({ allowed: true, rows: r.rowCount }),
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
try {
  await db.query(
    "insert into core.units(id,code,name) values ($1,$4,'Auditoria A'),($2,$5,'Auditoria B'),($3,$6,'Auditoria C')",
    [A, B, C, `AUD-A-${tag}`, `AUD-B-${tag}`, `AUD-C-${tag}`],
  );
  await db.query(
    "insert into core.sectors(id,code,name) values ($1,$2,'Setor Auditoria')",
    [S, `AUD-S-${tag}`],
  );
  await db.query("insert into core.unit_sectors values ($1,$2)", [A, S]);
  const sparse = {
    reader: ["read"],
    createOnly: ["create"],
    editOnly: ["edit"],
    readEdit: ["read", "edit"],
    finalizeOnly: ["finalize"],
    readFinalize: ["read", "finalize"],
    readReopen: ["read", "reopen"],
  };
  for (const [name, perms] of Object.entries(sparse))
    await role(
      `aud-${tag}-${name.toLowerCase()}`,
      perms.map((p) => `audit.inspection.${p}`),
    );
  for (const [name, roleKey, scope, unit, sector] of [
    ["global", "quality", "global"],
    ["unitA", "quality", "unit", A],
    ["unitB", "quality", "unit", B],
    ["sector", "quality", "sector", A, S],
    ["inactive", "quality", "global"],
    ["empty"],
    ["ui", "quality", "unit", A],
    ["uiOther", "quality", "unit", A],
    ["uiRevoked", "quality", "unit", A],
    ...Object.keys(sparse).map((n) => [
      n,
      `aud-${tag}-${n.toLowerCase()}`,
      "unit",
      A,
    ]),
  ]) {
    await authUser(name);
    if (roleKey) await assign(name, roleKey, scope, unit, sector);
  }
  await db.query("update core.profiles set active=false where id=$1", [
    users.inactive,
  ]);
  await db.query("update core.units set active=false where id=$1", [C]);

  // ---------------------------------------------------------------- Catalog
  const sections = ok(
    await get(
      `checklist_sections?template_version=eq.${VERSION}&order=position`,
      "reader",
    ),
  );
  const items = ok(
    await get(
      `checklist_items?template_version=eq.${VERSION}&order=position`,
      "reader",
    ),
  );
  const [template] = ok(
    await get(`checklist_templates?version=eq.${VERSION}`, "reader"),
  );
  assert.deepEqual(
    ok(
      await get("checklist_templates?active=is.true&select=version", "reader"),
    ),
    [{ version: VERSION }],
  );
  assert.deepEqual(
    {
      version: template.version,
      item_count: template.item_count,
      active: template.active,
    },
    { version: VERSION, item_count: 158, active: true },
  );
  assert.equal(catalog.catalogVersion, VERSION);
  assert.deepEqual(
    sections.map(({ key, position, name }) => ({ key, position, name })),
    catalog.sections.map((s) => ({
      key: s.key,
      position: s.order,
      name: s.name,
    })),
  );
  const expectedItems = catalog.sections.flatMap((s) =>
    s.items.map((i) => ({
      key: i.key,
      section_key: s.key,
      number: i.number,
      text: i.text,
    })),
  );
  assert.deepEqual(
    items.map(({ key, section_key, number, text }) => ({
      key,
      section_key,
      number,
      text,
    })),
    expectedItems,
  );
  assert.deepEqual(
    items.map((i) => i.position),
    items.map((_, n) => n + 1),
  );
  assert.equal(sections.length, 9);
  assert.equal(items.length, 158);
  assert.deepEqual(
    sections.map((s) => items.filter((i) => i.section_key === s.key).length),
    [13, 22, 16, 21, 12, 31, 10, 21, 12],
  );
  const numbers = new Set(items.map((i) => i.number));
  assert.equal(Math.max(...numbers), 161);
  assert.deepEqual(
    Array.from({ length: 161 }, (_, n) => n + 1).filter((n) => !numbers.has(n)),
    [32, 117, 135],
  );
  for (const i of items)
    assert.equal(i.key, `item-${String(i.number).padStart(3, "0")}`);
  // Migration 0005 is a verbatim copy of the reference (SQL quote escaping aside).
  const seeded = [
    ...readFileSync(
      "supabase/migrations/202609240005_audit_checklist_v1.sql",
      "utf8",
    ).matchAll(
      /^\('checklist-geral-2026-09-22-v1','(item-\d{3})','(section-\d{2})',(\d+),(\d+),'((?:[^']|'')*)'\)[,;]$/gm,
    ),
  ].map((m) => ({
    key: m[1],
    section_key: m[2],
    number: Number(m[4]),
    text: m[5].replaceAll("''", "'"),
  }));
  assert.deepEqual(seeded, expectedItems);
  // Client read-only; anonymous callers cannot read the catalog.
  denied(
    await request(
      `/rest/v1/checklist_items?key=eq.item-001`,
      tokens.global,
      { text: "x" },
      "PATCH",
    ),
  );
  denied(
    await request("/rest/v1/checklist_items", tokens.global, [
      { template_version: VERSION, key: "item-999" },
    ]),
  );
  denied(
    await request(
      "/rest/v1/checklist_items?key=eq.item-001",
      tokens.global,
      undefined,
      "DELETE",
    ),
  );
  denied(
    await request(
      "/rest/v1/checklist_items?select=key",
      null,
      undefined,
      "GET",
    ),
  );
  assert.deepEqual(ok(await get("checklist_items?select=key", "empty")), []);
  assert.deepEqual(ok(await get("checklist_items?select=key", "inactive")), []);
  console.log(
    "PASS catalog equals reference JSON and 0005 verbatim; 9/158/161, gaps 32/117/135; client read-only",
  );

  // ---------------------------------------------------------------- Create
  const first = await create("unitA", A, "2026-09-20", "2026-08-20");
  let row = await inspectionRow(first);
  assert.deepEqual(
    {
      unit: row.unit_id,
      template: row.template_version,
      status: row.status,
      version: row.version,
      responsible: row.responsible_id,
      created: row.created_by,
      score: row.final_score,
      cls: row.final_classification,
      fat: row.finalized_at,
      fby: row.finalized_by,
    },
    {
      unit: A,
      template: VERSION,
      status: "draft",
      version: 1,
      responsible: users.unitA,
      created: users.unitA,
      score: null,
      cls: null,
      fat: null,
      fby: null,
    },
  );
  const counts = async (id) =>
    (
      await db.query(
        "select count(*)::int total,count(response)::int answered,count(distinct item_key)::int keys from audit.inspection_answers where inspection_id=$1",
        [id],
      )
    ).rows[0];
  assert.deepEqual(await counts(first), { total: 158, answered: 0, keys: 158 });
  const noDate = ok(
    await rpc("create_inspection", "unitA", { p_unit: A, p_applied_on: null }),
  );
  assert.equal(
    (
      await db.query(
        "select applied_on=current_date ok,previous_visit_on from audit.inspections where id=$1",
        [noDate],
      )
    ).rows[0].ok,
    true,
  );
  const inspectionCount = async () =>
    (
      await db.query(
        "select count(*)::int n from audit.inspections where unit_id = any($1)",
        [[A, B, C]],
      )
    ).rows[0].n;
  const before = await inspectionCount();
  fails(
    await rpc("create_inspection", "unitA", {
      p_unit: A,
      p_applied_on: "2026-09-01",
      p_previous_visit_on: "2026-09-02",
    }),
    "23514",
  );
  fails(
    await rpc("create_inspection", "global", {
      p_unit: C,
      p_applied_on: "2026-09-01",
    }),
    "23514",
  );
  fails(
    await rpc("create_inspection", "global", {
      p_unit: randomUUID(),
      p_applied_on: "2026-09-01",
    }),
    "23514",
  );
  for (const [user, unit] of [
    ["unitA", B],
    ["unitA", randomUUID()],
    ["unitA", C],
    ["sector", A],
    ["reader", A],
    ["editOnly", A],
    ["empty", A],
    ["inactive", A],
  ])
    fails(
      await rpc("create_inspection", user, {
        p_unit: unit,
        p_applied_on: "2026-09-01",
      }),
      "42501",
    );
  denied(
    await request("/rest/v1/rpc/create_inspection", null, {
      p_unit: A,
      p_applied_on: "2026-09-01",
    }),
  );
  // Template states: none active, and an incomplete active template, leave no partial rows.
  await db.query(
    "update audit.checklist_templates set active=false where version=$1",
    [VERSION],
  );
  fails(
    await rpc("create_inspection", "unitA", {
      p_unit: A,
      p_applied_on: "2026-09-01",
    }),
    "55000",
  );
  const broken = `review-incomplete-${tag}`;
  await db.query(
    "insert into audit.checklist_templates(version,name,item_count,active) values ($1,'Incompleto',2,true)",
    [broken],
  );
  await db.query(
    "insert into audit.checklist_sections(template_version,key,position,name) values ($1,'section-01',1,'S')",
    [broken],
  );
  await db.query(
    "insert into audit.checklist_items(template_version,key,section_key,position,number,text) values ($1,'item-001','section-01',1,1,'x')",
    [broken],
  );
  fails(
    await rpc("create_inspection", "unitA", {
      p_unit: A,
      p_applied_on: "2026-09-01",
    }),
    "55000",
  );
  await db.query(
    "update audit.checklist_templates set active=false where version=$1",
    [broken],
  );
  await db.query(
    "update audit.checklist_templates set active=true where version=$1",
    [VERSION],
  );
  assert.equal(await inspectionCount(), before);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from audit.inspections where template_version=$1",
        [broken],
      )
    ).rows[0].n,
    0,
  );
  // A template used by inspections cannot change: no update, delete or new content.
  for (const sql of [
    "update audit.checklist_items set text=text||'.' where template_version=$1 and key='item-001'",
    "delete from audit.checklist_items where template_version=$1 and key='item-161'",
    "update audit.checklist_templates set item_count=159 where version=$1",
    "insert into audit.checklist_sections(template_version,key,position,name) values ($1,'section-10',10,'EXTRA')",
    "insert into audit.checklist_items(template_version,key,section_key,position,number,text) values ($1,'item-162','section-09',159,162,'Extra?')",
  ])
    await assert.rejects(
      db.query(sql, [VERSION]),
      (e) => e.code === "55000",
      sql,
    );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from audit.checklist_items where template_version=$1",
        [VERSION],
      )
    ).rows[0].n,
    158,
  );
  const createLog = (
    await db.query(
      "select * from core.system_audit_log where module='audit' and entity_id=$1",
      [first],
    )
  ).rows;
  assert.equal(createLog.length, 1);
  assert.deepEqual(
    {
      action: createLog[0].action,
      actor: createLog[0].actor_user_id,
      unit: createLog[0].unit_id,
      type: createLog[0].entity_type,
      before: createLog[0].before_data,
      after: createLog[0].after_data.id,
    },
    {
      action: "create",
      actor: users.unitA,
      unit: A,
      type: "inspection",
      before: null,
      after: first,
    },
  );
  console.log(
    "PASS create: atomic 158 answers, actor/responsible, dates, inactive/missing/foreign/sector units, template states, used template immutable",
  );

  // First template use vs catalog INSERT on real sessions. The FK checks only take FOR KEY
  // SHARE, which does not serialize them; the template row is the explicit mutex.
  async function raceTemplate(itemCount, items) {
    const v = `race-${randomUUID().slice(0, 8)}`;
    await db.query(
      "insert into audit.checklist_templates(version,name,item_count) values ($1,'Race',$2)",
      [v, itemCount],
    );
    await db.query(
      "insert into audit.checklist_sections(template_version,key,position,name) values ($1,'section-01',1,'S')",
      [v],
    );
    for (let i = 1; i <= items; i++)
      await db.query(
        "insert into audit.checklist_items(template_version,key,section_key,position,number,text) values ($1,$2,'section-01',$3,$3,'x')",
        [v, `item-${String(i).padStart(3, "0")}`, i],
      );
    await db.query(
      "update audit.checklist_templates set active=false where active",
    );
    await db.query(
      "update audit.checklist_templates set active=true where version=$1",
      [v],
    );
    return v;
  }
  const addItem = (v) => [
    "insert into audit.checklist_items(template_version,key,section_key,position,number,text) values ($1,'item-099','section-01',99,99,'y')",
    [v],
  ];
  const addSection = (v) => [
    "insert into audit.checklist_sections(template_version,key,position,name) values ($1,'section-02',2,'S2')",
    [v],
  ];
  const catalogState = async (v) =>
    (
      await db.query(
        `select t.item_count,(select count(*)::int from audit.checklist_items where template_version=t.version) items,
         (select count(*)::int from audit.checklist_sections where template_version=t.version) sections,
         array(select (select count(*)::int from audit.inspection_answers a where a.inspection_id=i.id)
          from audit.inspections i where i.template_version=t.version) answers
         from audit.checklist_templates t where t.version=$1`,
        [v],
      )
    ).rows[0];
  try {
    // First use wins: the catalog insert waits, then fails because the template is in use.
    for (const [label, add, expected] of [
      ["item", addItem, { items: 1, sections: 1 }],
      ["section", addSection, { items: 1, sections: 1 }],
    ]) {
      const v = await raceTemplate(1, 1);
      const t1 = await session("template-first-use", "global");
      const t2 = new pg.Client({
        connectionString: config.DB_URL,
        application_name: "template-catalog",
      });
      await t2.connect();
      try {
        await t1.query("begin");
        await t1.query("select audit.create_inspection($1,'2026-09-18')", [A]);
        await t2.query("begin");
        const insert = outcome(t2.query(...add(v)));
        await waitForLock("template-catalog");
        await t1.query("commit");
        assert.deepEqual(
          await insert,
          { allowed: false, code: "55000" },
          label,
        );
        await t2.query("rollback");
      } finally {
        await t1.end();
        await t2.end();
      }
      assert.deepEqual(await catalogState(v), {
        item_count: 1,
        ...expected,
        answers: [1],
      });
    }
    // Catalog mutation wins: create waits and then materializes the committed item set;
    // with a mismatching item_count it fails without partial rows.
    for (const [itemCount, expected] of [
      [2, { item_count: 2, items: 2, sections: 1, answers: [2] }],
      [1, { item_count: 1, items: 2, sections: 1, answers: [] }],
    ]) {
      const v = await raceTemplate(itemCount, 1);
      const t1 = await session("template-first-use", "global");
      const t2 = new pg.Client({ connectionString: config.DB_URL });
      await t2.connect();
      try {
        await t2.query("begin");
        await t2.query(...addItem(v));
        const created = outcome(
          t1.query("select audit.create_inspection($1,'2026-09-18')", [A]),
        );
        await waitForLock("template-first-use");
        await t2.query("commit");
        assert.deepEqual(
          await created,
          expected.answers.length
            ? { allowed: true, rows: 1 }
            : { allowed: false, code: "55000" },
        );
      } finally {
        await t1.end();
        await t2.end();
      }
      assert.deepEqual(await catalogState(v), expected);
    }
    // Concurrent first uses do not block each other (FOR SHARE is compatible).
    const v = await raceTemplate(1, 1);
    const [c1, c2] = [
      await session("template-c1", "global"),
      await session("template-c2", "global"),
    ];
    try {
      await c1.query("begin");
      await c2.query("begin");
      await c1.query("select audit.create_inspection($1,'2026-09-18')", [A]);
      await c2.query("select audit.create_inspection($1,'2026-09-18')", [A]);
      await c1.query("commit");
      await c2.query("commit");
    } finally {
      await c1.end();
      await c2.end();
    }
    assert.deepEqual((await catalogState(v)).answers, [1, 1]);
  } finally {
    await db.query(
      "update audit.checklist_templates set active=false where active",
    );
    await db.query(
      "update audit.checklist_templates set active=true where version=$1",
      [VERSION],
    );
  }
  const canonical = await catalogState(VERSION);
  assert.deepEqual(
    [canonical.item_count, canonical.items, canonical.sections],
    [158, 158, 9],
  );
  console.log(
    "PASS template mutex on real sessions: first use makes item/section inserts wait then fail; a pending insert makes create wait and use the committed set; concurrent creates proceed",
  );

  // ---------------------------------------------------------------- RLS / sparse permissions
  const b = await create("unitB", B);
  const visible = async (user, id) =>
    ok(await get(`inspections?id=eq.${id}&select=id`, user)).length === 1;
  assert.equal(await visible("unitA", first), true);
  assert.equal(await visible("global", b), true);
  for (const user of [
    "unitA",
    "sector",
    "empty",
    "inactive",
    "createOnly",
    "editOnly",
    "finalizeOnly",
  ])
    assert.equal(
      (await visible(user, b)) ||
        (user !== "unitA" && (await visible(user, first))),
      false,
      user,
    );
  denied(
    await request(
      `/rest/v1/inspections?id=eq.${first}`,
      null,
      undefined,
      "GET",
    ),
  );
  denied(await request("/rest/v1/rpc/units", null, {}));
  denied(await request("/rest/v1/rpc/inspection_summaries", null, {}));
  for (const user of [
    "sector",
    "empty",
    "inactive",
    "createOnly",
    "editOnly",
    "finalizeOnly",
  ]) {
    assert.deepEqual(
      ok(
        await get(
          "inspection_answers?select=item_key&item_key=eq.item-001",
          user,
        ),
      ),
      [],
      user,
    );
    assert.deepEqual(ok(await rpc("inspection_summaries", user)), [], user);
  }
  for (const user of ["sector", "empty", "inactive"])
    assert.deepEqual(ok(await rpc("units", user)), [], user);
  // Guessed item key only returns rows of inspections in scope.
  const guessed = ok(
    await get(
      "inspection_answers?select=inspection_id&item_key=eq.item-001",
      "unitA",
    ),
  );
  assert.ok(guessed.length >= 2 && guessed.every((r) => r.inspection_id !== b));
  assert.deepEqual(
    ok(await get(`inspection_answers?inspection_id=eq.${b}`, "unitA")),
    [],
  );
  assert.deepEqual(
    ok(await rpc("inspection_summaries", "unitA", { p_inspection: b })),
    [],
  );
  assert.deepEqual(
    ok(await patchAnswer("unitA", b, "item-001", { response: "AT" })),
    [],
  );
  assert.equal((await answerRow(b, "item-001")).response, null);
  for (const fn of ["finalize_inspection", "reopen_inspection"]) {
    fails(await rpc(fn, "unitA", { p_id: b, p_version: 1 }), "42501");
    fails(
      await rpc(fn, "unitA", { p_id: randomUUID(), p_version: 1 }),
      "42501",
    );
  }
  // Sparse combinations: each permission key grants only its own operation.
  const sparseId = await create("createOnly");
  assert.equal(await visible("createOnly", sparseId), false);
  assert.equal(
    (await inspectionRow(sparseId)).responsible_id,
    users.createOnly,
  );
  for (const user of [
    "reader",
    "createOnly",
    "editOnly",
    "readFinalize",
    "readReopen",
    "finalizeOnly",
  ])
    assert.deepEqual(
      ok(await patchAnswer(user, sparseId, "item-001", { response: "AT" })),
      [],
      user,
    );
  assert.equal((await answerRow(sparseId, "item-001")).version, 1);
  assert.equal(
    ok(
      await patchAnswer(
        "readEdit",
        sparseId,
        "item-001",
        { response: "AT" },
        1,
      ),
    )[0].version,
    2,
  );
  await fill(sparseId, [], "AT");
  for (const user of [
    "reader",
    "createOnly",
    "editOnly",
    "readEdit",
    "readReopen",
  ])
    fails(
      await rpc("finalize_inspection", user, { p_id: sparseId, p_version: 1 }),
      "42501",
    );
  ok(
    await rpc("finalize_inspection", "readFinalize", {
      p_id: sparseId,
      p_version: 1,
    }),
  );
  for (const user of ["reader", "readEdit", "readFinalize", "finalizeOnly"])
    fails(
      await rpc("reopen_inspection", user, { p_id: sparseId, p_version: 2 }),
      "42501",
    );
  ok(
    await rpc("reopen_inspection", "readReopen", {
      p_id: sparseId,
      p_version: 2,
    }),
  );
  assert.deepEqual(
    ok(
      await patchAnswer("readReopen", sparseId, "item-002", {
        response: "NAT",
      }),
    ),
    [],
  );
  ok(
    await rpc("finalize_inspection", "finalizeOnly", {
      p_id: sparseId,
      p_version: 3,
    }),
  );
  console.log(
    "PASS RLS/scope: anon, inactive, unassigned, sector-only, unit A/B, guessed UUID/item_key; sparse create/edit/finalize/reopen combinations",
  );

  // ---------------------------------------------------------------- Direct answer update contract
  const answers = ok(
    await get(
      `inspection_answers?inspection_id=eq.${first}&item_key=eq.item-005`,
      "unitA",
    ),
  )[0];
  const saved = ok(
    await patchAnswer(
      "unitA",
      first,
      "item-005",
      { response: "AP", observation: "Pia compartilhada" },
      answers.version,
    ),
  )[0];
  assert.deepEqual(
    {
      r: saved.response,
      o: saved.observation,
      v: saved.version,
      by: saved.updated_by,
    },
    {
      r: "AP",
      o: "Pia compartilhada",
      v: answers.version + 1,
      by: users.unitA,
    },
  );
  assert.deepEqual(
    ok(
      await patchAnswer(
        "global",
        first,
        "item-005",
        { response: "NAT" },
        answers.version,
      ),
    ),
    [],
  );
  for (const values of [
    { version: 99 },
    { updated_by: users.global },
    { item_key: "item-006" },
    { inspection_id: b },
    { template_version: broken },
    { updated_at: "2020-01-01T00:00:00Z" },
  ])
    denied(await patchAnswer("unitA", first, "item-005", values));
  denied(
    await request("/rest/v1/inspection_answers", tokens.unitA, {
      inspection_id: first,
      template_version: VERSION,
      item_key: "item-005",
    }),
  );
  denied(
    await request(
      `/rest/v1/inspection_answers?inspection_id=eq.${first}`,
      tokens.unitA,
      undefined,
      "DELETE",
    ),
  );
  for (const values of [{ status: "finalized" }, { final_score: 100 }])
    denied(
      await request(
        `/rest/v1/inspections?id=eq.${first}`,
        tokens.global,
        values,
        "PATCH",
      ),
    );
  denied(
    await request(
      `/rest/v1/inspections?id=eq.${first}`,
      tokens.global,
      undefined,
      "DELETE",
    ),
  );
  fails(
    await patchAnswer("unitA", first, "item-006", { response: "XX" }),
    "23514",
  );
  fails(
    await patchAnswer("unitA", first, "item-006", {
      observation: "x".repeat(2001),
    }),
    "23514",
  );
  assert.equal((await inspectionRow(first)).version, 1);
  console.log(
    "PASS answer writes: version predicate, updated_by/version server-side, column grants, no insert/delete, lifecycle columns closed",
  );

  // ---------------------------------------------------------------- Scoring through finalize
  const scoreCases = [
    ["158 AT", repeat(["AT", 158]), 100, "adequate"],
    ["79 AT + 79 NAT", repeat(["AT", 79], ["NAT", 79]), 50, "inadequate"],
    ["only NAP", repeat(["NAP", 158]), null, null],
    ["1 AT + NAP", repeat(["AT", 1], ["NAP", 157]), 100, "adequate"],
    ["1 AP + NAP", repeat(["AP", 1], ["NAP", 157]), 50, "inadequate"],
    ["1 NAT + NAP", repeat(["NAT", 1], ["NAP", 157]), 0, "inadequate"],
    ["exactly 51", repeat(["AT", 51], ["NAT", 49], ["NAP", 58]), 51, "partial"],
    ["exactly 75", repeat(["AT", 75], ["NAT", 25], ["NAP", 58]), 75, "partial"],
    [
      "exactly 76",
      repeat(["AT", 76], ["NAT", 24], ["NAP", 58]),
      76,
      "adequate",
    ],
    [
      "76 through AP halves",
      repeat(["AT", 75], ["AP", 2], ["NAT", 23], ["NAP", 58]),
      76,
      "adequate",
    ],
    [
      "51 through AP halves",
      repeat(["AT", 50], ["AP", 2], ["NAT", 48], ["NAP", 58]),
      51,
      "partial",
    ],
    ["just below 76", repeat(["AT", 120], ["NAT", 38]), 12000 / 158, "partial"],
    [
      "just above 76",
      repeat(["AT", 121], ["NAT", 37]),
      12100 / 158,
      "adequate",
    ],
    [
      "just below 51",
      repeat(["AT", 80], ["NAT", 78]),
      8000 / 158,
      "inadequate",
    ],
    ["just above 51", repeat(["AT", 81], ["NAT", 77]), 8100 / 158, "partial"],
    [
      "75.5 with one AP",
      repeat(["AT", 75], ["AP", 1], ["NAT", 24], ["NAP", 58]),
      75.5,
      "partial",
    ],
    [
      "mixed",
      repeat(["AT", 100], ["AP", 30], ["NAT", 20], ["NAP", 8]),
      11500 / 150,
      "adequate",
    ],
  ];
  for (const [label, responses, score, cls] of scoreCases) {
    const id = await create("global");
    await fill(id, responses);
    // Clients cannot pass a score: the RPC signature has no such argument.
    assert.equal(
      (
        await rpc("finalize_inspection", "global", {
          p_id: id,
          p_version: 1,
          p_score: 100,
        })
      ).status,
      404,
    );
    ok(await rpc("finalize_inspection", "global", { p_id: id, p_version: 1 }));
    const r = await inspectionRow(id);
    if (score === null) assert.equal(r.final_score, null, label);
    else
      assert.ok(
        Math.abs(Number(r.final_score) - score) < 1e-12,
        `${label}: ${r.final_score}`,
      );
    assert.equal(r.final_classification, cls, label);
  }
  // Partial (draft) counts come from the server; progress is separate from conformity.
  const partial = await create("global");
  let [summary] = ok(
    await rpc("inspection_summaries", "global", { p_inspection: partial }),
  );
  assert.deepEqual(
    [
      summary.total_items,
      summary.answered,
      summary.at_count,
      summary.final_score,
    ],
    [158, 0, 0, null],
  );
  await fill(partial, repeat(["AT", 1], ["AP", 1], ["NAT", 1], ["NAP", 1]));
  [summary] = ok(
    await rpc("inspection_summaries", "global", { p_inspection: partial }),
  );
  assert.deepEqual(
    [
      summary.answered,
      summary.at_count,
      summary.ap_count,
      summary.nat_count,
      summary.nap_count,
      summary.status,
      summary.final_classification,
    ],
    [4, 1, 1, 1, 1, "draft", null],
  );
  console.log(
    `PASS scoring through finalize on PostgreSQL: ${scoreCases.length} cases incl. 50/51/75/76 boundaries, AP halves, all-NAP`,
  );

  // ---------------------------------------------------------------- Finalize / reopen lifecycle
  const life = await create("unitA");
  await fill(life, repeat(["AT", 157]));
  fails(
    await rpc("finalize_inspection", "unitA", { p_id: life, p_version: 1 }),
    "23514",
  );
  const current = async (id, item) => (await answerRow(id, item)).version;
  assert.equal(
    ok(
      await patchAnswer(
        "unitA",
        life,
        "item-161",
        { response: "NAT", observation: "Sem acesso" },
        await current(life, "item-161"),
      ),
    ).length,
    1,
  );
  // Answer writes do not change the inspection version.
  assert.equal((await inspectionRow(life)).version, 1);
  fails(
    await rpc("finalize_inspection", "unitA", { p_id: life, p_version: 2 }),
    "40001",
  );
  fails(
    await rpc("finalize_inspection", "unitA", { p_id: life, p_version: 0 }),
    "40001",
  );
  ok(await rpc("finalize_inspection", "unitA", { p_id: life, p_version: 1 }));
  row = await inspectionRow(life);
  assert.deepEqual(
    [
      row.status,
      row.version,
      row.finalized_by,
      !!row.finalized_at,
      row.final_classification,
    ],
    ["finalized", 2, users.unitA, true, "adequate"],
  );
  assert.ok(Math.abs(Number(row.final_score) - 15700 / 158) < 1e-12);
  const firstScore = row.final_score;
  assert.deepEqual(
    ok(await patchAnswer("unitA", life, "item-001", { response: "NAT" })),
    [],
  );
  assert.equal((await answerRow(life, "item-001")).response, "AT");
  fails(
    await rpc("finalize_inspection", "unitA", { p_id: life, p_version: 2 }),
    "40001",
  );
  fails(
    await rpc("reopen_inspection", "unitA", { p_id: life, p_version: 1 }),
    "40001",
  );
  const snapshot = async (id) =>
    (
      await db.query(
        "select item_key,response,observation,version from audit.inspection_answers where inspection_id=$1 order by item_key",
        [id],
      )
    ).rows;
  const beforeReopen = await snapshot(life);
  ok(await rpc("reopen_inspection", "unitA", { p_id: life, p_version: 2 }));
  row = await inspectionRow(life);
  assert.deepEqual(
    [
      row.status,
      row.version,
      row.final_score,
      row.final_classification,
      row.finalized_by,
      row.finalized_at,
    ],
    ["draft", 3, null, null, null, null],
  );
  assert.deepEqual(await snapshot(life), beforeReopen);
  fails(
    await rpc("reopen_inspection", "unitA", { p_id: life, p_version: 3 }),
    "40001",
  );
  // finalize -> reopen -> finalize without changes recomputes the same result.
  ok(await rpc("finalize_inspection", "unitA", { p_id: life, p_version: 3 }));
  assert.equal((await inspectionRow(life)).final_score, firstScore);
  // finalize -> reopen -> edit -> finalize recomputes from the current answers.
  ok(await rpc("reopen_inspection", "unitA", { p_id: life, p_version: 4 }));
  assert.equal(
    ok(
      await patchAnswer(
        "unitA",
        life,
        "item-001",
        { response: "AP" },
        await current(life, "item-001"),
      ),
    ).length,
    1,
  );
  ok(await rpc("finalize_inspection", "unitA", { p_id: life, p_version: 5 }));
  assert.ok(
    Math.abs(Number((await inspectionRow(life)).final_score) - 15650 / 158) <
      1e-12,
  );
  const history = (
    await db.query(
      "select * from core.system_audit_log where module='audit' and entity_id=$1 order by occurred_at,id",
      [life],
    )
  ).rows;
  assert.deepEqual(
    history.map((h) => h.action),
    ["create", "finalize", "reopen", "finalize", "reopen", "finalize"],
  );
  let previous = null;
  for (const h of history) {
    assert.equal(h.actor_user_id, users.unitA);
    assert.equal(h.unit_id, A);
    assert.equal(h.entity_type, "inspection");
    assert.equal(h.after_data.id, life);
    // Each event starts from the state the previous one produced: history is reconstructible.
    if (previous) assert.deepEqual(h.before_data, previous.after_data);
    else assert.equal(h.before_data, null);
    assert.equal(
      h.after_data.status,
      { create: "draft", reopen: "draft", finalize: "finalized" }[h.action],
    );
    assert.equal(h.after_data.version, (previous?.after_data.version ?? 0) + 1);
    if (h.action === "finalize") {
      assert.ok(
        h.after_data.final_classification &&
          h.after_data.finalized_by === users.unitA,
      );
    } else assert.equal(h.after_data.final_score, null);
    assert.deepEqual(Object.keys(h.metadata), []);
    previous = h;
  }
  const logKeys = new Set(history.flatMap((h) => Object.keys(h.after_data)));
  for (const k of logKeys)
    assert.ok(
      [
        "id",
        "unit_id",
        "template_version",
        "applied_on",
        "previous_visit_on",
        "responsible_id",
        "status",
        "final_score",
        "final_classification",
        "finalized_at",
        "finalized_by",
        "version",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
      ].includes(k),
      `Unexpected audit log field ${k}`,
    );
  console.log(
    "PASS finalize/reopen: completeness, versions, server score, read-only, answers preserved, recompute, reconstructible system audit log",
  );

  // ---------------------------------------------------------------- Authorization races (real sessions)
  // A caller waits on a row lock while its access is revoked (0004 checked before the wait or
  // relied on the statement snapshot), and a revocation must wait for an authorized write.
  async function raceUser(name) {
    await authUser(name, false);
    const key = `aud-${tag}-${name}`.toLowerCase();
    const id = await role(key, AUDIT);
    await assign(name, key);
    return {
      profile: [
        "update core.profiles set active=false where id=$1",
        [users[name]],
      ],
      assignment: [
        "update core.user_role_assignments set active=false where user_id=$1",
        [users[name]],
      ],
      role: ["update core.roles set active=false where id=$1", [id]],
      permission: ["delete from core.role_permissions where role_id=$1", [id]],
      roleId: id,
      key,
    };
  }
  async function whileWaiting(user, hold, call, revoke) {
    const locker = new pg.Client({ connectionString: config.DB_URL });
    await locker.connect();
    const caller = await session("audit-caller", user);
    try {
      await locker.query("begin");
      await locker.query(...hold);
      const result = outcome(caller.query(...call));
      await waitForLock("audit-caller");
      if (revoke) await locker.query(...revoke);
      await locker.query("commit");
      return await result;
    } finally {
      await locker.end();
      await caller.end();
    }
  }
  async function revocationWaits(user, call, revoke, revokeAs) {
    const caller = await session("audit-holder", user);
    const revoker = revokeAs
      ? await session("audit-revoker", revokeAs)
      : new pg.Client({
          connectionString: config.DB_URL,
          application_name: "audit-revoker",
        });
    if (!revokeAs) await revoker.connect();
    try {
      await caller.query("begin");
      assert.deepEqual(await outcome(caller.query(...call)), {
        allowed: true,
        rows: 1,
      });
      const revoking = revoker.query(...revoke);
      await waitForLock("audit-revoker");
      await caller.query("commit");
      await revoking;
    } finally {
      await caller.end();
      await revoker.end();
    }
  }
  const denial = { allowed: false, code: "42501" };
  const draft = async () => create("global");
  const complete = async () => {
    const id = await create("global");
    await fill(id, [], "AT");
    return id;
  };
  const finalized = async () => {
    const id = await complete();
    ok(await rpc("finalize_inspection", "global", { p_id: id, p_version: 1 }));
    return id;
  };
  const holdUnit = ["update core.units set name=name where id=$1", [A]];
  const holdInspection = (id) => [
    "select 1 from audit.inspections where id=$1 for update",
    [id],
  ];
  const holdAnswer = (id, item) => [
    "select 1 from audit.inspection_answers where inspection_id=$1 and item_key=$2 for update",
    [id, item],
  ];
  const createCall = ["select audit.create_inspection($1,'2026-09-19')", [A]];
  const responseCall = (id, item = "item-001", version = 1) => [
    "update audit.inspection_answers set response='NAT' where inspection_id=$1 and item_key=$2 and version=$3",
    [id, item, version],
  ];
  const observationCall = (id, item = "item-002") => [
    "update audit.inspection_answers set observation='Após revogação' where inspection_id=$1 and item_key=$2 and version=1",
    [id, item],
  ];
  const finalizeCall = (id) => ["select audit.finalize_inspection($1,1)", [id]];
  const reopenCall = (id) => ["select audit.reopen_inspection($1,2)", [id]];
  const createdBy = async (user) =>
    (
      await db.query(
        "select count(*)::int n from audit.inspections where created_by=$1",
        [users[user]],
      )
    ).rows[0].n;
  let n = 0;
  // The control user is never revoked: the same waits succeed without a revocation.
  await raceUser("control");
  for (const kind of ["profile", "assignment", "role", "permission"]) {
    assert.deepEqual(await whileWaiting("control", holdUnit, createCall), {
      allowed: true,
      rows: 1,
    });
    let name = `race${n++}`;
    let revoke = await raceUser(name);
    assert.deepEqual(
      await whileWaiting(name, holdUnit, createCall, revoke[kind]),
      denial,
      `create/${kind}`,
    );
    assert.equal(await createdBy(name), 0);

    let id = await draft();
    name = `race${n++}`;
    revoke = await raceUser(name);
    assert.deepEqual(
      await whileWaiting(
        "control",
        holdInspection(id),
        responseCall(id, "item-010"),
      ),
      { allowed: true, rows: 1 },
    );
    assert.deepEqual(
      await whileWaiting(
        name,
        holdInspection(id),
        responseCall(id),
        revoke[kind],
      ),
      denial,
      `response/${kind}`,
    );
    assert.equal((await answerRow(id, "item-001")).response, null);

    name = `race${n++}`;
    revoke = await raceUser(name);
    assert.deepEqual(
      await whileWaiting(
        "control",
        holdInspection(id),
        observationCall(id, "item-011"),
      ),
      { allowed: true, rows: 1 },
    );
    assert.deepEqual(
      await whileWaiting(
        name,
        holdInspection(id),
        observationCall(id),
        revoke[kind],
      ),
      denial,
      `observation/${kind}`,
    );
    assert.equal((await answerRow(id, "item-002")).observation, "");

    // Waiting on the answer row itself (another writer), without a version predicate.
    name = `race${n++}`;
    revoke = await raceUser(name);
    assert.deepEqual(
      await whileWaiting(
        name,
        holdAnswer(id, "item-003"),
        [
          "update audit.inspection_answers set response='AP' where inspection_id=$1 and item_key='item-003'",
          [id],
        ],
        revoke[kind],
      ),
      denial,
      `answer-row/${kind}`,
    );
    assert.equal((await answerRow(id, "item-003")).response, null);

    id = await complete();
    name = `race${n++}`;
    revoke = await raceUser(name);
    assert.deepEqual(
      await whileWaiting(
        name,
        holdInspection(id),
        finalizeCall(id),
        revoke[kind],
      ),
      denial,
      `finalize/${kind}`,
    );
    assert.equal((await inspectionRow(id)).status, "draft");
    assert.deepEqual(
      await whileWaiting("control", holdInspection(id), finalizeCall(id)),
      { allowed: true, rows: 1 },
    );

    name = `race${n++}`;
    revoke = await raceUser(name);
    assert.deepEqual(
      await whileWaiting(
        name,
        holdInspection(id),
        reopenCall(id),
        revoke[kind],
      ),
      denial,
      `reopen/${kind}`,
    );
    assert.equal((await inspectionRow(id)).status, "finalized");
    assert.deepEqual(
      await whileWaiting("control", holdInspection(id), reopenCall(id)),
      { allowed: true, rows: 1 },
    );
  }
  console.log(
    "PASS revocation (profile/assignment/role/permission) during a lock wait denies create, response, observation, finalize and reopen",
  );
  // An authorized in-flight Audit write holds the caller's authorization rows until commit.
  await authUser("roleAdmin", false);
  await assign("roleAdmin", "platform_administrator", "global");
  const inFlight = [
    ["create", async () => createCall],
    ["response", async () => responseCall(await draft())],
    ["observation", async () => observationCall(await draft())],
    ["finalize", async () => finalizeCall(await complete())],
    ["reopen", async () => reopenCall(await finalized())],
  ];
  for (const [label, call] of inFlight)
    for (const kind of ["profile", "assignment", "role", "save_role"]) {
      const name = `hold${n++}`;
      const revoke = await raceUser(name);
      const statement =
        kind === "save_role"
          ? [
              "select core.save_role($1,1,$2,$2,'',$3)",
              [
                revoke.roleId,
                revoke.key,
                AUDIT.filter(
                  (p) =>
                    !p.endsWith(
                      label === "create"
                        ? "create"
                        : label === "response" || label === "observation"
                          ? "edit"
                          : label,
                    ),
                ),
              ],
            ]
          : revoke[kind];
      await revocationWaits(
        name,
        await call(),
        statement,
        kind === "save_role" ? "roleAdmin" : undefined,
      );
      const again = await session("audit-after", name);
      try {
        const after = await outcome(again.query(...(await call())));
        assert.ok(
          !after.allowed || after.rows === 0,
          `${label}/${kind} after revocation: ${JSON.stringify(after)}`,
        );
      } finally {
        await again.end();
      }
    }
  console.log(
    "PASS revocation (profile/assignment/role/save_role) waits for authorized in-flight create/response/observation/finalize/reopen",
  );

  // ---------------------------------------------------------------- Lifecycle vs answer writes
  await authUser("writer1", false);
  await authUser("writer2", false);
  await assign("writer1", "quality");
  await assign("writer2", "quality");
  async function pair(fn) {
    const s1 = await session("audit-s1", "writer1");
    const s2 = await session("audit-s2", "writer2");
    try {
      return await fn(s1, s2);
    } finally {
      await s1.end();
      await s2.end();
    }
  }
  // Answer in flight vs finalize: finalize waits and scores the committed answer.
  let id = await create("global");
  await fill(id, repeat(["AT", 157]));
  await pair(async (s1, s2) => {
    await s1.query("begin");
    await s1.query(
      "update audit.inspection_answers set response='NAT',observation='Última' where inspection_id=$1 and item_key='item-161'",
      [id],
    );
    const fin = outcome(s2.query(...finalizeCall(id)));
    await waitForLock("audit-s2");
    await s1.query("commit");
    assert.deepEqual(await fin, { allowed: true, rows: 1 });
  });
  assert.ok(
    Math.abs(Number((await inspectionRow(id)).final_score) - 15700 / 158) <
      1e-12,
  );
  // Answer clearing in flight vs finalize: finalize sees the cleared answer and rejects.
  id = await complete();
  await pair(async (s1, s2) => {
    await s1.query("begin");
    await s1.query(
      "update audit.inspection_answers set response=null where inspection_id=$1 and item_key='item-050'",
      [id],
    );
    const fin = outcome(s2.query(...finalizeCall(id)));
    await waitForLock("audit-s2");
    await s1.query("commit");
    assert.deepEqual(await fin, { allowed: false, code: "23514" });
  });
  assert.equal((await inspectionRow(id)).status, "draft");
  // Finalize in flight vs response and observation writes: both wait, then fail as not editable.
  for (const values of ["response='NAT'", "observation='Tarde demais'"]) {
    id = await complete();
    const answerBefore = await answerRow(id, "item-020");
    await pair(async (s1, s2) => {
      await s1.query("begin");
      await s1.query(...finalizeCall(id));
      const write = outcome(
        s2.query(
          `update audit.inspection_answers set ${values} where inspection_id=$1 and item_key='item-020'`,
          [id],
        ),
      );
      await waitForLock("audit-s2");
      await s1.query("commit");
      assert.deepEqual(await write, { allowed: false, code: "40001" });
    });
    assert.deepEqual(await answerRow(id, "item-020"), answerBefore);
    assert.equal(Number((await inspectionRow(id)).final_score), 100);
  }
  // Reopen in flight vs answer write: the write sees the finalized state (0 rows), nothing lost.
  id = await finalized();
  await pair(async (s1, s2) => {
    await s1.query("begin");
    await s1.query(...reopenCall(id));
    const write = await outcome(
      s2.query(
        "update audit.inspection_answers set response='NAT' where inspection_id=$1 and item_key='item-030'",
        [id],
      ),
    );
    assert.deepEqual(write, { allowed: true, rows: 0 });
    await s1.query("commit");
  });
  assert.equal((await answerRow(id, "item-030")).response, "AT");
  await pair(async (s1) => {
    const write = await outcome(
      s1.query(
        "update audit.inspection_answers set response='NAT' where inspection_id=$1 and item_key='item-030'",
        [id],
      ),
    );
    assert.deepEqual(write, { allowed: true, rows: 1 });
  });
  // Same answer, same version: the second writer waits, then its stale predicate matches nothing.
  id = await draft();
  await pair(async (s1, s2) => {
    await s1.query("begin");
    await s1.query(
      "update audit.inspection_answers set response='AP',observation='Primeiro' where inspection_id=$1 and item_key='item-040' and version=1",
      [id],
    );
    const second = outcome(
      s2.query(
        "update audit.inspection_answers set response='NAT',observation='Segundo' where inspection_id=$1 and item_key='item-040' and version=1",
        [id],
      ),
    );
    await waitForLock("audit-s2");
    await s1.query("commit");
    assert.deepEqual(await second, { allowed: true, rows: 0 });
  });
  assert.deepEqual(
    (({ response, observation, version, updated_by }) => ({
      response,
      observation,
      version,
      updated_by,
    }))(await answerRow(id, "item-040")),
    {
      response: "AP",
      observation: "Primeiro",
      version: 2,
      updated_by: users.writer1,
    },
  );
  // Different answers concurrently: both succeed.
  await pair(async (s1, s2) => {
    await s1.query("begin");
    await s2.query("begin");
    await s1.query(...responseCall(id, "item-041"));
    await s2.query(...responseCall(id, "item-042"));
    await s1.query("commit");
    await s2.query("commit");
  });
  assert.deepEqual(
    [
      (await answerRow(id, "item-041")).response,
      (await answerRow(id, "item-042")).response,
    ],
    ["NAT", "NAT"],
  );
  // Two finalizations, two reopenings, finalize vs reopen: exactly one wins, the other is stale.
  const lifecycleRace = async (id, first, second, expected) =>
    pair(async (s1, s2) => {
      await s1.query("begin");
      await s1.query(...first);
      const other = outcome(s2.query(...second));
      await waitForLock("audit-s2");
      await s1.query("commit");
      assert.deepEqual(await other, expected);
    });
  id = await complete();
  await lifecycleRace(id, finalizeCall(id), finalizeCall(id), {
    allowed: false,
    code: "40001",
  });
  await lifecycleRace(id, reopenCall(id), reopenCall(id), {
    allowed: false,
    code: "40001",
  });
  await lifecycleRace(
    id,
    ["select audit.finalize_inspection($1,3)", [id]],
    ["select audit.reopen_inspection($1,3)", [id]],
    { allowed: false, code: "40001" },
  );
  row = await inspectionRow(id);
  assert.deepEqual([row.status, row.version], ["finalized", 4]);
  assert.deepEqual(
    (
      await db.query(
        "select action from core.system_audit_log where module='audit' and entity_id=$1 order by occurred_at,id",
        [id],
      )
    ).rows.map((r) => r.action),
    ["create", "finalize", "reopen", "finalize"],
  );
  console.log(
    "PASS lifecycle vs answers on real sessions: in-flight answer/observation vs finalize both orders, reopen, stale versions, double finalize/reopen, finalize vs reopen",
  );

  // ---------------------------------------------------------------- Audit -> Action Plans contract
  const plans = async (id, item) =>
    (
      await db.query(
        "select * from action_plans.plans where source_inspection_id=$1 and source_item_key=$2",
        [id, item],
      )
    ).rows;
  id = await create("unitA");
  const item = "item-007";
  let version = 1;
  async function setAnswer(values) {
    const r = ok(await patchAnswer("unitA", id, item, values, version));
    assert.equal(r.length, 1);
    version = r[0].version;
  }
  const expectPlan = async (expected) => {
    const found = await plans(id, item);
    if (expected === null) return assert.equal(found.length, 0);
    assert.equal(found.length, 1);
    const [p] = found;
    assert.deepEqual(
      {
        active: p.source_active,
        response: p.source_response,
        observation: p.source_observation,
        reactivated: p.source_reactivated_after_verification,
      },
      expected,
    );
    return p;
  };
  await setAnswer({ response: "AT" });
  await expectPlan(null);
  await setAnswer({ response: "AP", observation: "Ralo aberto" });
  const planId = (
    await expectPlan({
      active: true,
      response: "AP",
      observation: "Ralo aberto",
      reactivated: false,
    })
  ).id;
  await setAnswer({ response: "NAT" });
  await expectPlan({
    active: true,
    response: "NAT",
    observation: "Ralo aberto",
    reactivated: false,
  });
  // User planning survives source changes.
  const planVersion = async () =>
    (
      await db.query("select version from action_plans.plans where id=$1", [
        planId,
      ])
    ).rows[0].version;
  ok(
    await rpc(
      "update_plan",
      "unitA",
      {
        p_id: planId,
        p_version: await planVersion(),
        p_improvement_point: "ignored",
        p_action: "Sifonar ralos",
        p_how_to: "Manutenção",
        p_responsible: "Equipe",
        p_due_date: "2026-10-30",
        p_effectiveness_criterion: "Ralos fechados",
        p_monitoring_start: null,
        p_monitoring_end: null,
        p_expected_evidence: "Foto",
      },
      "action_plans",
    ),
  );
  await setAnswer({ response: "AP" });
  await setAnswer({ observation: "Ralo parcialmente aberto" });
  let p = await expectPlan({
    active: true,
    response: "AP",
    observation: "Ralo parcialmente aberto",
    reactivated: false,
  });
  assert.equal(p.action, "Sifonar ralos");
  for (const response of ["AT", "NAP", null]) {
    await setAnswer({ response });
    p = await expectPlan({
      active: false,
      response: "AP",
      observation: "Ralo parcialmente aberto",
      reactivated: false,
    });
    assert.equal(p.action, "Sifonar ralos");
  }
  await setAnswer({ response: "NAT" });
  await expectPlan({
    active: true,
    response: "NAT",
    observation: "Ralo parcialmente aberto",
    reactivated: false,
  });
  // Verified plan: preserved when the source changes; reactivation after verification is flagged.
  for (const s of ["in_progress", "completed"])
    ok(
      await rpc(
        "set_plan_status",
        "unitA",
        { p_id: planId, p_version: await planVersion(), p_status: s },
        "action_plans",
      ),
    );
  ok(
    await rpc(
      "verify_plan",
      "unitA",
      {
        p_id: planId,
        p_version: await planVersion(),
        p_effectiveness: "effective",
        p_verified_on: "2026-09-24",
        p_notes: "Verificado",
        p_expected_evidence_ids: [],
      },
      "action_plans",
    ),
  );
  await setAnswer({ response: "AT" });
  p = await expectPlan({
    active: false,
    response: "NAT",
    observation: "Ralo parcialmente aberto",
    reactivated: false,
  });
  assert.deepEqual([p.effectiveness, p.verification_round], ["effective", 1]);
  await setAnswer({ response: "AP" });
  p = await expectPlan({
    active: true,
    response: "AP",
    observation: "Ralo parcialmente aberto",
    reactivated: true,
  });
  assert.deepEqual(
    [p.id, p.effectiveness, p.status, p.action],
    [planId, "effective", "completed", "Sifonar ralos"],
  );
  // Concurrent writers on the same criterion never duplicate the plan.
  const concurrentItem = "item-008";
  await pair(async (s1, s2) => {
    await s1.query("begin");
    await s1.query(
      "update audit.inspection_answers set response='AP' where inspection_id=$1 and item_key=$2",
      [id, concurrentItem],
    );
    const second = outcome(
      s2.query(
        "update audit.inspection_answers set response='NAT' where inspection_id=$1 and item_key=$2",
        [id, concurrentItem],
      ),
    );
    await waitForLock("audit-s2");
    await s1.query("commit");
    assert.deepEqual(await second, { allowed: true, rows: 1 });
  });
  const concurrentPlans = await plans(id, concurrentItem);
  assert.equal(concurrentPlans.length, 1);
  assert.deepEqual(
    [concurrentPlans[0].source_active, concurrentPlans[0].source_response],
    [true, "NAT"],
  );
  // Different criteria at the same time: one plan each.
  await pair(async (s1, s2) => {
    await s1.query("begin");
    await s2.query("begin");
    await s1.query(
      "update audit.inspection_answers set response='AP' where inspection_id=$1 and item_key='item-009'",
      [id],
    );
    await s2.query(
      "update audit.inspection_answers set response='NAT' where inspection_id=$1 and item_key='item-010'",
      [id],
    );
    await s1.query("commit");
    await s2.query("commit");
  });
  assert.deepEqual(
    [
      (await plans(id, "item-009")).length,
      (await plans(id, "item-010")).length,
    ],
    [1, 1],
  );
  // Audit does not depend on Action Plans.
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('audit','audit_private') and p.prosrc ilike '%action_plan%'",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace join pg_class r on r.oid=c.confrelid join pg_namespace rn on rn.oid=r.relnamespace where n.nspname='audit' and rn.nspname='action_plans'",
      )
    ).rows[0].n,
    0,
  );
  console.log(
    "PASS Audit -> Action Plans: AT/AP/NAT/NAP/null transitions, one plan per criterion, planning and verification preserved, reactivation flag, concurrent writers",
  );

  // ---------------------------------------------------------------- Browser (real bundle, 375px)
  const port = await new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  const outDir = mkdtempSync(join(tmpdir(), "audit-e2e-"));
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
  assert.equal(
    await new Promise((r) => build.on("exit", r)),
    0,
    "vite build failed",
  );
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
    async function open(user) {
      const context = await browser.newContext({
        viewport: { width: 375, height: 812 },
        hasTouch: true,
      });
      const page = await context.newPage();
      page.on("dialog", () => assert.fail("Native dialog opened"));
      await page.goto(origin);
      await page.getByLabel(/E-mail/i).fill(users[`${user}Email`]);
      await page.getByLabel(/Senha/i).fill(password);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await page.getByLabel(/Senha/i).waitFor({ state: "detached" });
      return page;
    }
    const noOverflow = async (page, label) =>
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `Mobile overflow: ${label}`,
      );
    const settle = (page) =>
      page
        .getByText("Carregando", { exact: false })
        .waitFor({ state: "hidden" });
    const page = await open("ui");
    const uiInspection = await create("ui");
    for (const route of [
      "/audit",
      `/audit/units/${A}`,
      `/audit/inspections/${uiInspection}`,
    ]) {
      await page.goto(`${origin}${route}`);
      await page.locator("h1").waitFor();
      await settle(page);
      await noOverflow(page, route);
    }
    const itemByNumber = (p, number) =>
      p
        .locator("li.audit-item")
        .filter({ hasText: new RegExp(`^\\s*${number}\\.`) });
    // Response buttons: accessible names, aria-pressed, touch-sized, toggle back to unanswered.
    const first1 = itemByNumber(page, 1);
    const at = first1.getByRole("button", { name: "Atende (AT)" });
    for (const name of [
      "Atende (AT)",
      "Atende parcialmente (AP)",
      "Não atende (NAT)",
      "Não se aplica (NAP)",
    ]) {
      const box = await first1.getByRole("button", { name }).boundingBox();
      assert.ok(
        box.height >= 44 && box.width >= 44,
        `${name} touch target ${JSON.stringify(box)}`,
      );
    }
    assert.equal(await at.getAttribute("aria-pressed"), "false");
    await at.tap();
    await first1.getByText("Salvo").waitFor();
    assert.equal(await at.getAttribute("aria-pressed"), "true");
    assert.equal((await answerRow(uiInspection, "item-001")).response, "AT");
    await page.getByText("1/158 respondidos").first().waitFor();
    await page.getByText("100,0%").first().waitFor();
    await page.getByText("Parcial · em andamento").first().waitFor();
    // Keyboard: Space on the focused button saves and keeps focus on the control.
    const nat2 = itemByNumber(page, 2).getByRole("button", {
      name: "Não atende (NAT)",
    });
    await nat2.focus();
    await page.keyboard.press("Space");
    await itemByNumber(page, 2).getByText("Salvo").waitFor();
    assert.equal(await nat2.getAttribute("aria-pressed"), "true");
    assert.equal(
      await page.evaluate(() =>
        document.activeElement?.getAttribute("aria-label"),
      ),
      "Não atende (NAT)",
    );
    await page.keyboard.press("Space");
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-pressed") === "false",
    );
    assert.equal((await answerRow(uiInspection, "item-002")).response, null);
    // Observation saves on blur.
    const obs = itemByNumber(page, 3).getByLabel("Observação");
    await obs.tap();
    await obs.fill("Lâmpada queimada no estoque");
    await page.keyboard.press("Tab");
    await itemByNumber(page, 3).getByText("Salvo").waitFor();
    assert.equal(
      (await answerRow(uiInspection, "item-003")).observation,
      "Lâmpada queimada no estoque",
    );
    // Section selector (mobile) and long criterion wrapping.
    const select = page.getByRole("combobox", { name: /^Seção/ });
    assert.ok(await select.isVisible());
    await select.selectOption("section-08");
    await page
      .getByRole("heading", { name: "8. PREPARO DO ALIMENTO" })
      .waitFor();
    const long = itemByNumber(page, 128).locator(".audit-item-text");
    assert.ok(
      await long.evaluate(
        (e) =>
          e.scrollWidth <= e.clientWidth &&
          e.getBoundingClientRect().height > 60,
      ),
    );
    await noOverflow(page, "section 8");
    // Another user changes the same criterion: conflict, server value loaded, no overwrite.
    await select.selectOption("section-01");
    const four = itemByNumber(page, 4);
    ok(
      await patchAnswer(
        "uiOther",
        uiInspection,
        "item-004",
        { response: "NAP" },
        1,
      ),
    );
    await four.getByRole("button", { name: "Atende (AT)" }).tap();
    await four
      .getByText("alterado em outra sessão", { exact: false })
      .waitFor();
    assert.equal(
      await four
        .getByRole("button", { name: "Não se aplica (NAP)" })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal((await answerRow(uiInspection, "item-004")).response, "NAP");
    // Lifecycle changes while a save is waiting on the parent lock: conflict, then stale page.
    const locker = new pg.Client({ connectionString: config.DB_URL });
    await locker.connect();
    try {
      await locker.query("begin");
      await locker.query(...holdInspection(uiInspection));
      const five = itemByNumber(page, 5);
      await five.getByRole("button", { name: "Atende (AT)" }).tap();
      await waitForLock("inspection_answers");
      await locker.query(
        "update audit.inspections set status='finalized',finalized_at=now() where id=$1",
        [uiInspection],
      );
      await locker.query("commit");
      await five
        .getByText("alterado em outra sessão", { exact: false })
        .waitFor();
      await page
        .getByText("Esta auditoria foi alterada em outra sessão")
        .first()
        .waitFor();
    } finally {
      await locker.end();
    }
    assert.equal((await answerRow(uiInspection, "item-005")).response, null);
    await page.getByRole("button", { name: "Atualizar" }).tap();
    await page.getByText("Somente leitura", { exact: false }).first().waitFor();
    assert.equal(
      await itemByNumber(page, 1)
        .getByRole("button", { name: "Atende (AT)" })
        .isDisabled(),
      true,
    );
    await noOverflow(page, "finalized inspection");
    // Finalize / reopen confirmations fit the viewport and use the server result.
    const flow = await create("ui");
    await fill(flow, repeat(["AT", 120], ["NAT", 38]));
    await page.goto(`${origin}/audit/inspections/${flow}`);
    await settle(page);
    await page.getByRole("button", { name: "Finalizar" }).tap();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const fits = async () => {
      const box = await dialog.boundingBox();
      assert.ok(
        box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= 375 &&
          box.y + box.height <= 812,
        JSON.stringify(box),
      );
    };
    await fits();
    await dialog.getByRole("button", { name: "Confirmar" }).tap();
    await page
      .getByText("Adequada parcialmente e requer análise de mudanças")
      .first()
      .waitFor();
    await page.getByText("75,9%").first().waitFor();
    assert.equal((await inspectionRow(flow)).final_classification, "partial");
    await page.getByRole("button", { name: "Reabrir" }).tap();
    await dialog.waitFor();
    await fits();
    // Another user reopens first: the confirmation reports the stale state.
    ok(await rpc("reopen_inspection", "uiOther", { p_id: flow, p_version: 2 }));
    await dialog.getByRole("button", { name: "Confirmar" }).tap();
    await dialog
      .getByText("alterado ou não está mais disponível", { exact: false })
      .waitFor();
    await dialog.getByRole("button", { name: "Cancelar" }).tap();
    await page.reload();
    await settle(page);
    await page.getByText("Parcial · em andamento").first().waitFor();
    // Another user finalizes while the page is open: the next save reports the change.
    ok(
      await rpc("finalize_inspection", "uiOther", { p_id: flow, p_version: 3 }),
    );
    await itemByNumber(page, 1)
      .getByRole("button", { name: "Não atende (NAT)" })
      .tap();
    await page
      .getByText("Esta auditoria foi alterada em outra sessão")
      .first()
      .waitFor();
    assert.equal((await answerRow(flow, "item-001")).response, "AT");
    // Losing access while the page is open: the save fails and the inspection becomes unavailable.
    const revoked = await open("uiRevoked");
    const gone = await create("uiRevoked");
    await revoked.goto(`${origin}/audit/inspections/${gone}`);
    await settle(revoked);
    await db.query(
      "update core.user_role_assignments set active=false where user_id=$1",
      [users.uiRevoked],
    );
    await itemByNumber(revoked, 1)
      .getByRole("button", { name: "Atende (AT)" })
      .tap();
    await revoked
      .getByText("Esta auditoria foi alterada em outra sessão")
      .first()
      .waitFor();
    await revoked.getByRole("button", { name: "Atualizar" }).tap();
    await revoked
      .getByRole("heading", { name: "Auditoria indisponível" })
      .waitFor();
    assert.equal((await answerRow(gone, "item-001")).response, null);
    // Direct route to an inspection outside the caller's scope.
    await page.goto(`${origin}/audit/inspections/${b}`);
    await page
      .getByRole("heading", { name: "Auditoria indisponível" })
      .waitFor();
    await noOverflow(page, "unavailable inspection");
    console.log(
      "PASS browser 375px: routes without overflow, 44px response targets, aria-pressed, keyboard, observation, section selector, long text, conflicts, lifecycle change during save, finalize/reopen dialogs, stale/revoked/unavailable states",
    );
  } finally {
    await browser?.close();
    server.kill();
    rmSync(outDir, { recursive: true, force: true });
  }

  // ---------------------------------------------------------------- SQL suite on PostgreSQL
  await db.query("drop database if exists audit_sql_review");
  await db.query("create database audit_sql_review");
  const sqlUrl = new URL(config.DB_URL);
  sqlUrl.pathname = "/audit_sql_review";
  execFileSync(
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", "tests/audit-database.test.ts"],
    {
      env: { ...process.env, AUDIT_TEST_DATABASE_URL: sqlUrl.href },
      stdio: "inherit",
    },
  );
  await db.query("drop database if exists audit_sql_review");
  console.log("PASS Audit SQL suite on PostgreSQL with migrations from zero");
} finally {
  await db.end();
}
