// Representative maximum-size benchmark for audit.unit_history_export (not part of `npm test`).
// Builds exactly 5,000 inspections for one unit, each with the full answer set of the pinned
// template (5,000 x 158 inspection_answers), mostly finalized with persisted results, then
// measures the RPC as an authenticated caller and checks that 5,001 fails without truncation.
//
//   node tests/performance/reporting-history.mjs                 # in-process PGlite
//   REPORTING_BENCH_DATABASE_URL=postgres://...@127.0.0.1:PORT/db node tests/performance/reporting-history.mjs
//
// The URL must be a disposable, empty local database (127.0.0.1 only); roles and schemas are created.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const LIMIT = 5000;
const RUNS = Number(process.env.REPORTING_BENCH_RUNS ?? 3);
const url = process.env.REPORTING_BENCH_DATABASE_URL;
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const UNIT = "10000000-0000-0000-0000-000000000001";
const storageStub = readFileSync("tests/storage-stub.ts", "utf8").match(/`([\s\S]*)`/)[1];

let db, engine;
if (url) {
  assert.equal(new URL(url).hostname, "127.0.0.1", "benchmark only runs against a local disposable database");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  db = { exec: (sql) => client.query(sql), query: (sql, params) => client.query(sql, params), close: () => client.end() };
  engine = `PostgreSQL ${(await client.query("show server_version")).rows[0].server_version}`;
} else {
  db = new PGlite();
  engine = "PGlite";
}
const as = (user) => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);
const owner = () => db.exec("reset role; select set_config('request.jwt.claim.sub','',false);");
const ms = (start) => Math.round(performance.now() - start);

let step = performance.now();
await db.exec(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  end $$;
  create schema auth;
  create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
await db.exec(storageStub);
for (const file of readdirSync("supabase/migrations").sort()) await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${id(1)}','1@example.test',now()),('${id(2)}','2@example.test',now());
  select private.bootstrap_administrator('${id(1)}');
  insert into core.units(id,code,name) values ('${UNIT}','BENCH','Unidade de benchmark');
  insert into core.roles(key,name) values ('bench-report','Report');
  insert into core.role_permissions select id,p from core.roles, unnest(array['audit.inspection.read','audit.inspection.export']) p where key='bench-report';
  insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id) select '${id(2)}',id,'unit','${UNIT}' from core.roles where key='bench-report';`);
console.info(`schema: ${ms(step)}ms`);

// One inspection through the real RPC proves the fixture matches create_inspection's shape.
await as(id(1));
const real = (await db.query("select audit.create_inspection($1,'2026-01-01') id", [UNIT])).rows[0].id;
await owner();
const template = (await db.query("select template_version t, count(*)::int n from audit.inspection_answers where inspection_id=$1 group by 1", [real])).rows[0];
assert.equal(template.n, 158);

step = performance.now();
// Bulk fixture: 4,999 more inspections spread over ~3 years (several per day, identical dates
// included), all 158 answers each. Deterministic responses: ~70% AT, 12% AP, 10% NAT, 8% NAP;
// observations on AP/NAT. 1 in 10 stays draft with the last 20 criteria unanswered.
await db.query(`insert into audit.inspections(unit_id,template_version,applied_on,previous_visit_on,responsible_id,created_at)
  select $1,$2,date '2026-01-01' - (n/5), date '2026-01-01' - (n/5) - 30, $3, timestamptz '2026-01-01 12:00Z' - n * interval '1 minute'
  from generate_series(1,${LIMIT - 1}) n`, [UNIT, template.t, id(1)]);
await db.query(`insert into audit.inspection_answers(inspection_id,template_version,item_key,response,observation,updated_by)
  select id,template_version,key,response,
    case when response in ('AP','NAT') then 'Observação de campo: ' || repeat('não conformidade descrita ', 4) else '' end, $2
  from (select i.id,i.template_version,c.key,
      case when extract(minute from i.created_at)::int % 10 = 0 and c.position > 138 then null
        else (array['AT','AT','AT','AT','AT','AT','AT','AP','NAT','NAP'])[1 + abs(hashtext(i.id::text || c.key)) % 10] end response
    from audit.inspections i join audit.checklist_items c on c.template_version=i.template_version
    where i.unit_id=$1 and i.id<>$3
    -- Each inspection's rows together, as create_inspection inserts them.
    order by i.created_at desc, c.position) generated`, [UNIT, id(1), real]);
await db.query(`update audit.inspections i set status='finalized', final_score=s.score, final_classification=audit_private.classify(s.score),
    finalized_at=i.created_at + interval '2 hours', finalized_by=$2
  from (select inspection_id, audit_private.conformity(count(*) filter(where response='AT'),count(*) filter(where response='AP'),
          count(*) filter(where response='NAT')) score
        from audit.inspection_answers group by inspection_id having count(response)=count(*)) s
  where s.inspection_id=i.id and i.unit_id=$1`, [UNIT, id(1)]);
await db.exec("analyze");
const shape = (await db.query(`select count(distinct i.id)::int inspections, count(a.*)::int answers,
    count(distinct i.id) filter(where i.status='finalized')::int finalized
  from audit.inspections i join audit.inspection_answers a on a.inspection_id=i.id where i.unit_id=$1`, [UNIT])).rows[0];
assert.deepEqual(shape, { inspections: LIMIT, answers: LIMIT * 158, finalized: shape.finalized });
console.info(`fixture: ${ms(step)}ms · ${shape.inspections} inspections · ${shape.answers} answers · ${shape.finalized} finalized`);

await as(id(2));
const timings = [];
let report, bytes;
for (let run = 0; run < RUNS; run++) {
  step = performance.now();
  report = (await db.query("select audit.unit_history_export($1,null,null) r", [UNIT])).rows[0].r;
  timings.push(ms(step));
}
bytes = Buffer.byteLength(JSON.stringify(report));
assert.equal(report.record_count, LIMIT);
assert.equal(report.records.length, LIMIT);
assert.ok(report.records.every((r) => r.counts.total === 158));
assert.equal(report.records.filter((r) => r.status === "finalized").length, shape.finalized);
assert.ok(report.records.some((r) => r.delta_pp !== null));
console.info(`${engine} unit_history_export(${LIMIT}): runs ${timings.join(", ")}ms · JSON ${bytes} bytes (${(bytes / 1048576).toFixed(2)} MiB)`);

await owner();
await db.query("insert into audit.inspections(unit_id,template_version,applied_on,responsible_id) values($1,$2,'2026-01-02',$3)", [UNIT, template.t, id(1)]);
await as(id(2));
step = performance.now();
await assert.rejects(db.query("select audit.unit_history_export($1,null,null)", [UNIT]), /Narrow the date range/);
console.info(`${engine} unit_history_export(${LIMIT + 1}): rejected "Narrow the date range" in ${ms(step)}ms`);
await db.close();
