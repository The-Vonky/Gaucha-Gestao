import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { STORAGE_STUB } from "./storage-stub";
let db: PGlite;
const COVER_MIGRATION = "20261007120000_core_unit_cover_v1.sql";
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const users = {
  admin: uid(1),
  managerA: uid(2),
  managerB: uid(3),
  quality: uid(4),
  viewerA: uid(5),
  sector: uid(6),
  auditReader: uid(7),
  legacy: uid(8),
  empty: uid(9),
  inactive: uid(10),
  managerA2: uid(11),
};
const A = "10000000-0000-0000-0000-000000000001";
const B = "10000000-0000-0000-0000-000000000002";
const S = "20000000-0000-0000-0000-000000000001";
async function login(id: string, role = "authenticated") {
  await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false);`);
}
async function one<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows[0];
}
async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
 create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(STORAGE_STUB);
  const files = readdirSync("supabase/migrations").sort();
  expect(files).toContain(COVER_MIGRATION);
  for (const file of files.filter((f) => f < COVER_MIGRATION))
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  // A custom role that already exists when the cover migration runs must not gain the permission.
  await db.exec(`insert into core.roles(key,name) values ('legacy-unit-viewer','Legacy');
 insert into core.role_permissions select id,p from core.roles cross join unnest(array['admin.unit.read','audit.inspection.read']) p where key='legacy-unit-viewer';`);
  for (const file of files.filter((f) => f >= COVER_MIGRATION))
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  const values = Object.values(users).map((id) => `('${id}','${id}@example.test',now())`).join(",");
  const role = (key: string, permissions: string[]) =>
    `insert into core.roles(key,name) values ('${key}','${key}'); insert into core.role_permissions select id,p from core.roles cross join unnest(array['${permissions.join("','")}']) p where key='${key}';`;
  const assign = (user: string, key: string, scope = "unit", unit: string | null = A, sector: string | null = null) =>
    `insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select '${user}',id,'${scope}',${unit ? `'${unit}'` : "null"},${sector ? `'${sector}'` : "null"} from core.roles where key='${key}';`;
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ${values};
 select private.bootstrap_administrator('${users.admin}');
 insert into core.units(id,code,name) values ('${A}','A','Unit A'),('${B}','B','Unit B');
 insert into core.sectors(id,code,name) values ('${S}','S','Sector S');
 insert into core.unit_sectors values ('${A}','${S}');
 ${role("unit-manager", ["admin.unit.manage"])}
 ${role("audit-reader", ["audit.inspection.read"])}
 ${assign(users.managerA, "unit-manager")}
 ${assign(users.managerA2, "unit-manager")}
 ${assign(users.managerB, "unit-manager", "unit", B)}
 ${assign(users.quality, "quality", "global", null)}
 ${assign(users.viewerA, "quality_viewer")}
 ${assign(users.sector, "quality_viewer", "sector", A, S)}
 ${assign(users.auditReader, "audit-reader")}
 ${assign(users.legacy, "legacy-unit-viewer")}
 ${assign(users.inactive, "quality", "global", null)}
 update core.profiles set active=false where id='${users.inactive}';`);
}, 60000);
afterAll(async () => {
  await db?.close();
});

type Begun = { asset_id: string; object_key: string };
const begin = (unit = A, type = "image/jpeg", size = 1000, width = 1600, height = 900) =>
  one<Begun>("select * from core.begin_unit_cover_upload($1,$2,$3,$4,$5)", [unit, type, size, width, height]);
const confirm = (unit: string, asset: string, x: number | null = 50, y: number | null = 50) =>
  db.query("select core.confirm_unit_cover_upload($1,$2,$3,$4)", [unit, asset, x, y]);
const cancel = (asset: string) => db.query("select core.cancel_unit_cover_upload($1)", [asset]);
const remove = (unit: string, expected: string | null) => db.query("select core.remove_unit_cover($1,$2)", [unit, expected]);
const position = (unit: string, expected: string | null, x: unknown, y: unknown) =>
  db.query("select core.set_unit_cover_position($1,$2,$3,$4)", [unit, expected, x, y]);
const covers = (units: string[] | null) => rows<{ unit_id: string; asset_id: string; object_key: string; position_x: string; position_y: string }>(
  "select * from core.unit_covers($1)", [units]);
const asset = (id: string) => one<{ status: string; ready_at: string | null; retired_at: string | null }>(
  "select status,ready_at,retired_at from core.unit_cover_assets where id=$1", [id]);
const unit = (id: string) => one<{ cover_asset_id: string | null; cover_position_x: string; cover_position_y: string }>(
  "select cover_asset_id,cover_position_x,cover_position_y from core.units where id=$1", [id]);
/** Simulates the Storage API write (owner and metadata as Storage records them). */
async function store(key: string, owner: string, size = 1000, type = "image/jpeg") {
  await db.exec("reset role");
  await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values ('unit-covers',$1,$2,jsonb_build_object('size',$3::integer,'mimetype',$4::text))", [key, owner, size, type]);
  await login(owner);
}
async function setCover(manager = users.managerA, target = A, x = 50, y = 50) {
  await login(manager);
  const b = await begin(target);
  await store(b.object_key, manager);
  await confirm(target, b.asset_id, x, y);
  return b;
}
async function asOperator<T>(fn: () => Promise<T>) {
  await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
  try {
    return await fn();
  } finally {
    await db.exec("select set_config('request.jwt.claim.sub','',false)");
  }
}
async function age(id: string, interval = "2 hours") {
  await db.exec("reset role; alter table core.unit_cover_assets disable trigger guard_unit_cover_asset");
  await db.query("update core.unit_cover_assets set created_at=clock_timestamp()-$2::interval where id=$1", [id, interval]);
  await db.exec("alter table core.unit_cover_assets enable trigger guard_unit_cover_asset");
}

describe.sequential("Core unit cover contract", () => {
  // Each case starts without live pending uploads, so the per-unit cap is tested explicitly.
  beforeEach(() => asOperator(() => db.query("update core.unit_cover_assets set status='retired',retired_at=now() where status='pending'")));
  it("adds the schema append-only with FKs, checks, RLS and no table grants", async () => {
    await db.exec("reset role");
    const columns = await rows<{ column_name: string; data_type: string; column_default: string | null; is_nullable: string }>(
      "select column_name,data_type,column_default,is_nullable from information_schema.columns where table_schema='core' and table_name='units' and column_name like 'cover%' order by column_name");
    expect(columns).toEqual([
      { column_name: "cover_asset_id", data_type: "uuid", column_default: null, is_nullable: "YES" },
      { column_name: "cover_position_x", data_type: "numeric", column_default: "50", is_nullable: "NO" },
      { column_name: "cover_position_y", data_type: "numeric", column_default: "50", is_nullable: "NO" },
    ]);
    const fks = await rows<{ def: string }>("select pg_get_constraintdef(oid) def from pg_constraint where contype='f' and conrelid in ('core.units'::regclass,'core.unit_cover_assets'::regclass) and pg_get_constraintdef(oid) like '%unit%' order by 1");
    expect(fks.map((f) => f.def)).toEqual(expect.arrayContaining([
      "FOREIGN KEY (id, cover_asset_id) REFERENCES core.unit_cover_assets(unit_id, id)",
      "FOREIGN KEY (unit_id) REFERENCES core.units(id)",
    ]));
    expect(await one("select relrowsecurity from pg_class where oid='core.unit_cover_assets'::regclass")).toEqual({ relrowsecurity: true });
    expect(await rows("select privilege_type from information_schema.role_table_grants where table_schema='core' and table_name='unit_cover_assets' and grantee in ('anon','authenticated','PUBLIC')")).toEqual([]);
    expect(await one("select public,file_size_limit::integer size,allowed_mime_types from storage.buckets where id='unit-covers'"))
      .toEqual({ public: false, size: 1048576, allowed_mime_types: ["image/jpeg"] });
    expect((await rows<{ polname: string; cmd: string }>("select polname,polcmd::text cmd from pg_policy where polrelid='storage.objects'::regclass and polname like 'unit_covers%' order by 1")))
      .toEqual([{ polname: "unit_covers_insert", cmd: "a" }, { polname: "unit_covers_read", cmd: "r" }]);
    const insert = (type: string, size: number, width: number, height: number, status = "pending") =>
      db.query("insert into core.unit_cover_assets(unit_id,mime_type,byte_size,width,height,status,created_by) values($1,$2,$3,$4,$5,$6,$7)",
        [A, type, size, width, height, status, users.admin]);
    for (const args of [["image/png", 10, 10, 10], ["image/jpeg", 1048577, 10, 10], ["image/jpeg", 10, 2561, 10],
      ["image/jpeg", 10, 10, 0], ["image/jpeg", 10, 10, 10, "deleted"], ["image/jpeg", 10, 10, 10, "ready"]] as const)
      await expect(insert(...args)).rejects.toMatchObject({ code: "23514" });
    await expect(db.query(`update core.units set cover_position_x=101 where id='${A}'`)).rejects.toMatchObject({ code: "23514" });
  });
  it("creates core.unit_cover.read for platform_administrator, quality and quality_viewer only", async () => {
    await db.exec("reset role");
    expect(await one("select domain,resource,action,active from core.permissions where key='core.unit_cover.read'"))
      .toEqual({ domain: "core", resource: "unit_cover", action: "read", active: true });
    const holders = await rows<{ key: string }>("select r.key from core.role_permissions rp join core.roles r on r.id=rp.role_id where rp.permission_key='core.unit_cover.read' order by 1");
    expect(holders.map((r) => r.key)).toEqual(["platform_administrator", "quality", "quality_viewer"]);
  });
  it("begins an upload with the canonical object key and an audited pending asset", async () => {
    await login(users.managerA);
    const b = await begin();
    expect(b.object_key).toBe(`units/${A}/covers/${b.asset_id}.jpg`);
    await db.exec("reset role");
    expect(await one("select status,created_by,mime_type,byte_size,width,height from core.unit_cover_assets where id=$1", [b.asset_id]))
      .toEqual({ status: "pending", created_by: users.managerA, mime_type: "image/jpeg", byte_size: 1000, width: 1600, height: 900 });
    expect(await one("select actor_user_id,module,action,unit_id from core.system_audit_log where entity_id=$1", [b.asset_id]))
      .toEqual({ actor_user_id: users.managerA, module: "core", action: "cover_upload_begin", unit_id: A });
  });
  it.each(["quality", "viewerA", "sector", "auditReader", "legacy", "empty", "inactive", "managerB"] as const)(
    "denies %s every cover write on unit A and hides unknown IDs", async (name) => {
      await login(users.managerA);
      const pending = await begin();
      const current = await setCover();
      await login(users[name]);
      await expect(begin()).rejects.toMatchObject({ code: "42501" });
      await expect(begin(uid(999))).rejects.toMatchObject({ code: "42501" });
      await expect(confirm(A, pending.asset_id)).rejects.toMatchObject({ code: "42501" });
      await expect(cancel(pending.asset_id)).rejects.toMatchObject({ code: "42501" });
      await expect(cancel(uid(999))).rejects.toMatchObject({ code: "42501" });
      await expect(remove(A, current.asset_id)).rejects.toMatchObject({ code: "42501" });
      await expect(position(A, current.asset_id, 10, 10)).rejects.toMatchObject({ code: "42501" });
    });
  it("denies anonymous callers and direct table or column writes", async () => {
    await login(users.managerA, "anon");
    await expect(begin()).rejects.toMatchObject({ code: "42501" });
    await expect(covers([A])).rejects.toMatchObject({ code: "42501" });
    await login(users.managerA);
    await expect(db.query("select * from core.unit_cover_assets")).rejects.toMatchObject({ code: "42501" });
    await expect(db.query(`insert into core.unit_cover_assets(unit_id,mime_type,byte_size,width,height) values('${A}','image/jpeg',1,1,1)`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.query(`update core.units set cover_asset_id=null where id='${A}'`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.query(`update core.units set cover_position_x=10 where id='${A}'`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("select * from private.unit_cover_reconciliation()")).rejects.toMatchObject({ code: "42501" });
    await expect(db.query("select private.authorize_unit('admin.unit.manage',$1)", [A])).rejects.toMatchObject({ code: "42501" });
  });
  it.each([
    ["image/png", 1000, 10, 10], ["image/webp", 1000, 10, 10], [null, 1000, 10, 10],
    ["image/jpeg", 0, 10, 10], ["image/jpeg", 1048577, 10, 10], ["image/jpeg", null, 10, 10],
    ["image/jpeg", 1000, 2561, 10], ["image/jpeg", 1000, 10, 2561], ["image/jpeg", 1000, 0, 10], ["image/jpeg", 1000, 10, null],
  ])("rejects invalid metadata %s / %s / %sx%s", async (type, size, width, height) => {
    await login(users.managerA);
    await expect(db.query("select * from core.begin_unit_cover_upload($1,$2,$3,$4,$5)", [A, type, size, width, height]))
      .rejects.toMatchObject({ code: "23514" });
  });
  it("accepts the exact limits and caps live pending uploads per unit", async () => {
    await login(users.managerA);
    await begin(A, "image/jpeg", 1048576, 2560, 2560);
    for (let n = 0; n < 4; n++) await begin();
    await expect(begin()).rejects.toMatchObject({ code: "23514" });
    const all = await asOperator(() => rows<{ id: string }>("select id from core.unit_cover_assets where unit_id=$1 and status='pending'", [A]));
    for (const row of all) await age(row.id);
    await login(users.managerA);
    expect((await begin()).asset_id).toBeTruthy();
  });
  it("confirms only the uploader's live pending asset with matching Storage metadata", async () => {
    await login(users.managerA);
    const b = await begin();
    await expect(confirm(A, b.asset_id)).rejects.toMatchObject({ code: "23514" });
    await login(users.managerA2);
    await expect(confirm(A, b.asset_id)).rejects.toMatchObject({ code: "42501" });
    await store(b.object_key, users.managerA, 999);
    await expect(confirm(A, b.asset_id)).rejects.toMatchObject({ code: "23514" });
    await asOperator(() => db.query("update storage.objects set metadata=jsonb_build_object('size',1000,'mimetype','image/png') where name=$1", [b.object_key]));
    await login(users.managerA);
    await expect(confirm(A, b.asset_id)).rejects.toMatchObject({ code: "23514" });
    await asOperator(() => db.query("update storage.objects set metadata=jsonb_build_object('size',1000,'mimetype','image/jpeg'),owner_id=$2 where name=$1", [b.object_key, users.managerA2]));
    await login(users.managerA);
    await expect(confirm(A, b.asset_id)).rejects.toMatchObject({ code: "23514" });
    await asOperator(() => db.query("update storage.objects set owner_id=$2 where name=$1", [b.object_key, users.managerA]));
    await login(users.managerA);
    await confirm(A, b.asset_id, 20, 80);
    expect(await asOperator(() => unit(A))).toEqual({ cover_asset_id: b.asset_id, cover_position_x: "20.00", cover_position_y: "80.00" });
    await login(users.managerA);
    await confirm(A, b.asset_id, 20, 80);
    expect((await asOperator(() => asset(b.asset_id))).status).toBe("ready");
  });
  it("rejects confirmation for the wrong unit and for assets that are not pending", async () => {
    await login(users.managerA);
    const b = await begin();
    await store(b.object_key, users.managerA);
    await asOperator(() => db.query("insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id) select $1,id,'unit',$2 from core.roles where key='unit-manager'", [users.managerA, B]));
    await login(users.managerA);
    await expect(confirm(B, b.asset_id)).rejects.toMatchObject({ code: "42501" });
    await asOperator(() => db.query("update core.user_role_assignments set active=false where user_id=$1 and unit_id=$2", [users.managerA, B]));
    await login(users.managerA);
    await cancel(b.asset_id);
    await cancel(b.asset_id);
    await expect(confirm(A, b.asset_id)).rejects.toMatchObject({ code: "55000" });
    const expired = await begin();
    await store(expired.object_key, users.managerA);
    await age(expired.asset_id);
    await login(users.managerA);
    await expect(confirm(A, expired.asset_id)).rejects.toMatchObject({ code: "55000" });
    const ready = await setCover();
    await expect(cancel(ready.asset_id)).rejects.toMatchObject({ code: "55000" });
    await expect(confirm(A, ready.asset_id, 101, 50)).resolves.toBeTruthy();
    const fresh = await begin();
    await store(fresh.object_key, users.managerA);
    for (const [x, y] of [[null, 50], [50, null], [-1, 50], [50, 100.01]] as const)
      await expect(confirm(A, fresh.asset_id, x, y)).rejects.toMatchObject({ code: "23514" });
  });
  it("replaces atomically: one ready asset per unit, previous retired and unreadable", async () => {
    const first = await setCover();
    const second = await setCover(users.managerA, A, 10, 90);
    await db.exec("reset role");
    expect(await asset(first.asset_id)).toMatchObject({ status: "retired" });
    expect(await asset(second.asset_id)).toMatchObject({ status: "ready" });
    expect(await one("select count(*)::integer n from core.unit_cover_assets where unit_id=$1 and status='ready'", [A])).toEqual({ n: 1 });
    await login(users.viewerA);
    expect(await one("select private.can_read_unit_cover_object($1) ok", [first.object_key])).toEqual({ ok: false });
    expect(await one("select private.can_read_unit_cover_object($1) ok", [second.object_key])).toEqual({ ok: true });
    expect(await covers([A])).toEqual([expect.objectContaining({ asset_id: second.asset_id, position_x: "10.00", position_y: "90.00" })]);
    await db.exec("reset role");
    const actions = await rows<{ action: string }>("select action from core.system_audit_log where entity_type='unit_cover_assets' and entity_id=$1 order by occurred_at", [first.asset_id]);
    expect(actions.map((a) => a.action)).toEqual(["cover_upload_begin", "cover_ready", "cover_retire"]);
    const logs = await rows("select before_data,after_data from core.system_audit_log where entity_type='unit_cover_assets'");
    expect(JSON.stringify(logs)).not.toMatch(/object_key|units\/.*\/covers|token|signedUrl/);
    expect(await one("select count(*)::integer n from core.system_audit_log where entity_type='units' and entity_id=$1 and after_data->>'cover_asset_id'=$2", [A, second.asset_id])).toEqual({ n: 1 });
  });
  it("positions at 0/50/100, rejects invalid values and stale covers", async () => {
    const current = await setCover();
    for (const [x, y] of [[0, 0], [50, 50], [100, 100], [33.33, 66.67]]) {
      await position(A, current.asset_id, x, y);
      expect(await asOperator(() => unit(A))).toMatchObject({ cover_position_x: x.toFixed(2), cover_position_y: y.toFixed(2) });
      await login(users.managerA);
    }
    for (const [x, y] of [[-0.01, 50], [50, 100.5], [null, 50], ["NaN", 50], [50, "Infinity"]])
      await expect(position(A, current.asset_id, x, y)).rejects.toMatchObject({ code: expect.stringMatching(/^(23514|22P02)$/) });
    await expect(position(A, uid(999), 10, 10)).rejects.toMatchObject({ code: "40001" });
    await expect(position(A, null, 10, 10)).rejects.toMatchObject({ code: "40001" });
  });
  it("removes with optimistic expectation, resets framing and is retry-safe", async () => {
    const current = await setCover(users.managerA, A, 5, 95);
    await expect(remove(A, uid(999))).rejects.toMatchObject({ code: "40001" });
    await remove(A, current.asset_id);
    expect(await asOperator(() => unit(A))).toEqual({ cover_asset_id: null, cover_position_x: "50.00", cover_position_y: "50.00" });
    expect((await asOperator(() => asset(current.asset_id))).status).toBe("retired");
    await login(users.managerA);
    await remove(A, current.asset_id);
    await expect(position(A, current.asset_id, 10, 10)).rejects.toMatchObject({ code: "40001" });
    expect(await covers([A])).toEqual([]);
  });
  it("enforces the ready-pointer invariant and lifecycle transitions even for operators", async () => {
    await login(users.managerA);
    const pending = await begin();
    const other = await setCover(users.managerB, B);
    await asOperator(async () => {
      await expect(db.query("update core.units set cover_asset_id=$2 where id=$1", [A, pending.asset_id])).rejects.toMatchObject({ code: "23514" });
      await expect(db.query("update core.units set cover_asset_id=$2 where id=$1", [A, other.asset_id])).rejects.toMatchObject({ code: "23503" });
      await expect(db.query("update core.unit_cover_assets set status='retired',retired_at=now() where id=$1", [other.asset_id])).rejects.toMatchObject({ code: "23514" });
      await expect(db.query("update core.unit_cover_assets set status='pending',ready_at=null where id=$1", [other.asset_id])).rejects.toMatchObject({ code: "55000" });
      await expect(db.query("update core.unit_cover_assets set width=10 where id=$1", [other.asset_id])).rejects.toMatchObject({ code: "55000" });
      await expect(db.query("update core.unit_cover_assets set status='purged',purged_at=now(),retired_at=now() where id=$1", [pending.asset_id])).rejects.toMatchObject({ code: "55000" });
    });
  });
  it("reads in batch: max 100, only authorized ready covers, isolated per unit", async () => {
    await setCover(users.managerA, A, 25, 75);
    await setCover(users.managerB, B);
    const many = Array.from({ length: 100 }, (_, n) => (n === 0 ? A : n === 1 ? B : uid(5000 + n)));
    const expectUnits = async (who: string, expected: string[]) => {
      await login(who);
      expect((await covers(many)).map((c) => c.unit_id)).toEqual(expected);
    };
    await expectUnits(users.admin, [A, B]);
    await expectUnits(users.quality, [A, B]);
    await expectUnits(users.viewerA, [A]);
    await expectUnits(users.managerA, [A]);
    await expectUnits(users.managerB, [B]);
    for (const who of [users.sector, users.auditReader, users.legacy, users.empty, users.inactive]) await expectUnits(who, []);
    await login(users.viewerA);
    expect(await covers([])).toEqual([]);
    const [a] = await covers([A, A]);
    expect(a).toMatchObject({ unit_id: A, position_x: "25.00", position_y: "75.00", object_key: expect.stringMatching(new RegExp(`^units/${A}/covers/[0-9a-f-]{36}\\.jpg$`)) });
    await expect(covers([...many, uid(9999)])).rejects.toMatchObject({ code: "22023" });
    await expect(covers(null)).rejects.toMatchObject({ code: "22023" });
  });
  it("enforces Storage INSERT for the uploader's live pending key and SELECT for readable ready covers", async () => {
    await login(users.managerA);
    const b = await begin();
    const insert = (key: string, owner = users.managerA) =>
      db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('unit-covers',$1,$2,'{\"size\":1000,\"mimetype\":\"image/jpeg\"}')", [key, owner]);
    await db.exec("select set_config('storage.operation','storage.object.upload',false)");
    await expect(insert(`units/${A}/covers/${uid(777)}.jpg`)).rejects.toMatchObject({ code: "42501" });
    await expect(insert(`units/${A}/covers/original.png`)).rejects.toMatchObject({ code: "42501" });
    await login(users.managerA2);
    await db.exec("select set_config('storage.operation','storage.object.upload',false)");
    await expect(insert(b.object_key, users.managerA2)).rejects.toMatchObject({ code: "42501" });
    await login(users.managerA);
    await db.exec("select set_config('storage.operation','storage.object.copy',false)");
    await expect(insert(b.object_key)).rejects.toMatchObject({ code: "42501" });
    await db.exec("select set_config('storage.operation','storage.object.upload',false)");
    expect(await rows("select 1 from storage.objects where name=$1", [b.object_key])).toEqual([]);
    await insert(b.object_key);
    expect(await rows("select 1 from storage.objects where name=$1", [b.object_key])).toEqual([]);
    await confirm(A, b.asset_id);
    expect(await rows("select 1 from storage.objects where name=$1", [b.object_key])).toHaveLength(1);
    expect(await rows("update storage.objects set name='forged' where name=$1 returning id", [b.object_key])).toEqual([]);
    expect(await rows("delete from storage.objects where name=$1 returning id", [b.object_key])).toEqual([]);
    for (const who of [users.auditReader, users.managerB, users.sector, users.legacy]) {
      await login(who);
      expect(await rows("select 1 from storage.objects where name=$1", [b.object_key])).toEqual([]);
    }
    await login(users.quality);
    expect(await rows("select 1 from storage.objects where name=$1", [b.object_key])).toHaveLength(1);
    const expired = await (async () => { await login(users.managerA); return begin(); })();
    await age(expired.asset_id);
    await login(users.managerA);
    await db.exec("select set_config('storage.operation','storage.object.upload',false)");
    await expect(insert(expired.object_key)).rejects.toMatchObject({ code: "42501" });
  });
  it("reconciles expired pending, retained retired and orphan objects without purging", async () => {
    await login(users.managerA);
    const expired = await begin();
    await age(expired.asset_id);
    const old = await setCover();
    await setCover();
    await asOperator(() => db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('unit-covers',$1,null,'{}')", [`units/${A}/covers/${uid(4242)}.jpg`]));
    const report = await asOperator(() => rows<{ issue: string; asset_id: string | null }>("select issue,asset_id from private.unit_cover_reconciliation()"));
    expect(report).toEqual(expect.arrayContaining([
      { issue: "expired_pending", asset_id: expired.asset_id },
      { issue: "retired_object_retained", asset_id: old.asset_id },
      { issue: "orphan_object", asset_id: null },
    ]));
    expect(report.some((r) => r.issue === "ready_missing_object")).toBe(false);
    expect(await asOperator(() => one("select count(*)::integer n from storage.objects where name=$1", [old.object_key]))).toEqual({ n: 1 });
    expect(await asOperator(() => one("select count(*)::integer n from core.unit_cover_assets where status='purged'"))).toEqual({ n: 0 });
  });
});
