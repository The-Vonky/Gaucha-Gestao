import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STORAGE_STUB } from "./storage-stub";
// Plans verified before 0008 must get a verification_round aligned with their audit trail,
// without touching version/updated_* (no spurious optimistic-concurrency conflicts).
let db: PGlite;
const user = "00000000-0000-0000-0000-000000000001";
const unit = "10000000-0000-0000-0000-000000000001";
const files = readdirSync("supabase/migrations").sort();
const evidence = files.filter((f) => f.includes("evidence"));
async function one<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows[0];
}
const as = (sql: string, params: unknown[] = []) =>
  db
    .exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`,
    )
    .then(() => db.query(sql, params))
    .finally(() => db.exec("reset role"));
async function completed() {
  const { id } = (
    await as("select action_plans.create_manual_plan($1,null,'Antigo') id", [
      unit,
    ])
  ).rows[0] as { id: string };
  await as(
    "select action_plans.update_plan($1,1,'Antigo','a','b','c','2026-10-01','d',null,null,'e')",
    [id],
  );
  await as("select action_plans.set_plan_status($1,2,'completed')", [id]);
  return id;
}
const verify = (id: string, version: number) =>
  as("select action_plans.verify_plan($1,$2,'effective','2026-09-20','ok')", [
    id,
    version,
  ]);
let once = "",
  thrice = "",
  unverified = "",
  noEvents = "";
let before: Record<string, { version: number; updated_at: string }> = {};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
 create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}', last_sign_in_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(STORAGE_STUB);
  for (const file of files.filter((f) => !evidence.includes(f)))
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${user}','u@example.test',now());
 select private.bootstrap_administrator('${user}');
 insert into core.units(id,code,name) values ('${unit}','A','Unit A');`);
  once = await completed();
  await verify(once, 3);
  thrice = await completed();
  await verify(thrice, 3);
  await verify(thrice, 4);
  await verify(thrice, 5);
  unverified = await completed();
  noEvents = await completed();
  await verify(noEvents, 3);
  await db.query(
    "delete from core.system_audit_log where entity_id=$1 and action in ('verify','re_verify')",
    [noEvents],
  );
  before = Object.fromEntries(
    (
      await db.query<{ id: string; version: number; updated_at: string }>(
        "select id,version,updated_at::text from action_plans.plans",
      )
    ).rows.map((r) => [r.id, { version: r.version, updated_at: r.updated_at }]),
  );
  for (const file of evidence)
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe("Evidence migration backfill", () => {
  it("sets verification_round from recorded verify/re_verify events", async () => {
    const round = async (id: string) =>
      (
        await one<{ verification_round: number }>(
          "select verification_round from action_plans.plans where id=$1",
          [id],
        )
      ).verification_round;
    expect(await round(once)).toBe(1);
    expect(await round(thrice)).toBe(3);
    expect(await round(unverified)).toBe(0);
    // A verified plan is never left at round 0, even without surviving events.
    expect(await round(noEvents)).toBe(1);
  });
  it("does not change version or updated_at of existing plans", async () => {
    const after = (
      await db.query<{ id: string; version: number; updated_at: string }>(
        "select id,version,updated_at::text from action_plans.plans",
      )
    ).rows;
    for (const r of after)
      expect({ version: r.version, updated_at: r.updated_at }).toEqual(
        before[r.id],
      );
  });
  it("continues the round sequence on the next re-verification", async () => {
    await as(
      "select action_plans.verify_plan($1,$2,'effective','2026-09-20','ok','{}')",
      [thrice, before[thrice].version],
    );
    expect(
      await one(
        "select verification_round,(select after_data->>'verification_round' from core.system_audit_log where entity_id=$1::text and action='re_verify' order by occurred_at desc limit 1) logged from action_plans.plans where id=$1::uuid",
        [thrice],
      ),
    ).toEqual({ verification_round: 4, logged: "4" });
  });
});
