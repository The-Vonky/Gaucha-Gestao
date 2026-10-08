import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STORAGE_STUB } from "./storage-stub";
let db: PGlite;
const uid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const users = {
  admin: uid(1),
  userRead: uid(2),
  reviewer: uid(3),
  roleOnly: uid(4),
  unitOnly: uid(5),
  empty: uid(6),
  inactiveCaller: uid(7),
  unitReviewer: uid(8),
  bruno: uid(10),
  carla: uid(11),
  dora: uid(12),
  leaver: uid(13),
  eli: uid(14),
  fabio: uid(15),
};
const A = "10000000-0000-0000-0000-000000000001";
const B = "10000000-0000-0000-0000-000000000002";
const S = "20000000-0000-0000-0000-000000000001";
const T = "20000000-0000-0000-0000-000000000002";
const GUESS = "99999999-9999-9999-9999-999999999999";
const roles: Record<string, string> = {};
type Assignment = {
  assignment_id: string;
  assignment_active: boolean;
  user_id: string;
  user_display_name: string;
  user_active: boolean;
  role_id: string;
  role_active: boolean;
  scope_type: string;
  unit_id: string | null;
  unit_code: string | null;
  unit_label_source: string | null;
  sector_id: string | null;
  sector_code: string | null;
  sector_label_source: string | null;
  granted_by: string | null;
  granted_by_name: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  revoked_by_name: string | null;
  revocation_evidence: string | null;
  composition_visibility: string;
  effective: boolean | null;
  active_permission_keys: string[] | null;
  total_count: number;
  people_count: number;
};
async function login(id: string, role = "authenticated") {
  await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false);`);
}
async function rows<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows;
}
const userSummary = (id: string) => rows("select * from core.user_access_summary($1)", [id]);
const userAssignments = (id: string, revoked = false, limit = 100, offset = 0) =>
  rows<Assignment>("select * from core.user_access_assignments($1,$2,$3,$4)", [id, revoked, limit, offset]);
const unitSummary = (unit: string, sector: string | null = null) =>
  rows("select * from core.unit_access_summary($1,$2)", [unit, sector]);
const unitAssignments = (unit: string, sector: string | null = null, revoked = false, limit = 100, offset = 0) =>
  rows<Assignment>("select * from core.unit_access_assignments($1,$2,$3,$4,$5)", [unit, sector, revoked, limit, offset]);
const roleSummary = (id: string) => rows("select * from core.role_impact_summary($1)", [id]);
const roleHolders = (id: string, revoked = false, limit = 100, offset = 0) =>
  rows<Assignment>("select * from core.role_holders($1,$2,$3,$4)", [id, revoked, limit, offset]);
async function nothingVisible(subject: string) {
  expect(await userSummary(subject)).toEqual([]);
  expect(await userAssignments(subject, true)).toEqual([]);
  expect(await unitAssignments(A, null, true)).toEqual([]);
  expect(await roleHolders(roles.quality, true)).toEqual([]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
 create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}', last_sign_in_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(STORAGE_STUB);
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  const names: Record<string, string> = {
    admin: "Ana Admin",
    userRead: "Ugo Leitor",
    reviewer: "Rita Revisora",
    roleOnly: "Paulo Perfis",
    unitOnly: "Ulisses Unidade",
    empty: "Eva Vazia",
    inactiveCaller: "Igor Inativo",
    unitReviewer: "Vera Unidades",
    bruno: "Bruno",
    carla: "Carla",
    dora: "Dora",
    leaver: "Lia Desligada",
    eli: "Eli",
    fabio: "Fabio",
  };
  await db.exec(
    `insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ${Object.entries(users)
      .map(([k, id]) => `('${id}','${k}@example.test',now(),'{"display_name":"${names[k]}"}')`)
      .join(",")};
 select private.bootstrap_administrator('${users.admin}');
 insert into core.units(id,code,name) values ('${A}','A','Unit A'),('${B}','B','Unit B');
 insert into core.sectors(id,code,name) values ('${S}','S','Sector S'),('${T}','T','Sector T');
 insert into core.unit_sectors values ('${A}','${S}'),('${A}','${T}'),('${B}','${S}');`,
  );
  // Every grant, revocation and deactivation below runs as the administrator, so granted_by
  // and the revoke events carry a real actor, exactly as through the Administration UI.
  await login(users.admin);
  for (const r of await rows<{ id: string; key: string }>("select id,key from core.roles")) roles[r.key] = r.id;
  const role = async (key: string, permissions: string[]) =>
    (roles[key] = (
      await rows<{ id: string }>("select core.save_role(null,null,$1,$1,'',$2) as id", [key, permissions])
    )[0].id);
  await role("gov-user-read", ["admin.user.read"]);
  await role("gov-reviewer", ["admin.user.read", "admin.role.read", "admin.unit.read"]);
  await role("gov-role-read", ["admin.role.read"]);
  await role("gov-unit-read", ["admin.unit.read"]);
  await role("gov-unit-reviewer", ["admin.user.read", "admin.unit.read"]);
  await role("legacy", ["audit.inspection.read"]);
  // An active role without any permission: holding it grants nothing.
  await role("hollow", []);
  const grant = (user: string, key: string, scope = "global", unit: string | null = null, sector: string | null = null) =>
    db.query(
      "insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) values ($1,$2,$3,$4,$5)",
      [user, roles[key], scope, unit, sector],
    );
  await grant(users.userRead, "gov-user-read");
  await grant(users.reviewer, "gov-reviewer");
  await grant(users.roleOnly, "gov-role-read");
  await grant(users.unitOnly, "gov-unit-read", "unit", A);
  await grant(users.unitReviewer, "gov-unit-reviewer");
  await grant(users.inactiveCaller, "gov-reviewer");
  // Bruno: overlapping Quality grants (global and unit A) plus a sector-only viewer grant.
  await grant(users.bruno, "quality");
  await grant(users.bruno, "quality", "unit", A);
  await grant(users.bruno, "quality_viewer", "sector", A, S);
  // Carla: Quality in B revoked, then a viewer grant in B.
  await grant(users.carla, "quality", "unit", B);
  await db.query("update core.user_role_assignments set active=false where user_id=$1 and role_id=$2", [
    users.carla,
    roles.quality,
  ]);
  await grant(users.carla, "quality_viewer", "unit", B);
  // Dora: an active assignment of a role that is later deactivated.
  await grant(users.dora, "legacy", "unit", A);
  await db.query("update core.roles set active=false where id=$1", [roles.legacy]);
  // Lia: user deactivated, which revokes her assignment through the existing trigger.
  await grant(users.leaver, "quality");
  await db.query("update core.profiles set active=false where id=$1", [users.leaver]);
  await db.query("update core.profiles set active=false where id=$1", [users.inactiveCaller]);
  // Eli: one role a read-only user admin also holds (composition readable) and one it does not.
  await grant(users.eli, "gov-user-read");
  await grant(users.eli, "quality_viewer", "unit", B);
  // Fabio: only the permission-less role, in unit A.
  await grant(users.fabio, "hollow", "unit", A);
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("Core access governance read v1", () => {
  it("denies anonymous callers and returns nothing to unassigned or inactive users", async () => {
    await login("", "anon");
    for (const sql of [
      `select * from core.user_access_summary('${users.bruno}')`,
      `select * from core.user_access_assignments('${users.bruno}')`,
      `select * from core.unit_access_summary('${A}')`,
      `select * from core.unit_access_assignments('${A}')`,
      `select * from core.role_impact_summary('${roles.quality}')`,
      `select * from core.role_holders('${roles.quality}')`,
    ])
      await expect(db.query(sql)).rejects.toThrow();
    for (const caller of [users.empty, users.inactiveCaller, users.bruno]) {
      await login(caller);
      await nothingVisible(users.carla);
      expect(await unitSummary(A)).toEqual([]);
      expect(await roleSummary(roles.quality)).toEqual([]);
    }
  });
  it("lets a global user admin read a complete user access summary and history", async () => {
    await login(users.admin);
    expect((await userSummary(users.bruno))[0]).toMatchObject({
      display_name: "Bruno",
      user_active: true,
      active_assignment_count: 3,
      revoked_assignment_count: 0,
      effective_assignment_count: 3,
      composition_coverage: "complete",
    });
    // Keys are only returned per assignment, paired with their scope, never as a flat union.
    expect((await userSummary(users.bruno))[0]).not.toHaveProperty("active_permission_keys");
    const bruno = await userAssignments(users.bruno);
    expect(bruno.map((a) => a.scope_type).sort()).toEqual(["global", "sector", "unit"]);
    const sector = bruno.find((a) => a.scope_type === "sector")!;
    expect(sector).toMatchObject({
      unit_id: A,
      unit_code: "A",
      unit_label_source: "current",
      sector_id: S,
      sector_code: "S",
      sector_label_source: "current",
      granted_by: users.admin,
      granted_by_name: "Ana Admin",
      composition_visibility: "available",
      effective: true,
      active_permission_keys: ["action_plan.read", "audit.inspection.export", "audit.inspection.read", "core.unit_cover.read"],
      revocation_evidence: null,
    });
    // History: revoked assignments only when asked, with the revoke event as evidence.
    const carla = await userAssignments(users.carla);
    expect(carla.map((a) => a.role_id)).toEqual([roles.quality_viewer]);
    const history = await userAssignments(users.carla, true);
    expect(history.map((a) => [a.role_id, a.assignment_active])).toEqual([
      [roles.quality_viewer, true],
      [roles.quality, false],
    ]);
    expect(history[1]).toMatchObject({
      revoked_by: users.admin,
      revoked_by_name: "Ana Admin",
      revocation_evidence: "audit_event",
      effective: false,
      total_count: 2,
    });
    expect(history[1].revoked_at).not.toBeNull();
  });
  it("keeps inactive users and roles representable without calling them revoked", async () => {
    await login(users.admin);
    expect((await userSummary(users.leaver))[0]).toMatchObject({
      user_active: false,
      active_assignment_count: 0,
      revoked_assignment_count: 1,
      effective_assignment_count: 0,
    });
    expect((await userAssignments(users.leaver, true))[0]).toMatchObject({
      user_active: false,
      assignment_active: false,
      revoked_by: users.admin,
      revocation_evidence: "audit_event",
    });
    // Inactive role: the assignment stays active, but grants nothing.
    expect((await userAssignments(users.dora))[0]).toMatchObject({
      assignment_active: true,
      role_active: false,
      effective: false,
      revocation_evidence: null,
      active_permission_keys: ["audit.inspection.read"],
    });
    expect((await userSummary(users.dora))[0]).toMatchObject({
      active_assignment_count: 1,
      effective_assignment_count: 0,
    });
    // Reactivating or recomposing it could affect Dora; today nobody derives access from it.
    expect((await roleSummary(roles.legacy))[0]).toMatchObject({
      impact_kind: "potential",
      role_active: false,
      active_permission_count: 1,
      role_grants_capabilities: false,
      holders_visibility: "available",
      holder_count: 1,
      inactive_user_holder_count: 0,
      potentially_affected_user_count: 1,
      currently_effective_user_count: 0,
    });
    // An inactive user's revoked assignment is history, not a holder.
    const quality = (await roleSummary(roles.quality))[0];
    expect(quality).toMatchObject({ holder_count: 1, inactive_user_holder_count: 0 });
    expect(quality.revoked_assignment_count).toBe(2);
  });
  it("gives a read-only user admin people but not hidden composition, catalogs or logs", async () => {
    await login(users.userRead);
    expect((await userSummary(users.bruno))[0]).toMatchObject({
      active_assignment_count: 3,
      effective_assignment_count: null,
      composition_coverage: "restricted",
    });
    const sector = (await userAssignments(users.bruno)).find((a) => a.scope_type === "sector")!;
    expect(sector).toMatchObject({
      unit_id: A,
      unit_code: null,
      unit_label_source: "restricted",
      sector_code: null,
      sector_label_source: "restricted",
      composition_visibility: "restricted",
      effective: null,
      active_permission_keys: null,
      granted_by_name: "Ana Admin",
    });
    // Without admin.audit_log.read the revocation is reported as unavailable, not invented.
    expect((await userAssignments(users.carla, true))[1]).toMatchObject({
      assignment_active: false,
      revoked_at: null,
      revoked_by: null,
      revocation_evidence: "unavailable",
    });
    // Role holders need U + R; unit coverage needs the unit to be readable.
    expect((await roleSummary(roles.quality))[0]).toMatchObject({
      impact_kind: "potential",
      composition_visibility: "restricted",
      active_permission_count: null,
      inactive_permission_count: null,
      role_grants_capabilities: null,
      holders_visibility: "restricted",
      holder_count: null,
      potentially_affected_user_count: null,
      currently_effective_user_count: null,
      holders_with_other_roles_count: null,
      active_assignment_count: null,
    });
    expect(await roleHolders(roles.quality)).toEqual([]);
    expect(await unitSummary(A)).toEqual([]);
    expect(await unitAssignments(A)).toEqual([]);
  });
  it("reports partial composition coverage instead of a complete-looking answer", async () => {
    await login(users.userRead);
    expect((await userSummary(users.eli))[0]).toMatchObject({
      active_assignment_count: 2,
      effective_assignment_count: null,
      composition_coverage: "partial",
    });
    const byRole = Object.fromEntries((await userAssignments(users.eli)).map((a) => [a.role_id, a]));
    expect(byRole[roles["gov-user-read"]]).toMatchObject({ composition_visibility: "available", effective: true });
    expect(byRole[roles.quality_viewer]).toMatchObject({ composition_visibility: "restricted", effective: null });
    await login(users.admin);
    expect((await userSummary(users.eli))[0]).toMatchObject({
      composition_coverage: "complete",
      effective_assignment_count: 2,
    });
  });
  it("lists role holders once per person despite overlapping assignments", async () => {
    await login(users.reviewer);
    expect((await roleSummary(roles.quality))[0]).toMatchObject({
      impact_kind: "potential",
      overlap_evaluated: false,
      role_key: "quality",
      composition_visibility: "available",
      active_permission_count: 11,
      inactive_permission_count: 0,
      role_grants_capabilities: true,
      holders_visibility: "available",
      holder_count: 1,
      potentially_affected_user_count: 1,
      currently_effective_user_count: 1,
      // Bruno also holds Quality Viewer: some capabilities may survive a change, which this
      // potential-impact summary flags but does not evaluate per permission.
      holders_with_other_roles_count: 1,
      active_assignment_count: 2,
      revoked_assignment_count: 2,
    });
    const holders = await roleHolders(roles.quality);
    expect(holders.map((a) => [a.user_id, a.scope_type])).toEqual([
      [users.bruno, "global"],
      [users.bruno, "unit"],
    ]);
    expect(holders[0]).toMatchObject({ total_count: 2, people_count: 1, effective: true });
    const all = await roleHolders(roles.quality, true);
    expect(all.map((a) => a.user_id)).toEqual([users.bruno, users.bruno, users.carla, users.leaver]);
    expect(all[0]).toMatchObject({ total_count: 4, people_count: 3 });
    // Unit names are readable through admin.unit.read; sector names are not.
    expect(holders[1]).toMatchObject({ unit_code: "A", unit_label_source: "current" });
  });
  it("gives a role-only admin composition but no holders, people or counts", async () => {
    await login(users.roleOnly);
    const [summary] = await roleSummary(roles.quality);
    expect(summary).toMatchObject({
      composition_visibility: "available",
      active_permission_count: 11,
      role_grants_capabilities: true,
      holders_visibility: "restricted",
      holder_count: null,
      inactive_user_holder_count: null,
      potentially_affected_user_count: null,
      currently_effective_user_count: null,
      holders_with_other_roles_count: null,
      active_assignment_count: null,
      revoked_assignment_count: null,
    });
    await nothingVisible(users.bruno);
    expect(await unitSummary(A)).toEqual([]);
  });
  it("gives a unit-only admin the unit but never people or access counts", async () => {
    await login(users.unitOnly);
    expect((await unitSummary(A))[0]).toMatchObject({
      unit_code: "A",
      people_visibility: "restricted",
      people_count: null,
      effective_people_count: null,
      global_assignment_count: null,
      unit_assignment_count: null,
      sector_assignment_count: null,
    });
    // Another unit answers exactly like a guessed ID.
    expect(await unitSummary(B)).toEqual([]);
    expect(await unitSummary(GUESS)).toEqual([]);
    await nothingVisible(users.bruno);
    expect(await roleSummary(roles.quality)).toEqual([]);
  });
  it("does not treat an active assignment without effective permission as usable access", async () => {
    await login(users.admin);
    expect((await userAssignments(users.fabio))[0]).toMatchObject({
      assignment_active: true,
      role_active: true,
      composition_visibility: "available",
      effective: false,
      active_permission_keys: [],
    });
    expect((await userSummary(users.fabio))[0]).toMatchObject({
      active_assignment_count: 1,
      effective_assignment_count: 0,
      composition_coverage: "complete",
    });
    expect((await roleSummary(roles.hollow))[0]).toMatchObject({
      role_active: true,
      active_permission_count: 0,
      role_grants_capabilities: false,
      holder_count: 1,
      potentially_affected_user_count: 1,
      currently_effective_user_count: 0,
      holders_with_other_roles_count: 0,
    });
    // People counts follow assignments; the effective figure is unknown without composition access.
    await login(users.unitReviewer);
    const [unit] = await unitSummary(A);
    expect(unit).toMatchObject({ people_visibility: "available", effective_people_count: null });
    expect(unit.people_count).toBeGreaterThan(0);
  });
  it("covers a unit with global, unit and only matching sector assignments", async () => {
    await login(users.admin);
    const brunoIn = async (unit: string, sector: string | null = null) =>
      (await unitAssignments(unit, sector)).filter((a) => a.user_id === users.bruno).map((a) => a.scope_type);
    expect(await brunoIn(A)).toEqual(["global", "unit", "sector"]);
    expect(await brunoIn(A, S)).toEqual(["global", "unit", "sector"]);
    expect(await brunoIn(A, T)).toEqual(["global", "unit"]);
    expect(await brunoIn(B)).toEqual(["global"]);
    // A sector not linked to the unit is not a valid filter.
    expect(await unitAssignments(B, T)).toEqual([]);
    expect(await unitSummary(B, T)).toEqual([]);
    const list = await unitAssignments(A);
    const people = new Set(list.map((a) => a.user_id));
    expect(list.every((a) => a.total_count === list.length)).toBe(true);
    expect(list[0].people_count).toBe(people.size);
    // Dora (inactive role) is still listed in A; Carla (B only) and the revoked are not.
    // Unit grants in A: Bruno (quality), Dora (legacy), Fabio (hollow) and the unit-only admin.
    expect(people.has(users.dora)).toBe(true);
    expect(people.has(users.carla)).toBe(false);
    expect(people.has(users.leaver)).toBe(false);
    expect((await unitAssignments(A, null, true)).some((a) => a.user_id === users.leaver)).toBe(true);
    expect((await unitSummary(A))[0]).toMatchObject({
      people_visibility: "available",
      people_count: people.size,
      // Dora (inactive role) and Fabio (no permission) hold assignments but no usable access.
      effective_people_count: people.size - 2,
      unit_assignment_count: 4,
      sector_assignment_count: 1,
      global_assignment_count: list.filter((a) => a.scope_type === "global").length,
    });
    expect((await unitSummary(A, T))[0]).toMatchObject({ sector_id: T, sector_assignment_count: 0 });
  });
  it("lets a read-only reviewer review a readable unit without sector catalog access", async () => {
    await login(users.reviewer);
    const list = await unitAssignments(A);
    const sector = list.find((a) => a.user_id === users.bruno && a.scope_type === "sector")!;
    expect(sector).toMatchObject({ unit_label_source: "current", sector_code: null, sector_label_source: "restricted" });
    expect((await unitSummary(A))[0]).toMatchObject({ people_visibility: "available" });
    // Without unit-sector visibility the sector filter is refused instead of guessed.
    expect(await unitAssignments(A, S)).toEqual([]);
  });
  it("does not enumerate hidden data through guessed IDs", async () => {
    for (const caller of [users.admin, users.reviewer, users.userRead]) {
      await login(caller);
      expect(await userSummary(GUESS)).toEqual([]);
      expect(await userAssignments(GUESS, true)).toEqual([]);
      expect(await unitSummary(GUESS)).toEqual([]);
      expect(await unitAssignments(GUESS, null, true)).toEqual([]);
      expect(await unitAssignments(A, GUESS, true)).toEqual([]);
      expect(await roleSummary(GUESS)).toEqual([]);
      expect(await roleHolders(GUESS, true)).toEqual([]);
    }
  });
  it("paginates deterministically with bounded pages and stable totals", async () => {
    await login(users.admin);
    const full = await unitAssignments(A, null, true);
    expect(full.length).toBeGreaterThan(3);
    const paged: Assignment[] = [];
    for (let offset = 0; offset < full.length; offset += 2) paged.push(...(await unitAssignments(A, null, true, 2, offset)));
    expect(paged.map((a) => a.assignment_id)).toEqual(full.map((a) => a.assignment_id));
    expect(new Set(paged.map((a) => a.total_count))).toEqual(new Set([full.length]));
    expect(await unitAssignments(A, null, true, 2, full.length)).toEqual([]);
    for (const [limit, offset] of [
      [0, 0],
      [101, 0],
      [25, -1],
    ]) {
      await expect(unitAssignments(A, null, false, limit, offset)).rejects.toThrow(/Invalid page/);
      await expect(userAssignments(users.bruno, false, limit, offset)).rejects.toThrow(/Invalid page/);
      await expect(roleHolders(roles.quality, false, limit, offset)).rejects.toThrow(/Invalid page/);
    }
  });
  it("is read-only and uses the revocation lookup index", async () => {
    await db.exec("reset role");
    const count = async () =>
      (await rows<{ n: string }>("select count(*) as n from core.system_audit_log"))[0].n;
    const before = await count();
    await login(users.admin);
    await userAssignments(users.carla, true);
    await roleHolders(roles.quality, true);
    await roleSummary(roles.quality);
    await userSummary(users.bruno);
    await unitSummary(A);
    await unitAssignments(A, null, true);
    await db.exec("reset role");
    expect(await count()).toBe(before);
    for (const name of [
      "user_access_summary",
      "user_access_assignments",
      "unit_access_summary",
      "unit_access_assignments",
      "role_impact_summary",
      "role_holders",
    ]) {
      const [f] = await rows<{ prosecdef: boolean; provolatile: string; proconfig: string[] }>(
        "select prosecdef,provolatile,proconfig from pg_proc where proname=$1 and pronamespace='core'::regnamespace",
        [name],
      );
      expect(f).toMatchObject({ prosecdef: false, provolatile: "s", proconfig: ['search_path=""'] });
    }
    await db.exec("set enable_seqscan=off");
    const plan = (
      await rows<{ "QUERY PLAN": string }>(
        "explain select id from core.system_audit_log where entity_type='user_role_assignments' and action='revoke' and entity_id=$1 order by occurred_at,id limit 1",
        [GUESS],
      )
    )
      .map((r) => r["QUERY PLAN"])
      .join("\n");
    await db.exec("reset enable_seqscan");
    expect(plan).toContain("audit_log_assignment_revoke");
  });
});
