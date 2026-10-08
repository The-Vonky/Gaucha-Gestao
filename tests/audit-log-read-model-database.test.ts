import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STORAGE_STUB } from "./storage-stub";
let db: PGlite;
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const eid = (n: number) => `30000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const users = {
  admin: uid(1),
  ana: uid(2),
  bruno: uid(3),
  carla: uid(4),
  globalReader: uid(5),
  namedReader: uid(6),
  unitReader: uid(7),
  sectorReader: uid(8),
  directoryOnly: uid(9),
  inactiveReader: uid(10),
};
const A = "10000000-0000-0000-0000-000000000001";
const B = "10000000-0000-0000-0000-000000000002";
const S = "20000000-0000-0000-0000-000000000001";
// Probe events, inserted directly by the operator with fixed ids and instants.
const events = [
  { id: eid(1), at: "2026-10-01T10:00:00.000Z", actor: users.ana, action: "create", type: "thing", entity: "x1", unit: A, sector: S, before: null, after: { n: 1, nested: { list: [1, "dois", null], flag: true } } },
  { id: eid(2), at: "2026-10-01T11:00:00.000Z", actor: users.bruno, action: "update", type: "thing", entity: "x1", unit: A, sector: null, before: { n: 1 }, after: { n: 2 } },
  { id: eid(3), at: "2026-10-02T00:00:00.000Z", actor: null, action: "update", type: "other", entity: "y1", unit: B, sector: null, before: { k: "v" }, after: { k: "w" } },
  { id: eid(4), at: "2026-10-02T00:00:00.000Z", actor: users.ana, action: "delete", type: "other", entity: "y2", unit: null, sector: null, before: { k: "z" }, after: null },
  { id: eid(5), at: "2026-10-03T00:00:00.000Z", actor: users.globalReader, action: "update", type: "thing", entity: "x2", unit: A, sector: S, before: {}, after: {} },
];
type Row = {
  id: string;
  occurred_at: Date;
  actor_user_id: string | null;
  actor_display_name: string | null;
  actor_active: boolean | null;
  actor_label_source: string | null;
  module: string;
  action: string;
  entity_type: string;
  entity_id: string;
  unit_id: string | null;
  unit_code: string | null;
  unit_name: string | null;
  unit_active: boolean | null;
  unit_label_source: string | null;
  sector_id: string | null;
  sector_code: string | null;
  sector_name: string | null;
  sector_active: boolean | null;
  sector_label_source: string | null;
  before_data: unknown;
  after_data: unknown;
  metadata: unknown;
  correlation_id: string | null;
  total_count: string | number;
};
type Filters = Partial<{
  limit: number;
  offset: number;
  from: string;
  to: string;
  actor: string;
  actorSearch: string;
  module: string;
  action: string;
  entityType: string;
  entityId: string;
}>;
async function login(id: string, role = "authenticated") {
  await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false);`);
}
async function page(f: Filters = {}, probe = true) {
  const { rows } = await db.query<Row>(
    "select * from core.audit_log_page(p_limit=>$1,p_offset=>$2,p_from=>$3,p_to=>$4,p_actor=>$5,p_actor_search=>$6,p_module=>$7,p_action=>$8,p_entity_type=>$9,p_entity_id=>$10)",
    [f.limit ?? 25, f.offset ?? 0, f.from ?? null, f.to ?? null, f.actor ?? null, f.actorSearch ?? null,
      f.module ?? (probe ? "probe" : null), f.action ?? null, f.entityType ?? null, f.entityId ?? null],
  );
  return rows;
}
const ids = (rows: Row[]) => rows.map((r) => r.id);
const count = (rows: Row[]) => (rows.length ? Number(rows[0].total_count) : 0);
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
 create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}', last_sign_in_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(STORAGE_STUB);
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  const names: Record<string, string> = { ana: "Ana Souza", bruno: "Bruno Lima", carla: "Carla Dias" };
  const values = Object.entries(users)
    .map(([key, id]) => `('${id}','${key}@example.test',now(),'{"display_name":"${names[key] ?? key}"}')`)
    .join(",");
  const role = (key: string, permissions: string[]) =>
    `insert into core.roles(key,name) values ('${key}','${key}'); insert into core.role_permissions select id,p from core.roles cross join unnest(array['${permissions.join("','")}']) p where key='${key}';`;
  const assign = (user: string, key: string, scope = "global", unit: string | null = null, sector: string | null = null) =>
    `insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select '${user}',id,'${scope}',${unit ? `'${unit}'` : "null"},${sector ? `'${sector}'` : "null"} from core.roles where key='${key}';`;
  await db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ${values};
 select private.bootstrap_administrator('${users.admin}');
 insert into core.units(id,code,name) values ('${A}','A','Unit A'),('${B}','B','Unit B');
 insert into core.sectors(id,code,name) values ('${S}','S','Sector S');
 insert into core.unit_sectors values ('${A}','${S}');
 ${role("log-reader", ["admin.audit_log.read"])}
 ${role("log-reader-named", ["admin.audit_log.read", "admin.user.read", "admin.sector.read"])}
 ${role("log-reader-unit", ["admin.audit_log.read", "admin.unit.read"])}
 ${role("directory", ["admin.user.read"])}
 ${assign(users.globalReader, "log-reader")}
 ${assign(users.namedReader, "log-reader-named")}
 ${assign(users.unitReader, "log-reader-unit", "unit", A)}
 ${assign(users.sectorReader, "log-reader", "sector", A, S)}
 ${assign(users.directoryOnly, "directory")}
 ${assign(users.inactiveReader, "log-reader-named")}
 update core.profiles set active=false where id in ('${users.bruno}','${users.inactiveReader}');`);
  for (const e of events)
    await db.query(
      "insert into core.system_audit_log(id,occurred_at,actor_user_id,module,action,entity_type,entity_id,unit_id,sector_id,before_data,after_data,metadata,correlation_id) values ($1,$2,$3,'probe',$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [e.id, e.at, e.actor, e.action, e.type, e.entity, e.unit, e.sector,
        e.before === null ? null : JSON.stringify(e.before), e.after === null ? null : JSON.stringify(e.after),
        JSON.stringify({ origin: e.id }), `corr-${e.id.slice(-1)}`],
    );
}, 60000);
afterAll(async () => {
  await db?.close();
});

describe.sequential("Core audit log read model", () => {
  it("is a read-only invoker RPC without e-mail, executable only by authenticated", async () => {
    await db.exec("reset role");
    const fn = await db.query<{ prosecdef: boolean; provolatile: string; proconfig: string[]; result: string }>(
      "select prosecdef,provolatile,proconfig,pg_get_function_result(oid) result from pg_proc where proname='audit_log_page' and pronamespace='core'::regnamespace");
    expect(fn.rows).toHaveLength(1);
    expect(fn.rows[0]).toMatchObject({ prosecdef: false, provolatile: "s", proconfig: ["search_path=\"\""] });
    expect(fn.rows[0].result).not.toMatch(/email|sign_in/);
    const grants = await db.query<{ anon: boolean; auth: boolean; pub: boolean }>(
      `select has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') auth,
       exists(select 1 from aclexplode(p.proacl) a where a.grantee=0) pub from pg_proc p where proname='audit_log_page' and pronamespace='core'::regnamespace`);
    expect(grants.rows[0]).toEqual({ anon: false, auth: true, pub: false });
    // The log itself stays select-only for clients.
    const writes = await db.query("select privilege_type from information_schema.role_table_grants where table_schema='core' and table_name='system_audit_log' and grantee in ('anon','authenticated','PUBLIC') and privilege_type<>'SELECT'");
    expect(writes.rows).toEqual([]);
  });

  it("denies anonymous, inactive and callers without admin.audit_log.read", async () => {
    await login("", "anon");
    await expect(page()).rejects.toThrow(/permission denied/);
    for (const user of [users.inactiveReader, users.directoryOnly, users.ana]) {
      await login(user);
      await expect(page()).rejects.toThrow(/Forbidden/);
    }
  });

  it("gives a global reader every event and names only from rows it already reads", async () => {
    await login(users.globalReader);
    const rows = await page();
    // Newest first; equal instants are ordered by id descending.
    expect(ids(rows)).toEqual([eid(5), eid(4), eid(3), eid(2), eid(1)]);
    expect(count(rows)).toBe(5);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    // Other actors' profiles are outside profiles_read: id kept, name unavailable.
    expect(byId[eid(1)]).toMatchObject({ actor_user_id: users.ana, actor_display_name: null, actor_active: null, actor_label_source: "unavailable" });
    // Its own profile is readable.
    expect(byId[eid(5)]).toMatchObject({ actor_display_name: "globalReader", actor_active: true, actor_label_source: "current" });
    // No admin.unit/sector read: labels unavailable, ids kept.
    expect(byId[eid(1)]).toMatchObject({ unit_id: A, unit_code: null, unit_name: null, unit_label_source: "unavailable",
      sector_id: S, sector_name: null, sector_label_source: "unavailable" });
    // Event without actor/unit/sector has no label source at all.
    expect(byId[eid(3)]).toMatchObject({ actor_user_id: null, actor_label_source: null, sector_id: null, sector_label_source: null });
    expect(byId[eid(4)]).toMatchObject({ unit_id: null, unit_label_source: null });
  });

  it("resolves current authorized actor, unit and sector names, including inactive actors", async () => {
    await login(users.namedReader);
    const byId = Object.fromEntries((await page()).map((r) => [r.id, r]));
    expect(byId[eid(1)]).toMatchObject({ actor_display_name: "Ana Souza", actor_active: true, actor_label_source: "current",
      unit_code: "A", unit_name: "Unit A", unit_active: true, unit_label_source: "current",
      sector_code: "S", sector_name: "Sector S", sector_active: true, sector_label_source: "current" });
    expect(byId[eid(2)]).toMatchObject({ actor_user_id: users.bruno, actor_display_name: "Bruno Lima", actor_active: false, actor_label_source: "current" });
    expect(byId[eid(3)]).toMatchObject({ unit_code: "B", unit_name: "Unit B" });
  });

  it("hides events outside a unit or sector scope without changing the response shape", async () => {
    await login(users.unitReader);
    let rows = await page();
    // Unit A events only (any sector); global and Unit B events are invisible.
    expect(ids(rows)).toEqual([eid(5), eid(2), eid(1)]);
    expect(count(rows)).toBe(3);
    expect(rows[2]).toMatchObject({ unit_name: "Unit A", unit_label_source: "current", sector_name: null, sector_label_source: "unavailable", actor_display_name: null });
    expect(await page({ entityId: "y1" })).toEqual([]);
    expect(await page({ entityId: "does-not-exist" })).toEqual([]);
    await login(users.sectorReader);
    rows = await page();
    expect(ids(rows)).toEqual([eid(5), eid(1)]);
    expect(rows[0]).toMatchObject({ unit_label_source: "unavailable", sector_label_source: "unavailable" });
  });

  it("searches actor names only among readable profiles of visible events", async () => {
    await login(users.namedReader);
    expect(ids(await page({ actorSearch: "  ana " }))).toEqual([eid(4), eid(1)]);
    expect(ids(await page({ actorSearch: "LIMA" }))).toEqual([eid(2)]);
    // A user without visible events is never listed, even when the caller reads the directory.
    expect(await page({ actorSearch: "Carla" }, false)).toEqual([]);
    // Wildcards are literal.
    expect(await page({ actorSearch: "%" }, false)).toEqual([]);
    expect(await page({ actorSearch: "_" }, false)).toEqual([]);
    // A reader without the directory cannot match other people's names, even on visible events.
    await login(users.globalReader);
    expect(await page({ actorSearch: "Ana" }, false)).toEqual([]);
    expect(await page({ actorSearch: "a" })).toEqual(await page({ actor: users.globalReader }));
    await login(users.unitReader);
    expect(await page({ actorSearch: "Bruno" }, false)).toEqual([]);
  });

  it("filters by actor id, module, action, entity type and entity id", async () => {
    await login(users.globalReader);
    expect(ids(await page({ actor: users.ana }))).toEqual([eid(4), eid(1)]);
    expect(ids(await page({ action: "update" }))).toEqual([eid(5), eid(3), eid(2)]);
    expect(ids(await page({ entityType: "thing" }))).toEqual([eid(5), eid(2), eid(1)]);
    expect(ids(await page({ entityType: "thing", entityId: "x1" }))).toEqual([eid(2), eid(1)]);
    expect(ids(await page({ entityId: "x1", action: "update", actor: users.bruno }))).toEqual([eid(2)]);
    expect(await page({ module: "nope" }, false)).toEqual([]);
    // Blank text filters mean no filter.
    expect(ids(await page({ action: "  ", entityType: "" }))).toHaveLength(5);
    expect((await page({}, false)).length).toBeGreaterThan(5);
  });

  it("uses a half-open [from,to) interval with exact timestamps", async () => {
    await login(users.globalReader);
    expect(ids(await page({ from: events[0].at, to: events[1].at }))).toEqual([eid(1)]);
    expect(ids(await page({ from: events[1].at }))).toEqual([eid(5), eid(4), eid(3), eid(2)]);
    expect(ids(await page({ to: "2026-10-02T00:00:00.000Z" }))).toEqual([eid(2), eid(1)]);
    expect(ids(await page({ from: "2026-10-01T21:00:00-03:00", to: "2026-10-01T21:00:00.001-03:00" }))).toEqual([eid(4), eid(3)]);
    const rows = await page();
    expect(rows.map((r) => r.occurred_at.toISOString())).toEqual([events[4].at, events[3].at, events[2].at, events[1].at, events[0].at]);
    await expect(page({ from: events[1].at, to: events[1].at })).rejects.toThrow(/Invalid filter/);
    await expect(page({ from: events[1].at, to: events[0].at })).rejects.toThrow(/Invalid filter/);
  });

  it("paginates with a stable order and an authorized total count", async () => {
    await login(users.globalReader);
    const first = await page({ limit: 2 });
    const second = await page({ limit: 2, offset: 2 });
    const third = await page({ limit: 2, offset: 4 });
    expect([...ids(first), ...ids(second), ...ids(third)]).toEqual([eid(5), eid(4), eid(3), eid(2), eid(1)]);
    expect([first, second, third].map(count)).toEqual([5, 5, 5]);
    expect(await page({ limit: 2, offset: 6 })).toEqual([]);
    // Pinning the upper bound keeps pages stable while new events arrive.
    await db.exec("reset role");
    await db.query("insert into core.system_audit_log(module,action,entity_type,entity_id,occurred_at) values ('probe','create','thing','late','2026-10-09')");
    await login(users.globalReader);
    expect(ids(await page({ limit: 2, offset: 2, to: "2026-10-04T00:00:00Z" }))).toEqual(ids(second));
    expect(count(await page())).toBe(6);
    await login(users.unitReader);
    expect(count(await page({ limit: 1 }))).toBe(3);
    for (const f of [{ limit: 0 }, { limit: 101 }, { offset: -1 }, { actorSearch: "x".repeat(161) }, { entityId: "x".repeat(161) }])
      await expect(page(f)).rejects.toThrow(/Invalid filter/);
  });

  it("returns before/after/metadata exactly as stored and never writes the trail", async () => {
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
    const total = async () => Number((await db.query<{ n: number }>("select count(*) n from core.system_audit_log")).rows[0].n);
    const stored = (await db.query<{ id: string; before_data: unknown; after_data: unknown; metadata: unknown; correlation_id: string }>(
      "select id,before_data,after_data,metadata,correlation_id from core.system_audit_log where module='probe' and id::text like '30000000%' order by occurred_at desc,id desc")).rows;
    const before = await total();
    await login(users.namedReader);
    const rows = await page({ entityType: "thing" });
    rows.push(...await page({ entityType: "other" }));
    const projected = rows.filter((r) => r.id.startsWith("30000000")).map(({ id, before_data, after_data, metadata, correlation_id }) => ({ id, before_data, after_data, metadata, correlation_id }));
    expect(projected.sort((a, b) => a.id.localeCompare(b.id))).toEqual(stored.sort((a, b) => a.id.localeCompare(b.id)));
    expect(rows.find((r) => r.id === eid(1))?.after_data).toEqual(events[0].after);
    expect(rows.find((r) => r.id === eid(4))?.after_data).toBeNull();
    // A real trigger event (unit rename) is projected with its original JSON.
    await login(users.admin);
    await db.query(`update core.units set name='Unit A2' where id='${A}'`);
    const event = (await page({ module: "core", entityType: "units", entityId: A, action: "update" }, false))[0];
    expect(event).toMatchObject({ actor_user_id: users.admin, unit_name: "Unit A2" });
    expect((event.before_data as { name: string }).name).toBe("Unit A");
    expect((event.after_data as { name: string }).name).toBe("Unit A2");
    await db.exec("reset role");
    expect(await total()).toBe(before + 1);
    // Clients still cannot write or rewrite the trail.
    await login(users.admin);
    await expect(db.query("insert into core.system_audit_log(module,action,entity_type,entity_id) values ('probe','x','y','z')")).rejects.toThrow();
    await expect(db.query(`update core.system_audit_log set after_data='{}' where id='${eid(1)}'`)).rejects.toThrow();
    await expect(db.query(`delete from core.system_audit_log where id='${eid(1)}'`)).rejects.toThrow();
    await db.exec("reset role");
    expect(await total()).toBe(before + 1);
  });
});
