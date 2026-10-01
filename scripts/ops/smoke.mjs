#!/usr/bin/env node
// Minimal bootstrap/API contract smoke; domain integration suites stay unchanged.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
// Reuse shell target validation BEFORE reading credentials or calling any API.
execFileSync('bash', ['-c', 'source "$1"; shift; ops_init "$@"; ops_assert_target', '_',
  path.join(root, 'scripts/ops/common.sh'), ...args], {stdio: ['ignore', 'pipe', 'pipe']});
const [, environment, , envFile, , project, , database] = args;
const config = Object.fromEntries(readFileSync(envFile, 'utf8').trim().split('\n')
  .filter(line => line && !line.startsWith('#')).map(line => {
    const split = line.indexOf('=');
    return [line.slice(0, split), line.slice(split + 1)];
  }));
const composeArgs = ['compose', '--env-file', envFile, '--project-name', project,
  '-f', path.join(root, 'infra/supabase/docker-compose.yml')];
const subprocessEnv = {...process.env, ...config};
delete subprocessEnv.COMPOSE_FILE;
delete subprocessEnv.COMPOSE_PROFILES;
function sql(query) {
  return execFileSync('docker', [...composeArgs, 'exec', '-T', 'db', 'psql', '-X',
    '-v', 'ON_ERROR_STOP=1', '-h', 'localhost', '-U', 'supabase_admin', '-d', database, '-Atqc', query],
  {env: subprocessEnv, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8'}).trim();
}
const base = `http://127.0.0.1:${config.GATEWAY_PORT}`;
async function request(url, key, options = {}) {
  const {headers, ...rest} = options;
  return fetch(base + url, {...rest, headers: {apikey: key, Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json', ...headers}, signal: AbortSignal.timeout(10000)});
}
const service = config.SERVICE_ROLE_KEY;
const anon = config.ANON_KEY;
const buckets = ['action-plan-evidence', 'audit-checklist-evidence'];
const tag = randomBytes(8).toString('hex');
const email = `infra-${tag}@example.invalid`;
const password = randomBytes(32).toString('hex');
const sentinel = randomUUID();
const table = `infra_smoke_${tag}`;
let user;
let step = 'database bootstrap';
try {
  assert.equal(sql("select current_setting('server_version_num')::int/10000"), '17');
  assert.equal(sql(`select environment from infra_control.target`), environment);
  const migrations = readdirSync(path.join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  const recorded = JSON.parse(sql('select coalesce(json_object_agg(version,sha256),\'{}\'::json) from infra_control.migrations'));
  assert.deepEqual(Object.keys(recorded).sort(), migrations);
  for (const name of migrations) {
    assert.equal(recorded[name], createHash('sha256').update(readFileSync(path.join(root, 'supabase/migrations', name))).digest('hex'));
  }
  assert.equal(sql("select to_regclass('core.profiles') is not null and to_regclass('audit.checklist_evidence') is not null and to_regclass('action_plans.evidence') is not null"), 't');
  console.log(`smoke: PostgreSQL 17 and all ${migrations.length} migration hashes verified`);

  step = 'REST exposed schemas';
  const schemas = ['public','graphql_public','core','audit','action_plans'];
  // Reload is asynchronous; bound readiness polling rather than sleeping blindly.
  for (const schema of schemas) {
    let response;
    for (let attempt=0; attempt<15; attempt++) {
      response = await request('/rest/v1/', service, {headers:{'Accept-Profile':schema}});
      if (response.ok) break;
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    assert.ok(response.ok);
    assert.equal((await response.json()).swagger, '2.0');
  }
  const hidden = await request('/rest/v1/', service, {headers:{'Accept-Profile':'infra_control'}});
  assert.equal(hidden.status, 406);
  const profileError = await hidden.json();
  assert.equal(profileError.code, 'PGRST106');
  // v14.17 reports the requested schema in message and the allowlist in hint.
  assert.equal(profileError.message, 'Invalid schema: infra_control');
  assert.ok(profileError.hint.startsWith('Only the following schemas are exposed: '));
  assert.deepEqual(profileError.hint.replace('Only the following schemas are exposed: ', '').split(',').map(v=>v.trim()), schemas);
  console.log('smoke: exposed schemas exactly match the contract');

  step = 'public signup disabled';
  const signup = await request('/auth/v1/signup', anon, {method: 'POST', body: JSON.stringify({email,password})});
  assert.equal(signup.status, 422);
  assert.equal((await signup.json()).error_code, 'signup_disabled');
  console.log('smoke: public signup disabled');

  step = 'synthetic user login';
  const created = await request('/auth/v1/admin/users', service, {method:'POST', body:JSON.stringify({email,password,email_confirm:true})});
  assert.ok(created.ok);
  user = (await created.json()).id;
  assert.match(user, /^[a-f0-9-]{36}$/);
  assert.equal(sql(`select count(*) from core.profiles where id='${user}'`), '1');
  const login = await request('/auth/v1/token?grant_type=password', anon, {method:'POST',body:JSON.stringify({email,password})});
  assert.ok(login.ok);
  const session = await login.json();
  assert.equal(session.user.id, user);
  assert.ok(session.access_token);
  const identity = await request('/auth/v1/user', anon, {headers:{Authorization:`Bearer ${session.access_token}`}});
  assert.ok(identity.ok);
  assert.equal((await identity.json()).id, user);
  const profile = await request(`/rest/v1/profiles?id=eq.${user}&select=id`, anon,
    {headers:{'Accept-Profile':'core',Authorization:`Bearer ${session.access_token}`}});
  assert.ok(profile.ok);
  assert.deepEqual(await profile.json(), [{id:user}]);
  console.log('smoke: synthetic user can log in and read its own Core profile');

  step = 'anon application isolation';
  sql(`insert into core.units(id,code,name) values ('${sentinel}','INFRA-${tag}','Ephemeral infra smoke')`);
  // SQL proves the sentinel exists; Core intentionally grants no service_role ACL.
  assert.equal(sql(`select count(*) from core.units where id='${sentinel}'`), '1');
  const denied = await request(`/rest/v1/units?id=eq.${sentinel}&select=id`, anon, {headers:{'Accept-Profile':'core'}});
  if (denied.ok) assert.deepEqual(await denied.json(), []);
  else {
    assert.ok([401,403].includes(denied.status));
    assert.equal((await denied.json()).code, '42501');
  }
  console.log('smoke: anon cannot read an existing application row');

  step = 'private buckets and limits';
  const listed = await request('/storage/v1/bucket', service);
  assert.ok(listed.ok);
  const actual = await listed.json();
  assert.deepEqual(actual.map(bucket=>bucket.id).sort(), [...buckets].sort());
  for (const bucket of actual) {
    assert.equal(bucket.public, false);
    assert.equal(Number(bucket.file_size_limit), 10485760);
    assert.ok(bucket.allowed_mime_types.includes('application/pdf'));
    const blocked = await request(`/storage/v1/object/list/${bucket.id}`, anon, {method:'POST',body:JSON.stringify({prefix:'',limit:1})});
    if (blocked.ok) assert.deepEqual(await blocked.json(), []);
    else assert.ok([400,401,403].includes(blocked.status));
  }
  // Existing owning-module validation boundaries, no domain scenarios duplicated.
  for (const routine of ['action_plans_private.evidence_file_error','audit_private.checklist_file_error']) {
    assert.equal(sql(`select ${routine}('smoke.pdf','application/pdf',10485760) is null`), 't');
    assert.equal(sql(`select ${routine}('smoke.pdf','application/pdf',10485761) is not null`), 't');
  }
  console.log('smoke: exactly two private buckets and 10 MiB boundaries verified');

  step = 'actual REST max_rows';
  sql(`create table public.${table}(id int primary key); alter table public.${table} enable row level security;
    grant select on public.${table} to service_role;
    insert into public.${table} select generate_series(1,1001); notify pgrst,'reload schema'`);
  let rows;
  for (let attempt=0; attempt<15; attempt++) {
    rows = await request(`/rest/v1/${table}?select=id&order=id&limit=1001`, service,
      {headers:{'Accept-Profile':'public',Prefer:'count=exact'}});
    if (rows.ok) break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.ok(rows.ok);
  assert.equal(rows.headers.get('content-range'), '0-999/1001');
  assert.equal((await rows.json()).length, 1000);
  console.log('smoke: REST returns 1000 of 1001 existing rows');
} catch {
  console.error(`Smoke failed at: ${step}`);
  process.exitCode = 1;
} finally {
  // The unit has immutable audit references; retain it until disposable teardown.
  // Never bypass domain triggers or remove audit history to clean up a smoke.
  try {
    sql(`drop table if exists public.${table}; notify pgrst,'reload schema'`);
    if (user) {
      sql(`delete from core.profiles where id='${user}'`);
      const removed = await request(`/auth/v1/admin/users/${user}`, service, {method:'DELETE'});
      assert.ok(removed.ok);
    }
  } catch {
    console.error('Smoke cleanup failed; dispose the explicit stack');
    process.exitCode = 1;
  }
}
