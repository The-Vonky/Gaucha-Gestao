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
  empty: uid(5),
  inactive: uid(6),
  reader: uid(7),
  creator: uid(8),
  editor: uid(9),
  finalizer: uid(10),
  reopener: uid(11),
};
const A = "10000000-0000-0000-0000-000000000001";
const B = "10000000-0000-0000-0000-000000000002";
const C = "10000000-0000-0000-0000-000000000003";
const S = "20000000-0000-0000-0000-000000000001";
async function login(id: string, role = "authenticated") {
  await db.exec(
    `reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function one<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows[0];
}
async function rows(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows;
}
async function create(unit: string) {
  return (
    await one<{ id: string }>(
      "select audit.create_inspection($1,current_date,null) as id",
      [unit],
    )
  ).id;
}
async function inspection(id: string) {
  return one<{
    status: string;
    version: number;
    final_score: string | null;
    final_classification: string | null;
  }>("select * from audit.inspections where id=$1", [id]);
}
beforeAll(async () => {
  db = process.env.AUDIT_TEST_DATABASE_URL
    ? (new Postgres(process.env.AUDIT_TEST_DATABASE_URL) as unknown as PGlite)
    : new PGlite();
  // Minimal Supabase Auth contract; real PostgreSQL roles, grants, triggers and RLS.
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
 create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(STORAGE_STUB);
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  const values = Object.values(users)
    .map((id) => `('${id}','${id}@example.test',now())`)
    .join(",");
  const role = (key: string, permissions: string[]) =>
    `insert into core.roles(key,name) values ('${key}','${key}'); insert into core.role_permissions select id,p from core.roles cross join unnest(array['${permissions.join("','")}']) p where key='${key}';`;
  const assign = (
    user: string,
    key: string,
    scope = "unit",
    unit: string | null = A,
    sector: string | null = null,
  ) =>
    `insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select '${user}',id,'${scope}',${unit ? `'${unit}'` : "null"},${sector ? `'${sector}'` : "null"} from core.roles where key='${key}';`;
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ${values};
 select private.bootstrap_administrator('${users.admin}');
 insert into core.units(id,code,name) values ('${A}','A','Unit A'),('${B}','B','Unit B'),('${C}','C','Unit C');
 insert into core.sectors(id,code,name) values ('${S}','S','Sector S');
 insert into core.unit_sectors values ('${A}','${S}');
 ${role("audit-reader", ["audit.inspection.read"])}
 ${role("audit-creator", ["audit.inspection.read", "audit.inspection.create"])}
 ${role("audit-editor", ["audit.inspection.read", "audit.inspection.edit"])}
 ${role("audit-finalizer", ["audit.inspection.read", "audit.inspection.finalize"])}
 ${role("audit-reopener", ["audit.inspection.read", "audit.inspection.reopen"])}
 ${assign(users.global, "quality", "global", null)}
 ${assign(users.unitA, "quality")}
 ${assign(users.sector, "quality", "sector", A, S)}
 ${assign(users.inactive, "quality", "global", null)}
 ${assign(users.reader, "audit-reader")}
 ${assign(users.creator, "audit-creator")}
 ${assign(users.editor, "audit-editor")}
 ${assign(users.finalizer, "audit-finalizer")}
 ${assign(users.reopener, "audit-reopener")}
 update core.units set active=false where id='${C}';
 update core.profiles set active=false where id='${users.inactive}';`);
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe.sequential("Audit checklist evidence contract", () => {
 it("owns criterion evidence and removes the old finalization bypass", async () => {
  await db.exec("reset role");
  const r = await one<{ evidence: string | null; old: string | null; current: string | null }>(
   "select to_regclass('audit.checklist_evidence')::text evidence, to_regprocedure('audit.finalize_inspection(uuid,integer)')::text old, to_regprocedure('audit.finalize_inspection(uuid,integer,uuid[])')::text current");
  expect(r.evidence).toBe("audit.checklist_evidence");
  expect(r.old).toBeNull();
  expect(r.current).not.toBeNull();
 });
});
