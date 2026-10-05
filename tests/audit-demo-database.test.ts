import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STORAGE_STUB } from "./storage-stub";
import { buildSeedSql } from "../scripts/audit-demo/sql.mjs";

const admin = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
let db: PGlite;
const query = async (sql: string) => (await db.query(sql)).rows;
beforeEach(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,
      banned_until timestamptz,deleted_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(STORAGE_STUB);
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values
    ('${admin}','admin@example.test',now()),('${other}','other@example.test',now());
    select private.bootstrap_administrator('${admin}');`);
}, 20000);
afterEach(async () => { await db.close(); });

async function snapshot() {
  return query(`select jsonb_build_object(
    'units',(select jsonb_agg(to_jsonb(u) order by id) from core.units u),
    'inspections',(select jsonb_agg(to_jsonb(i) order by id) from audit.inspections i),
    'answers',(select jsonb_agg(to_jsonb(a) order by inspection_id,item_key) from audit.inspection_answers a),
    'plans',(select jsonb_agg(to_jsonb(p) order by id) from action_plans.plans p),
    'logs',(select jsonb_agg(to_jsonb(l) order by id) from core.system_audit_log l),
    'access',(select jsonb_agg(to_jsonb(a) order by id) from core.user_role_assignments a)
  ) state`);
}

describe("audit demo through existing database contracts", () => {
  it("creates six units, seven audits, realistic scores/progress and triggered plans", async () => {
    await db.exec(buildSeedSql());
    expect(await query("select count(*)::int n from core.units")).toEqual([{ n: 6 }]);
    expect(await query(`select u.code,i.status,i.final_classification,count(a.response)::int answered,
      i.final_score::float8 score from core.units u join audit.inspections i on i.unit_id=u.id
      join audit.inspection_answers a on a.inspection_id=i.id
      group by u.code,i.id order by u.code,i.applied_on`)).toEqual([
      { code: "DEMO-AUD-ALTA", status: "finalized", final_classification: "adequate", answered: 158, score: 100 * 144 / 152 },
      { code: "DEMO-AUD-BAIXA", status: "finalized", final_classification: "inadequate", answered: 158, score: 45 },
      { code: "DEMO-AUD-EVOLUCAO", status: "finalized", final_classification: "inadequate", answered: 158, score: 45 },
      { code: "DEMO-AUD-EVOLUCAO", status: "finalized", final_classification: "partial", answered: 158, score: 100 * 109 / 150 },
      { code: "DEMO-AUD-EVOLUCAO", status: "finalized", final_classification: "adequate", answered: 158, score: 100 * 140 / 150 },
      { code: "DEMO-AUD-FINAL", status: "draft", final_classification: null, answered: 150, score: null },
      { code: "DEMO-AUD-INICIO", status: "draft", final_classification: null, answered: 18, score: null },
    ]);
    expect(await query("select count(*)::int n from audit.inspection_answers")).toEqual([{ n: 1106 }]);
    expect(await query("select count(*)::int n from action_plans.plans")).toEqual([{ n: 320 }]);
    expect(await query(`select count(*)::int n from action_plans.plans p join audit.inspection_answers a
      on (a.inspection_id,a.item_key)=(p.source_inspection_id,p.source_item_key)
      where p.source_type='checklist' and p.source_active and a.response in ('AP','NAT')
      and p.source_response=a.response and p.source_observation=a.observation`)).toEqual([{ n: 320 }]);
    expect(await query("select distinct status,effectiveness from action_plans.plans order by status,effectiveness nulls first")).toEqual([
      { status: "completed", effectiveness: null }, { status: "completed", effectiveness: "effective" },
      { status: "in_progress", effectiveness: null }, { status: "pending", effectiveness: null },
    ]);
    expect(await query(`select count(*)::int n from core.system_audit_log
      where module='audit' and action='finalize' and actor_user_id='${admin}'`)).toEqual([{ n: 5 }]);
    expect(await query("select count(*)::int n from core.units u join audit.inspections i on i.unit_id=u.id where u.code='DEMO-AUD-VAZIA'")).toEqual([{ n: 0 }]);
  });
  it("repeats without duplicating, resetting operator edits or changing audit logs/access", async () => {
    await db.exec(buildSeedSql(admin));
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${admin}',false);
      update audit.inspection_answers set observation='Edição visual preservada'
      where inspection_id=(select i.id from audit.inspections i join core.units u on u.id=i.unit_id where u.code='DEMO-AUD-INICIO') and item_key='item-001';
      reset role;`);
    const before = await snapshot();
    await db.exec(buildSeedSql());
    expect(await snapshot()).toEqual(before);
  });
  it("refuses namespace collisions and partial demo sets without changing unrelated data", async () => {
    await db.exec("insert into core.units(code,name) values('DEMO-AUD-BAIXA','Unidade do operador')");
    const before = await snapshot();
    await expect(db.exec(buildSeedSql())).rejects.toThrow(/colisão|parcial/i);
    await db.exec("rollback");
    expect(await snapshot()).toEqual(before);
  });
  it("requires a confirmed, active, unbanned administrator and never assigns access", async () => {
    const before = await snapshot();
    await expect(db.exec(buildSeedSql(other))).rejects.toThrow(/administrador/i);
    await db.exec("rollback");
    expect(await snapshot()).toEqual(before);
    await db.exec(`update auth.users set banned_until=now()+interval '1 day' where id='${admin}'`);
    await expect(db.exec(buildSeedSql())).rejects.toThrow(/administrador/i);
    await db.exec("rollback");
    expect(await query("select count(*)::int n from core.units")).toEqual([{ n: 0 }]);
  });
  it("uses authenticated grants for writes instead of bypassing them as postgres", async () => {
    await db.exec("revoke update(response,observation) on audit.inspection_answers from authenticated");
    const before = await snapshot();
    await expect(db.exec(buildSeedSql())).rejects.toThrow(/permission denied/i);
    await db.exec("rollback");
    expect(await snapshot()).toEqual(before);
  });
  it("rolls back every demo row when a domain operation fails late", async () => {
    await db.exec(`create function public.fail_demo_finalization() returns trigger language plpgsql as $$ begin
      if new.status='finalized' and (select code from core.units where id=new.unit_id)='DEMO-AUD-BAIXA' then
        raise exception 'Injected domain failure'; end if; return new; end $$;
      create trigger fail_demo before update on audit.inspections for each row execute function public.fail_demo_finalization();`);
    const before = await snapshot();
    await expect(db.exec(buildSeedSql())).rejects.toThrow("Injected domain failure");
    await db.exec("rollback");
    expect(await snapshot()).toEqual(before);
  });
});
