import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { STORAGE_STUB } from "./storage-stub";
let db: PGlite;
const ids = {
  admin: "00000000-0000-0000-0000-000000000001",
  user: "00000000-0000-0000-0000-000000000002",
  empty: "00000000-0000-0000-0000-000000000003",
  inactive: "00000000-0000-0000-0000-000000000004",
  a: "10000000-0000-0000-0000-000000000001",
  b: "10000000-0000-0000-0000-000000000002",
  s: "20000000-0000-0000-0000-000000000001",
  t: "20000000-0000-0000-0000-000000000002",
};
async function login(id: string, role = "authenticated") {
  await db.exec(
    `reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function check(
  p: string,
  u: string | null = null,
  s: string | null = null,
) {
  return (
    await db.query<{ ok: boolean }>(
      "select private.has_scoped_permission($1,$2,$3) as ok",
      [p, u, s],
    )
  ).rows[0].ok;
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
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${ids.admin}','admin@example.test',now()),('${ids.user}','user@example.test',now()),('${ids.empty}','empty@example.test',now()),('${ids.inactive}','inactive@example.test',now()); select private.bootstrap_administrator('${ids.admin}');
 insert into core.units(id,code,name) values ('${ids.a}','A','Unit A'),('${ids.b}','B','Unit B');
 insert into core.sectors(id,code,name) values ('${ids.s}','S','Sector S'),('${ids.t}','T','Sector T');
 insert into core.unit_sectors values ('${ids.a}','${ids.s}'),('${ids.b}','${ids.s}'),('${ids.a}','${ids.t}');
 insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select '${ids.user}',id,'sector','${ids.a}','${ids.s}' from core.roles where key='quality_viewer';
 insert into core.user_role_assignments(user_id,role_id,scope_type) select '${ids.inactive}',id,'global' from core.roles where key='quality';
 update core.profiles set active=false where id='${ids.inactive}';`);
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("PostgreSQL Core migration and RLS", () => {
  it("creates exactly the Core tables with RLS enabled", async () => {
    await db.exec("reset role");
    const r = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='core' and c.relkind='r'",
    );
    expect(r.rows).toHaveLength(9);
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
  });
  it("denies anonymous access to every exposed table", async () => {
    await login("", "anon");
    for (const table of [
      "profiles",
      "units",
      "sectors",
      "unit_sectors",
      "permissions",
      "roles",
      "role_permissions",
      "user_role_assignments",
      "system_audit_log",
    ])
      await expect(db.query(`select * from core.${table}`)).rejects.toThrow();
  });
  it("denies inactive users even with existing sessions", async () => {
    await login(ids.inactive);
    expect(await check("audit.inspection.read", ids.a)).toBe(false);
    expect((await db.query("select * from core.profiles")).rows).toEqual([]);
    expect((await db.query("select * from core.my_access()")).rows).toEqual([]);
  });
  it("denies business and administrative access without assignments", async () => {
    await login(ids.empty);
    expect(await check("audit.inspection.read")).toBe(false);
    for (const table of [
      "units",
      "sectors",
      "unit_sectors",
      "permissions",
      "roles",
      "role_permissions",
      "user_role_assignments",
      "system_audit_log",
    ])
      expect((await db.query(`select * from core.${table}`)).rows).toEqual([]);
  });
  it("matches sector and unit together; rejects unit-wide and unrelated-domain access", async () => {
    await login(ids.user);
    expect(await check("audit.inspection.read", ids.a, ids.s)).toBe(true);
    expect(await check("audit.inspection.read", ids.a)).toBe(false);
    expect(await check("audit.inspection.read", ids.b, ids.s)).toBe(false);
    expect(await check("audit.inspection.read", ids.a, ids.t)).toBe(false);
    expect(await check("action_plan.write", ids.a, ids.s)).toBe(false);
  });
  it("allows global grants on all scopes", async () => {
    await login(ids.admin);
    expect(await check("admin.user.manage")).toBe(true);
    expect(await check("audit.inspection.read", ids.b, ids.s)).toBe(true);
  });
  it("requires admin permission for mutations and blocks guessed IDs", async () => {
    await login(ids.user);
    await expect(
      db.query("insert into core.units(code,name) values ('NO','Denied')"),
    ).rejects.toThrow();
    expect(
      (
        await db.query(
          "update core.units set name=$1 where id=$2 returning id",
          ["Hacked", ids.b],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (await db.query("select * from core.units where id=$1", [ids.b])).rows,
    ).toEqual([]);
    expect(
      (
        await db.query(
          "update core.profiles set active=false where id=$1 returning id",
          [ids.admin],
        )
      ).rows,
    ).toEqual([]);
  });
  it("forbids normal client insert/update/delete of audit rows", async () => {
    for (const id of [ids.user, ids.admin]) {
      await login(id);
      for (const sql of [
        "insert into core.system_audit_log(module,action,entity_type,entity_id) values ('core','fake','units','x')",
        "update core.system_audit_log set action='fake'",
        "delete from core.system_audit_log",
      ])
        await expect(db.query(sql)).rejects.toThrow();
    }
  });
  it("protects seeded roles and bootstrap from authenticated callers", async () => {
    await login(ids.admin);
    expect(
      (
        await db.query(
          "update core.roles set name='Hacked' where system returning id",
        )
      ).rows,
    ).toEqual([]);
    await expect(
      db.query("select private.bootstrap_administrator($1)", [ids.user]),
    ).rejects.toThrow();
    await db.exec("reset role");
    await expect(
      db.query("select private.bootstrap_administrator($1)", [ids.user]),
    ).rejects.toThrow();
  });
  it("composes independent scopes without leaking across assignments", async () => {
    await db.exec("reset role");
    await db.exec(
      `insert into core.roles(key,name) values ('unit-reader','Unit reader'); insert into core.role_permissions select id,'admin.unit.read' from core.roles where key='unit-reader'; insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id) select '${ids.user}',id,'unit','${ids.b}' from core.roles where key='unit-reader';`,
    );
    await login(ids.user);
    expect(await check("admin.unit.read", ids.b)).toBe(true);
    expect(await check("admin.unit.read", ids.a)).toBe(false);
    expect(await check("audit.inspection.read", ids.b, ids.s)).toBe(false);
    expect(
      (await db.query<{ id: string }>("select id from core.units")).rows.map(
        (x) => x.id,
      ),
    ).toEqual([ids.b]);
  });
  it("audits updates and rejects stale optimistic writes", async () => {
    await login(ids.admin);
    const original = (
      await db.query<{ version: number }>(
        "select version from core.units where id=$1",
        [ids.a],
      )
    ).rows[0];
    expect(
      (
        await db.query(
          "update core.units set name=$1 where id=$2 and version=$3 returning id",
          ["Renamed", ids.a, original.version],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "update core.units set name=$1 where id=$2 and version=$3 returning id",
          ["Stale", ids.a, original.version],
        )
      ).rows,
    ).toHaveLength(0);
    const logs = (
      await db.query<{
        actor_user_id: string;
        before_data: { name: string };
        after_data: { name: string };
      }>(
        "select * from core.system_audit_log where entity_id=$1 and action='update'",
        [ids.a],
      )
    ).rows;
    expect(logs.at(-1)?.actor_user_id).toBe(ids.admin);
    expect(logs.at(-1)?.before_data.name).toBe("Unit A");
    expect(logs.at(-1)?.after_data.name).toBe("Renamed");
  });
  it("rejects invalid assignment shapes and inactive or globally restricted targets", async () => {
    await login(ids.admin);
    for (const [scope, u, s] of [
      ["global", ids.a, null],
      ["unit", null, null],
      ["sector", ids.b, ids.t],
      ["unit", ids.a, null],
    ]) {
      const roleKey =
        scope === "unit" && u === ids.a ? "platform_administrator" : "quality";
      await expect(
        db.query(
          "insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select $1,id,$2,$3,$4 from core.roles where key=$5",
          [ids.user, scope, u, s, roleKey],
        ),
      ).rejects.toThrow();
    }
    await expect(
      db.query(
        "insert into core.user_role_assignments(user_id,role_id,scope_type) select $1,id,'global' from core.roles where key='quality'",
        [ids.inactive],
      ),
    ).rejects.toThrow();
  });
  it("prevents permission escalation through role editing and assignment grants", async () => {
    await db.exec("reset role");
    await db.exec(
      `insert into core.roles(key,name) values ('limited-manager','Limited manager'); insert into core.role_permissions select id,p from core.roles cross join unnest(array['admin.role.manage','admin.user.manage']) p where key='limited-manager'; insert into core.user_role_assignments(user_id,role_id,scope_type) select '${ids.empty}',id,'global' from core.roles where key='limited-manager';`,
    );
    await login(ids.empty);
    await expect(
      db.query(
        "select core.save_role(null,null,'escalation','Escalation','',array['audit.inspection.read'])",
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into core.user_role_assignments(user_id,role_id,scope_type) select $1,id,'global' from core.roles where key='platform_administrator'",
        [ids.user],
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into core.role_permissions select id,'audit.inspection.read' from core.roles where key='limited-manager'",
      ),
    ).rejects.toThrow();
    const { rows } = await db.query<{ id: string }>(
      "select core.save_role(null,null,'allowed-role','Allowed','',array['admin.user.manage']) as id",
    );
    expect(rows[0].id).toBeTruthy();
  });
  it("requires revocation authority to change another user's active state", async () => {
    await login(ids.empty);
    const setActive = async (id: string, active: boolean) =>
      (
        await db.query(
          "update core.profiles set active=$1 where id=$2 returning id",
          [active, id],
        )
      ).rows;
    // Limited manager cannot hold the permissions assigned to these users.
    expect(await setActive(ids.admin, false)).toEqual([]);
    expect(await setActive(ids.user, false)).toEqual([]);
    // A user without active assignments can be managed.
    expect(await setActive(ids.inactive, true)).toHaveLength(1);
    expect(await setActive(ids.inactive, false)).toHaveLength(1);
    await login(ids.admin);
    expect(await check("admin.user.manage")).toBe(true);
  });
  it("keeps assignments of a deactivated role revocable", async () => {
    await db.exec("reset role");
    await db.exec(
      `insert into core.roles(key,name) values ('retired','Retired'); insert into core.role_permissions select id,'action_plan.read' from core.roles where key='retired'; insert into core.user_role_assignments(user_id,role_id,scope_type) select '${ids.user}',id,'global' from core.roles where key='retired'; update core.roles set active=false where key='retired';`,
    );
    await login(ids.admin);
    expect(
      (
        await db.query(
          "update core.user_role_assignments set active=false where role_id=(select id from core.roles where key='retired') returning id",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("atomically saves role composition and rejects stale edits or protected roles", async () => {
    await login(ids.admin);
    const id = (
      await db.query<{ id: string }>(
        "select core.save_role(null,null,'atomic-role','Atomic','',array['audit.inspection.read']) as id",
      )
    ).rows[0].id;
    await db.query(
      "select core.save_role($1,1,'atomic-role','Changed','',array['action_plan.read'])",
      [id],
    );
    await expect(
      db.query(
        "select core.save_role($1,1,'atomic-role','Stale','',array['audit.inspection.read'])",
        [id],
      ),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ permission_key: string }>(
          "select permission_key from core.role_permissions where role_id=$1",
          [id],
        )
      ).rows.map((x) => x.permission_key),
    ).toEqual(["action_plan.read"]);
    await expect(
      db.query(
        "select core.save_role(id,version,key,'Hacked','',array[]::text[]) from core.roles where key='platform_administrator'",
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "select core.save_role($1,2,'atomic-role','Partial','',array['missing.permission'])",
        [id],
      ),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ name: string }>(
          "select name from core.roles where id=$1",
          [id],
        )
      ).rows[0].name,
    ).toBe("Changed");
  });
  it("revokes assignments on deactivation and does not restore on reactivation", async () => {
    await login(ids.admin);
    await db.query("update core.profiles set active=false where id=$1", [
      ids.empty,
    ]);
    await login(ids.empty);
    expect(await check("admin.user.manage")).toBe(false);
    expect((await db.query("select * from core.my_access()")).rows).toEqual([]);
    await login(ids.admin);
    await db.query("update core.profiles set active=true where id=$1", [
      ids.empty,
    ]);
    await login(ids.empty);
    expect(await check("admin.user.manage")).toBe(false);
  });
  it("denies writes to each Core table for an unassigned authenticated user", async () => {
    await login(ids.empty);
    const inserts = [
      "insert into core.profiles(id,display_name) values (gen_random_uuid(),'X')",
      "insert into core.units(code,name) values ('DENY','X')",
      "insert into core.sectors(code,name) values ('DENY','X')",
      "insert into core.unit_sectors select id,gen_random_uuid() from core.units",
      "insert into core.permissions(key,domain,resource,action,description) values ('x','x','x','x','x')",
      "insert into core.roles(key,name) values ('deny','X')",
      "insert into core.role_permissions(role_id,permission_key) values (gen_random_uuid(),'admin.user.manage')",
      "insert into core.user_role_assignments(user_id,role_id,scope_type) values (gen_random_uuid(),gen_random_uuid(),'global')",
      "insert into core.system_audit_log(module,action,entity_type,entity_id) values ('x','x','x','x')",
    ];
    // Explicit values ensure an attempted insert, even when the caller cannot select the source row.
    inserts[3] = `insert into core.unit_sectors(unit_id,sector_id) values ('${ids.b}','${ids.t}')`;
    for (const sql of inserts) await expect(db.query(sql)).rejects.toThrow();
    for (const table of [
      "profiles",
      "units",
      "sectors",
      "roles",
      "permissions",
      "role_permissions",
      "user_role_assignments",
      "system_audit_log",
    ])
      await expect(db.query(`delete from core.${table}`)).rejects.toThrow();
    expect(
      (await db.query("delete from core.unit_sectors returning *")).rows,
    ).toEqual([]);
  });
  it("denies inactive unit-sector association at the database boundary", async () => {
    await login(ids.admin);
    await db.query("update core.sectors set active=false where id=$1", [ids.t]);
    await expect(
      db.query(
        "insert into core.unit_sectors(unit_id,sector_id) values ($1,$2)",
        [ids.b, ids.t],
      ),
    ).rejects.toThrow();
    await db.query("update core.sectors set active=true where id=$1", [ids.t]);
  });
  it("lets a read-only sector administrator inspect related unit names", async () => {
    await db.exec("reset role");
    await db.exec(
      `insert into core.roles(key,name) values ('sector-reader','Sector reader'); insert into core.role_permissions select id,'admin.sector.read' from core.roles where key='sector-reader'; insert into core.user_role_assignments(user_id,role_id,scope_type) select '${ids.empty}',id,'global' from core.roles where key='sector-reader';`,
    );
    await login(ids.empty);
    expect((await db.query("select id from core.units")).rows).toHaveLength(2);
    expect(
      (await db.query("select * from core.unit_sectors")).rows,
    ).toHaveLength(3);
  });
  it("grants execute only to intended roles, never PUBLIC", async () => {
    await db.exec("reset role");
    const functions = (
      await db.query<{ signature: string; proname: string }>(
        "select p.oid::regprocedure::text as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('core','private')",
      )
    ).rows;
    for (const f of functions) {
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select has_function_privilege('anon',$1,'execute') as allowed",
            [f.signature],
          )
        ).rows[0].allowed,
      ).toBe(false);
      if (
        [
          "record_change",
          "touch_row",
          "create_profile",
          "validate_assignment",
          "validate_unit_sector",
          "revoke_deactivated_user",
          "bootstrap_administrator",
        ].includes(f.proname)
      )
        expect(
          (
            await db.query<{ allowed: boolean }>(
              "select has_function_privilege('authenticated',$1,'execute') as allowed",
              [f.signature],
            )
          ).rows[0].allowed,
        ).toBe(false);
    }
  });
  it("returns role version and complete composition in one database snapshot", async () => {
    await login(ids.admin);
    const id = (
      await db.query<{ id: string }>(
        "select id from core.roles where key='platform_administrator'",
      )
    ).rows[0].id;
    const detail = (
      await db.query<{ role: { version: number }; permission_keys: string[] }>(
        "select * from core.role_detail($1)",
        [id],
      )
    ).rows[0];
    expect(detail.role.version).toBe(1);
    expect(detail.permission_keys).toHaveLength(19);
    await login(ids.empty);
    expect(
      (await db.query("select * from core.role_detail($1)", [id])).rows,
    ).toEqual([]);
  });
});
