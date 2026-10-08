import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STORAGE_STUB } from "./storage-stub";

// Core Reference Resolvers v1: known-UUID label resolution, real roles/grants/RLS.
let db: PGlite;
const ids = {
  admin: "00000000-0000-0000-0000-000000000001",
  member: "00000000-0000-0000-0000-000000000002",
  unitMember: "00000000-0000-0000-0000-000000000003",
  empty: "00000000-0000-0000-0000-000000000004",
  inactive: "00000000-0000-0000-0000-000000000005",
  former: "00000000-0000-0000-0000-000000000006",
  userReader: "00000000-0000-0000-0000-000000000007",
  emptyRole: "00000000-0000-0000-0000-000000000008",
  inactiveRole: "00000000-0000-0000-0000-000000000009",
  inactivePermission: "00000000-0000-0000-0000-00000000000a",
  revokedOnly: "00000000-0000-0000-0000-00000000000b",
  a: "10000000-0000-0000-0000-000000000001",
  b: "10000000-0000-0000-0000-000000000002",
  c: "10000000-0000-0000-0000-000000000003",
  s: "20000000-0000-0000-0000-000000000001",
  t: "20000000-0000-0000-0000-000000000002",
  u: "20000000-0000-0000-0000-000000000003",
  unknown: "90000000-0000-0000-0000-000000000009",
};
async function login(id: string, role = "authenticated") {
  await db.exec(
    `reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
const arr = (xs: string[]) => `{${xs.join(",")}}`;
async function rows(fn: string, xs: string[]) {
  return (await db.query(`select * from core.${fn}($1::uuid[])`, [arr(xs)]))
    .rows;
}
async function pairs(units: string[], sectors: string[]) {
  return (
    await db.query(
      "select * from core.unit_sector_references($1::uuid[],$2::uuid[])",
      [arr(units), arr(sectors)],
    )
  ).rows;
}
const idsOf = (r: unknown[]) => r.map((x) => (x as { id: string }).id);
const pairsOf = (r: unknown[]) =>
  r.map((x) => {
    const p = x as { unit_id: string; sector_id: string };
    return `${p.unit_id}/${p.sector_id}`;
  });
const allUnits = [ids.a, ids.b, ids.c, ids.unknown];
const allSectors = [ids.s, ids.t, ids.u, ids.unknown];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
 create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}', last_sign_in_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(STORAGE_STUB);
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  const users = [
    ids.admin,
    ids.member,
    ids.unitMember,
    ids.empty,
    ids.inactive,
    ids.former,
    ids.userReader,
    ids.emptyRole,
    ids.inactiveRole,
    ids.inactivePermission,
    ids.revokedOnly,
  ]
    .map((id) => `('${id}','${id}@example.test',now(),now())`)
    .join(",");
  await db.exec(`insert into auth.users(id,email,email_confirmed_at,last_sign_in_at) values ${users};
 select private.bootstrap_administrator('${ids.admin}');
 insert into core.units(id,code,name) values ('${ids.a}','A','Unit A'),('${ids.b}','B','Unit B'),('${ids.c}','C','Unit C');
 insert into core.sectors(id,code,name) values ('${ids.s}','S','Sector S'),('${ids.t}','T','Sector T'),('${ids.u}','U','Sector U');
 insert into core.unit_sectors values ('${ids.a}','${ids.s}'),('${ids.b}','${ids.s}'),('${ids.a}','${ids.t}'),('${ids.b}','${ids.u}'),('${ids.c}','${ids.t}');
 insert into core.roles(key,name) values ('plan_reader','Plan reader'),('user_reader','User reader');
 insert into core.role_permissions select id,'action_plan.read' from core.roles where key='plan_reader';
 insert into core.role_permissions select id,'admin.user.read' from core.roles where key='user_reader';
 insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select '${ids.member}',id,'sector','${ids.a}','${ids.s}' from core.roles where key='quality_viewer';
 insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id) select '${ids.unitMember}',id,'unit','${ids.b}' from core.roles where key='plan_reader';
 insert into core.user_role_assignments(user_id,role_id,scope_type) select '${ids.userReader}',id,'global' from core.roles where key='user_reader';
 insert into core.user_role_assignments(user_id,role_id,scope_type) select '${ids.inactive}',id,'global' from core.roles where key='quality';
 insert into core.permissions(key,domain,resource,action,description,active) values ('fixture.reference.read','fixture','reference','read','Inactive fixture',false);
 insert into core.roles(key,name) values ('no_permissions','No permissions'),('retired_role','Retired role'),('inactive_permission','Inactive permission');
 insert into core.role_permissions select id,'action_plan.read' from core.roles where key='retired_role';
 insert into core.role_permissions select id,'fixture.reference.read' from core.roles where key='inactive_permission';
 insert into core.user_role_assignments(user_id,role_id,scope_type) select '${ids.emptyRole}',id,'global' from core.roles where key='no_permissions';
 insert into core.user_role_assignments(user_id,role_id,scope_type) select '${ids.inactiveRole}',id,'global' from core.roles where key='retired_role';
 insert into core.user_role_assignments(user_id,role_id,scope_type) select '${ids.inactivePermission}',id,'global' from core.roles where key='inactive_permission';
 insert into core.user_role_assignments(user_id,role_id,scope_type) select '${ids.revokedOnly}',id,'global' from core.roles where key='quality';
 update core.user_role_assignments set active=false where user_id='${ids.revokedOnly}';
 update core.roles set active=false where key='retired_role';
 update core.profiles set active=false where id in ('${ids.inactive}','${ids.former}');
 update core.units set active=false where id='${ids.c}';
 update core.sectors set active=false where id='${ids.u}';`);
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe.sequential("Core reference resolvers", () => {
  it("denies anonymous callers every resolver", async () => {
    await login("", "anon");
    for (const fn of [
      "profile_references",
      "unit_references",
      "sector_references",
    ])
      await expect(rows(fn, [ids.a])).rejects.toThrow(/permission denied/);
    await expect(pairs([ids.a], [ids.s])).rejects.toThrow(/permission denied/);
  });

  it("denies inactive callers, even for their own profile", async () => {
    await login(ids.inactive);
    await expect(rows("profile_references", [ids.inactive])).rejects.toThrow(
      "Forbidden",
    );
    for (const fn of ["unit_references", "sector_references"])
      await expect(rows(fn, [ids.a])).rejects.toThrow("Forbidden");
    await expect(pairs([ids.a], [ids.s])).rejects.toThrow("Forbidden");
  });

  it("returns only the caller's own profile to business users", async () => {
    await login(ids.member);
    expect(
      await rows("profile_references", [
        ids.admin,
        ids.member,
        ids.former,
        ids.unknown,
      ]),
    ).toEqual([{ id: ids.member, display_name: "Novo usuário", active: true }]);
    await login(ids.empty);
    expect(
      idsOf(await rows("profile_references", [ids.admin, ids.empty])),
    ).toEqual([ids.empty]);
  });

  it("resolves any profile, inactive included, for global user readers", async () => {
    await login(ids.userReader);
    expect(
      await rows("profile_references", [ids.former, ids.admin, ids.unknown]),
    ).toEqual([
      { id: ids.admin, display_name: "Novo usuário", active: true },
      { id: ids.former, display_name: "Novo usuário", active: false },
    ]);
    // admin.user.read is a global scope: it also labels the organization.
    expect(idsOf(await rows("unit_references", allUnits))).toEqual([
      ids.a,
      ids.b,
      ids.c,
    ]);
  });

  it("gives a caller without effective scopes no organizational labels", async () => {
    await login(ids.empty);
    expect(await rows("unit_references", allUnits)).toEqual([]);
    expect(await rows("sector_references", allSectors)).toEqual([]);
    expect(await pairs([ids.a, ids.b], [ids.s, ids.s])).toEqual([]);
  });

  it("limits a sector grant to its own unit, sector and pair", async () => {
    await login(ids.member);
    expect(await rows("unit_references", allUnits)).toEqual([
      { id: ids.a, code: "A", name: "Unit A", active: true },
    ]);
    expect(idsOf(await rows("sector_references", allSectors))).toEqual([ids.s]);
    expect(
      pairsOf(
        await pairs([ids.a, ids.b, ids.a, ids.c], [ids.s, ids.s, ids.t, ids.t]),
      ),
    ).toEqual([`${ids.a}/${ids.s}`]);
  });

  it("covers the sectors linked to a unit grant and reports inactive ones", async () => {
    await login(ids.unitMember);
    expect(idsOf(await rows("unit_references", allUnits))).toEqual([ids.b]);
    expect(await rows("sector_references", allSectors)).toEqual([
      { id: ids.s, code: "S", name: "Sector S", active: true },
      { id: ids.u, code: "U", name: "Sector U", active: false },
    ]);
    expect(
      await pairs([ids.b, ids.b, ids.a, ids.b], [ids.u, ids.s, ids.s, ids.t]),
    ).toEqual([
      {
        unit_id: ids.b,
        sector_id: ids.s,
        unit_active: true,
        sector_active: true,
      },
      {
        unit_id: ids.b,
        sector_id: ids.u,
        unit_active: true,
        sector_active: false,
      },
    ]);
  });

  it("resolves nothing through assignments without a current effective grant", async () => {
    // Global assignments only, so any leak would cover every target.
    for (const id of [
      ids.emptyRole,
      ids.inactiveRole,
      ids.inactivePermission,
      ids.revokedOnly,
    ]) {
      await login(id);
      expect(await rows("unit_references", allUnits)).toEqual([]);
      expect(await rows("sector_references", allSectors)).toEqual([]);
      expect(await pairs([ids.a, ids.b, ids.c], [ids.s, ids.u, ids.t])).toEqual(
        [],
      );
      expect(
        idsOf(await rows("profile_references", [ids.admin, ids.former, id])),
      ).toEqual([id]);
    }
  });

  it("does not turn a resolved label into catalog or module access", async () => {
    // Unrelated permission (action_plan.read) in the same unit: label only.
    await login(ids.unitMember);
    expect(idsOf(await rows("unit_references", [ids.b]))).toEqual([ids.b]);
    expect(
      (
        await db.query<{ ok: boolean }>(
          "select private.has_scoped_permission('audit.inspection.read',$1) as ok",
          [ids.b],
        )
      ).rows[0].ok,
    ).toBe(false);
    expect((await db.query("select * from audit.units()")).rows).toEqual([]);
    expect(
      (
        await db.query("select * from core.unit_covers($1::uuid[])", [
          arr([ids.b]),
        ])
      ).rows,
    ).toEqual([]);
    for (const table of ["units", "sectors", "unit_sectors"])
      expect((await db.query(`select * from core.${table}`)).rows).toEqual([]);
    expect(idsOf((await db.query("select * from core.profiles")).rows)).toEqual(
      [ids.unitMember],
    );
    expect(
      (
        await db.query(
          "update core.units set name='Hacked' where id=$1 returning id",
          [ids.b],
        )
      ).rows,
    ).toEqual([]);
    // A global user reader labels the organization but still cannot read its catalogs.
    await login(ids.userReader);
    expect(idsOf(await rows("sector_references", allSectors))).toEqual([
      ids.s,
      ids.t,
      ids.u,
    ]);
    for (const table of ["units", "sectors", "unit_sectors"])
      expect((await db.query(`select * from core.${table}`)).rows).toEqual([]);
  });

  it("offers no listing: only the IDs asked for, never other users", async () => {
    await login(ids.member);
    expect(await rows("unit_references", [])).toEqual([]);
    const guesses = Array.from(
      { length: 90 },
      (_, i) => `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
    );
    expect(idsOf(await rows("profile_references", guesses))).toEqual([
      ids.member,
    ]);
    await login(ids.unitMember);
    expect(idsOf(await rows("unit_references", [ids.a, ids.c]))).toEqual([]);
  });

  it("keeps inactive organization resolvable for historical reading", async () => {
    await login(ids.admin);
    expect(await rows("unit_references", [ids.c])).toEqual([
      { id: ids.c, code: "C", name: "Unit C", active: false },
    ]);
    expect(await pairs([ids.c, ids.b], [ids.t, ids.t])).toEqual([
      {
        unit_id: ids.c,
        sector_id: ids.t,
        unit_active: false,
        sector_active: true,
      },
    ]);
  });

  it("answers guessed and invisible IDs identically and deterministically", async () => {
    await login(ids.member);
    expect(await rows("unit_references", [ids.unknown])).toEqual(
      await rows("unit_references", [ids.b]),
    );
    expect(await rows("profile_references", [ids.unknown])).toEqual(
      await rows("profile_references", [ids.admin]),
    );
    await login(ids.admin);
    const reversed = await rows("sector_references", [
      ids.u,
      ids.t,
      ids.s,
      ids.s,
      ids.u,
    ]);
    expect(idsOf(reversed)).toEqual([ids.s, ids.t, ids.u]);
  });

  it("enforces the batch limit and the input shape", async () => {
    await login(ids.admin);
    const many = (n: number) => Array.from({ length: n }, () => ids.a);
    expect(idsOf(await rows("unit_references", many(100)))).toEqual([ids.a]);
    expect(await rows("unit_references", [])).toEqual([]);
    for (const fn of [
      "profile_references",
      "unit_references",
      "sector_references",
    ]) {
      await expect(rows(fn, many(101))).rejects.toThrow("Between 0 and 100");
      await expect(db.query(`select * from core.${fn}(null)`)).rejects.toThrow(
        "Between 0 and 100",
      );
    }
    await expect(pairs(many(101), many(101))).rejects.toThrow(
      "Between 0 and 100",
    );
    await expect(pairs([ids.a, ids.b], [ids.s])).rejects.toThrow(
      "must be paired",
    );
    expect(
      idsOf(
        (
          await db.query(
            "select * from core.unit_references(array[null,$1]::uuid[])",
            [ids.b],
          )
        ).rows,
      ),
    ).toEqual([ids.b]);
  });

  it("exposes no e-mail, Auth, role or permission data", async () => {
    await db.exec("reset role");
    const cols = await db.query<{ name: string; cols: string[] }>(
      `select p.proname as name, p.proargnames[2:] as cols from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='core' and p.proname like '%references' order by 1`,
    );
    expect(cols.rows).toEqual([
      { name: "profile_references", cols: ["id", "display_name", "active"] },
      { name: "sector_references", cols: ["id", "code", "name", "active"] },
      { name: "unit_references", cols: ["id", "code", "name", "active"] },
      {
        name: "unit_sector_references",
        cols: [
          "p_sectors",
          "unit_id",
          "sector_id",
          "unit_active",
          "sector_active",
        ],
      },
    ]);
    await login(ids.admin);
    const out = JSON.stringify(
      await rows("profile_references", [ids.admin, ids.former, ids.member]),
    );
    expect(out).not.toMatch(/@|example\.test|sign_in|role|permission/);
  });

  it("grants least privilege with fixed search paths", async () => {
    await db.exec("reset role");
    const fns = await db.query<{
      fn: string;
      definer: boolean;
      config: string[];
      anon: boolean;
      member: boolean;
    }>(
      `select p.oid::regprocedure::text as fn, p.prosecdef as definer, p.proconfig as config,
        has_function_privilege('anon',p.oid,'execute') as anon,
        has_function_privilege('authenticated',p.oid,'execute') as member
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where (n.nspname='core' and p.proname like '%references') or (n.nspname='private' and (p.proname like 'can_resolve%' or p.proname='reference_batch'))
       order by 1`,
    );
    expect(fns.rows).toHaveLength(8);
    for (const f of fns.rows) {
      expect(f.config).toEqual(['search_path=""']);
      expect(f.anon).toBe(false);
      expect(f.member).toBe(f.fn.startsWith("core."));
      expect(f.definer).toBe(
        f.fn.startsWith("private.can_resolve") ||
          /^core\.(unit|sector|unit_sector)_references/.test(f.fn),
      );
    }
    expect(
      fns.rows.find((f) => f.fn.startsWith("core.profile_references"))?.definer,
    ).toBe(false);
    // Private predicates cannot be probed directly.
    await login(ids.member);
    for (const probe of [
      "select private.can_resolve_unit($1::uuid)",
      "select private.can_resolve_sector($1::uuid)",
      "select private.can_resolve_unit_sector($1::uuid,$1::uuid)",
      "select private.reference_batch(array[$1::uuid])",
    ])
      await expect(db.query(probe, [ids.b])).rejects.toThrow(
        /permission denied/,
      );
    // No table privilege, policy or RLS setting was added for the resolvers.
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select count(*)::int as n from pg_policies where schemaname='core' and (qual ~ 'resolve|reference' or with_check ~ 'resolve|reference')",
        )
      ).rows,
    ).toEqual([{ n: 0 }]);
  });

  it("stops resolving as soon as the grant that covered it is revoked", async () => {
    await db.exec(
      `reset role; update core.user_role_assignments set active=false where user_id='${ids.unitMember}'`,
    );
    await login(ids.unitMember);
    expect(await rows("unit_references", allUnits)).toEqual([]);
    expect(await rows("sector_references", allSectors)).toEqual([]);
    expect(idsOf(await rows("profile_references", [ids.unitMember]))).toEqual([
      ids.unitMember,
    ]);
  });
});
