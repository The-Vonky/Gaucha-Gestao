#!/usr/bin/env node
// Ensaio real EXCLUSIVO do stack descartável já criado por infra-validate.
// Nunca imprime JWT, segredo, URL assinada, bytes ou objetos de resposta.
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createInterface } from 'node:readline';
import sharp from 'sharp';
import { runOneShot, storageApiAdapter, authorizedStorageTransport } from '../audit-derivative-worker.mjs';
import { isolatedEncoder } from '../audit-derivative-encoder.mjs';
import { derivativeObjectKey } from '../audit-derivative-protocol.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const [, environment, , envFile, , project, , database] = args;
// Antes de ler credenciais ou executar SQL: não aceita staging, runtime local ou outro projeto.
if (process.env.GITHUB_ACTIONS !== 'true' || environment !== 'ci' ||
    project !== `gaucha-infra-ci-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`) {
  console.error('Thumbnail integration requires the existing infra-validate CI target');
  process.exit(2);
}
execFileSync('bash', ['-c', 'source "$1"; shift; ops_init "$@"; ops_assert_target', '_',
  path.join(root, 'scripts/ops/common.sh'), ...args], { stdio: ['ignore','pipe','pipe'] });
const config = Object.fromEntries(readFileSync(envFile, 'utf8').trim().split('\n').map(line => {
  const i = line.indexOf('='); return [line.slice(0,i),line.slice(i+1)];
}));
const base = `http://127.0.0.1:${config.GATEWAY_PORT}`;
const compose = ['compose','--env-file',envFile,'--project-name',project,'-f',path.join(root,'infra/supabase/docker-compose.yml')];
const command = [...compose,'exec','-T','db','psql','-X','-w','-h','db','-U','postgres','-d',database,'-Atq','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'];
const subprocessEnv = { ...process.env, ...config }; delete subprocessEnv.COMPOSE_FILE; delete subprocessEnv.COMPOSE_PROFILES;
const lit = value => "'" + String(value).replaceAll("'", "''") + "'";
const sql = (query, bootstrap=false) => {
  // Autoridade da fixture: supabase_admin SOMENTE para memberships/ACL/policies da plataforma.
  // SQL da aplicação e todas as chamadas do worker continuam com postgres -> SET ROLE restrito.
  const invocation=[...command];
  if(bootstrap){invocation[invocation.indexOf('-h')+1]='localhost';invocation[invocation.indexOf('-U')+1]='supabase_admin';}
  return execFileSync('docker',invocation,{input:query+';\n',env:subprocessEnv,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:20_000}).trim();
};
const json = query => JSON.parse(sql(query));
const bucket = 'audit-evidence-thumbnails';
const source = 'audit-checklist-evidence';
const role = 'audit_derivative_ci';
const technicalId = randomUUID();
const tag = randomBytes(6).toString('hex');
const A = randomUUID(), B = randomUUID(), sector = randomUUID();
const users = {};
let phase = 'fixture Auth and Core';
let currentJob;
let token;
let positiveSignedUrl;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const original = await sharp({create:{width:960,height:640,channels:4,background:{r:170,g:35,b:80,alpha:0.6}}}).png().toBuffer();
const encoded = await isolatedEncoder.encode({bytes:original,contentType:'image/png'});
const derived = encoded.bytes;
assert.ok(derived.length < original.length);
function jwt(lease) {
  const now = Math.floor(Date.now()/1000);
  const head = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const body = Buffer.from(JSON.stringify({role,sub:technicalId,iss:'supabase',aud:'authenticated',iat:now,exp:now+300,audit_derivative_lease:lease})).toString('base64url');
  return `${head}.${body}.${createHmac('sha256',config.JWT_SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
async function req(route, access = config.ANON_KEY, { method='GET', body, headers={}, admin=false } = {}) {
  const response = await fetch(base+route,{method,body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body),
    headers:{apikey:admin?config.SERVICE_ROLE_KEY:config.ANON_KEY,Authorization:`Bearer ${access}`,'Content-Type':'application/json',...headers},
    redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15_000)});
  const bytes=Buffer.from(await response.arrayBuffer());
  let data; try {data=JSON.parse(bytes.toString());}catch{data=null;}
  return {ok:response.ok,status:response.status,data,bytes};
}
function ok(result) { assert.equal(result.ok,true,`HTTP success required at ${phase}, status=${result.status}`);return result.data; }
function denied(result) { assert.ok(!result.ok && [400,401,403,404].includes(result.status),`HTTP denial required at ${phase}, status=${result.status}`); }
async function rpc(user,name,body) {
  return req(`/rest/v1/rpc/${name}`,users[user].token,{method:'POST',body,headers:{'Accept-Profile':'audit','Content-Profile':'audit'}});
}
const keyPath = key => key.split('/').map(encodeURIComponent).join('/');
const object = (name,key) => `/storage/v1/object/${name}/${keyPath(key)}`;
const get = (name,key,access) => req(`/storage/v1/object/authenticated/${name}/${keyPath(key)}`,access);
const sign = (key,access) => req(`/storage/v1/object/sign/${bucket}/${keyPath(key)}`,access,{method:'POST',body:{expiresIn:60}});
const count = key => Number(sql(`select count(*) from storage.objects where bucket_id=${lit(bucket)} and name=${lit(key)}`));
const processorSql = query => json(`set role ${role}; ${query}; reset role`);
const manifest = e => ({evidence_id:e.id,encoder_version:'img-480-v1',original_object_key:e.key,
  original_sha256:sha(original),derived_sha256:sha(derived),derived_object_key:derivativeObjectKey({evidenceId:e.id,version:'img-480-v1',originalSha256:sha(original),derivedSha256:sha(derived),mime:'image/png'}),
  mime:'image/png',width:encoded.width,height:encoded.height,bytes:derived.length});
async function evidence(status='available') {
  const inspection=ok(await rpc('owner','create_inspection',{p_unit:A,p_applied_on:'2026-11-04',p_previous_visit_on:null}));
  const [begun]=ok(await rpc('owner','begin_checklist_evidence_upload',{p_inspection:inspection,p_item_key:'item-001',p_original_name:'synthetic.png',p_content_type:'image/png',p_size:original.length}));
  ok(await req(object(source,begun.object_key),users.owner.token,{method:'POST',body:original,headers:{'Content-Type':'image/png','x-upsert':'false'}}));
  if(status!=='pending')ok(await rpc('owner','confirm_checklist_evidence_upload',{p_evidence:begun.evidence_id}));
  if(status==='removed')ok(await rpc('owner','remove_checklist_evidence',{p_evidence:begun.evidence_id}));
  return {id:begun.evidence_id,key:begun.object_key,inspection};
}
function readyFixture(e,state='ready') {
  const m=manifest(e);
  sql(`insert into audit.checklist_evidence_derivatives(evidence_id,encoder_version,original_object_key,state,original_sha256,derived_sha256,derived_object_key,mime,width,height,bytes,ready_at)
    values(${lit(e.id)},'img-480-v1',${lit(e.key)},${lit(state)},${lit(m.original_sha256)},${lit(m.derived_sha256)},${lit(m.derived_object_key)},'image/png',${m.width},${m.height},${m.bytes},${state==='ready'?'clock_timestamp()':'null'})
    on conflict(evidence_id,encoder_version) do update set state=excluded.state,original_sha256=excluded.original_sha256,derived_sha256=excluded.derived_sha256,
    derived_object_key=excluded.derived_object_key,mime=excluded.mime,width=excluded.width,height=excluded.height,bytes=excluded.bytes,ready_at=excluded.ready_at`);
  return m;
}
try {
  sql(`insert into core.units(id,code,name) values(${lit(A)},${lit('AD-A-'+tag)},'Synthetic derivative A'),(${lit(B)},${lit('AD-B-'+tag)},'Synthetic derivative B');
    insert into core.sectors(id,code,name) values(${lit(sector)},${lit('AD-S-'+tag)},'Synthetic sector');insert into core.unit_sectors values(${lit(A)},${lit(sector)})`);
  const accessRole=sql(`insert into core.roles(key,name) values(${lit('derivative-'+tag)},'Synthetic derivative permissions') returning id`);
  sql(`insert into core.role_permissions select ${lit(accessRole)}::uuid,'audit.inspection.'||p from unnest(array['read','create','edit','finalize','reopen']) p`);
  for(const name of ['owner','reader','empty','wrong','sector','inactive','revoked']){
    const email=`derivative-${name}-${tag}@example.invalid`, password=randomBytes(24).toString('hex')+'Aa1!';
    // Chave administrativa preexistente SOMENTE no bootstrap Auth de fixtures, nunca no processador/Storage.
    const created=ok(await req('/auth/v1/admin/users',config.SERVICE_ROLE_KEY,{admin:true,method:'POST',body:{email,password,email_confirm:true}}));
    const session=ok(await req('/auth/v1/token?grant_type=password',config.ANON_KEY,{method:'POST',body:{email,password}}));
    assert.equal(created.id,session.user.id);users[name]={id:created.id,token:session.access_token};
    if(name!=='empty')sql(`insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) values(${lit(created.id)},${lit(accessRole)},${lit(name==='sector'?'sector':'unit')},${lit(name==='wrong'?B:A)},${name==='sector'?lit(sector):'null'})`);
  }
  sql(`update core.profiles set active=false where id=${lit(users.inactive.id)}`);
  console.log('PASS derivative Auth: seven real users, active/inactive, no-grant, unit and sector fixtures');

  phase='custom role setup (disposable only)';
  sql(`create role ${role} nologin noinherit nobypassrls;
    `);
  phase='custom role membership';
  sql(`grant ${role} to supabase_storage_admin;grant ${role} to postgres with set true`,true);
  phase='custom role schema table and function ACL';
  sql(`
    grant usage on schema audit_private to ${role};
    grant execute on function audit_private.claim_evidence_derivative(),audit_private.prepare_evidence_derivative(uuid,jsonb),audit_private.complete_evidence_derivative(uuid),audit_private.fail_evidence_derivative(uuid) to ${role};
    `);
  sql(`grant usage on schema storage,auth to ${role};grant select on storage.buckets,storage.objects to ${role};grant insert on storage.objects to ${role}`,true);
  phase='custom role lease helper';
  sql(`create function audit_private.ci_derivative_object(p_bucket text,p_key text) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from audit.checklist_evidence_derivatives d join audit.checklist_evidence e on e.id=d.evidence_id
      where d.state='processing' and d.lease_until>clock_timestamp() and d.lease_id::text=auth.jwt()->>'audit_derivative_lease'
      and e.status='available' and ((p_bucket='audit-checklist-evidence' and p_key=e.object_key)
        or(p_bucket='audit-evidence-thumbnails' and p_key=d.derived_object_key)))
    $$;
    revoke all on function audit_private.ci_derivative_object(text,text) from public,anon,authenticated;grant execute on function audit_private.ci_derivative_object(text,text) to ${role};
    `);
  phase='custom role Storage policies';
  sql(`create policy ci_derivative_bucket on storage.buckets for select to ${role} using(id in ('audit-checklist-evidence','audit-evidence-thumbnails'));
    create policy ci_derivative_select on storage.objects for select to ${role} using(current_setting('storage.operation',true)='storage.object.get_authenticated' and audit_private.ci_derivative_object(bucket_id,name));
    create policy ci_derivative_insert on storage.objects for insert to ${role} with check(bucket_id='audit-evidence-thumbnails' and current_setting('storage.operation',true)='storage.object.upload' and audit_private.ci_derivative_object(bucket_id,name))`,true);
  const privileges=json(`select json_build_object('super',rolsuper,'bypass',rolbypassrls,'login',rolcanlogin,'inherits',rolinherit,'authenticated',pg_has_role(${lit(role)},'authenticated','MEMBER')) from pg_roles where rolname=${lit(role)}`);
  assert.deepEqual(privileges,{super:false,bypass:false,login:false,inherits:false,authenticated:false});

  phase='custom JWT and complete real worker';
  const first=await evidence();const unrelated=await evidence();
  sql(`update audit.checklist_evidence_derivatives set attempts=5 where evidence_id=${lit(unrelated.id)}`);
  const repository={
    claim:async()=>{currentJob=processorSql('select audit_private.claim_evidence_derivative()');token=jwt(currentJob.lease);return currentJob;},
    prepare:async(lease,m)=>{
      assert.equal(processorSql(`select audit_private.prepare_evidence_derivative(${lit(lease)},${lit(JSON.stringify(m))}::jsonb)`),true);
      phase='technical token restrictions during live lease';
      denied(await get(source,unrelated.key,token));denied(await get(source,first.key,jwt(randomUUID())));
      denied(await sign(m.derived_object_key,token));
      denied(await req(object(bucket,randomUUID()),token,{method:'POST',body:derived,headers:{'Content-Type':'image/png','x-upsert':'false'}}));
      denied(await req(object(source,first.key),token,{method:'PUT',body:original,headers:{'Content-Type':'image/png'}}));
      const forged=token.split('.');forged[2]=(forged[2][0]==='A'?'B':'A')+forged[2].slice(1);denied(await get(source,first.key,forged.join('.')));
      phase='worker upload and readback under scoped technical token';return true;
    },
    complete:async lease=>processorSql(`select audit_private.complete_evidence_derivative(${lit(lease)})`),
    fail:async lease=>processorSql(`select audit_private.fail_evidence_derivative(${lit(lease)})`),
  };
  const transport=authorizedStorageTransport({origin:base,apiKey:config.ANON_KEY,accessToken:async()=>token});
  const storage=storageApiAdapter({request:async request=>{
    const response=await transport(request);
    if(!response.ok){
      let code='UNKNOWN';try{const body=JSON.parse(await new Response(response.body).text());const candidate=String(body.code??body.error??'UNKNOWN');if(/^[A-Za-z0-9_ ]{1,48}$/.test(candidate))code=candidate;}catch{/* nunca imprimir resposta */}
      console.error(`Technical Storage probe: HTTP ${response.status}, code=${code}`);response.body=null;
    }
    return response;
  }});
  const result=await runOneShot({repository,storage});assert.equal(result.state,'ready');
  const good=manifest(first);assert.equal(count(good.derived_object_key),1);
  assert.ok((await get(source,first.key,users.owner.token)).bytes.equals(original));
  denied(await get(source,first.key,token));denied(await get(bucket,good.derived_object_key,token));
  console.log('PASS custom JWT Storage v1.74.0: non-login non-inheriting NOBYPASSRLS role reads only leased original, inserts reserved derivative, reads back; closes with lease');
  console.log('PASS real one-shot: API original -> isolated encoder -> reserved upload -> readback -> SQL ready; hashes and original bytes preserved, no service_role in worker');

  phase='positive reader and signed URL';
  for(const name of ['owner','reader','revoked']){
    const rows=ok(await rpc(name,'checklist_evidence_thumbnail',{p_evidence:first.id}));assert.equal(rows.length,1);
    const signed=ok(await sign(good.derived_object_key,users[name].token));assert.ok(signed.signedURL);
    const url=new URL('/storage/v1'+signed.signedURL,base);assert.equal(url.origin,base);
    const response=await fetch(url,{signal:AbortSignal.timeout(15_000)});assert.equal(response.status,200);
    assert.ok(Buffer.from(await response.arrayBuffer()).equals(derived));positiveSignedUrl=url;
    assert.ok((await get(bucket,good.derived_object_key,users[name].token)).bytes.equals(derived));
  }
  phase='anonymous and wrong permissions';
  for(const access of [config.ANON_KEY,...['empty','wrong','sector','inactive'].map(name=>users[name].token)]){
    denied(await sign(good.derived_object_key,access));denied(await get(bucket,good.derived_object_key,access));
    const listed=await req(`/storage/v1/object/list/${bucket}`,access,{method:'POST',body:{prefix:'',limit:100}});
    if(listed.ok)assert.deepEqual(listed.data,[]);else denied(listed);
  }
  const bare=await fetch(base+`/storage/v1/object/authenticated/${bucket}/${keyPath(good.derived_object_key)}`);assert.notEqual(bare.status,200);await bare.body?.cancel();
  const publicFile=await fetch(base+`/storage/v1/object/public/${bucket}/${keyPath(good.derived_object_key)}`);assert.notEqual(publicFile.status,200);await publicFile.body?.cancel();
  for(const name of ['empty','wrong','sector','inactive'])assert.deepEqual(ok(await rpc(name,'checklist_evidence_thumbnail',{p_evidence:first.id})),[]);
  sql(`update core.user_role_assignments set active=false where user_id=${lit(users.revoked.id)}`);
  denied(await sign(good.derived_object_key,users.revoked.token));denied(await get(bucket,good.derived_object_key,users.revoked.token));
  // Links já emitidos conservam a janela residual documentada; nova assinatura foi negada.
  const residual=await fetch(positiveSignedUrl,{signal:AbortSignal.timeout(10_000)});assert.equal(residual.status,200);await residual.body?.cancel();
  console.log('PASS real reader matrix: allowed ready; anonymous/no grant/cross-unit/sector/inactive/revoked denied; previously signed URL retains residual TTL');

  phase='pending removed and non-ready physical fixtures';
  const cases=[];
  for(const state of ['pending-original','removed-original','pending-derivative','failed-derivative']){
    const e=await evidence(state==='pending-original'?'pending':state==='removed-original'?'removed':'available');
    const m=readyFixture(e,state==='pending-derivative'?'pending':state==='failed-derivative'?'failed':'ready');
    cases.push({e,m});
  }
  const orphanKey=`${randomUUID()}/orphan.png`;
  const fixtureKeys=[...cases.map(x=>x.m.derived_object_key),orphanKey];
  // Policy de fixture separada, só INSERT nas chaves exatas; retirada antes dos demais probes.
  sql(`create policy ci_derivative_fixture_insert on storage.objects for insert to ${role} with check(bucket_id=${lit(bucket)} and current_setting('storage.operation',true)='storage.object.upload' and name in (${fixtureKeys.map(lit).join(',')}))`,true);
  for(const key of fixtureKeys)ok(await req(object(bucket,key),jwt(randomUUID()),{method:'POST',body:derived,headers:{'Content-Type':'image/png','x-upsert':'false'}}));
  sql('drop policy ci_derivative_fixture_insert on storage.objects',true);
  for(const {e,m} of cases){
    assert.equal(count(m.derived_object_key),1);denied(await sign(m.derived_object_key,users.owner.token));denied(await get(bucket,m.derived_object_key,users.owner.token));
    assert.deepEqual(ok(await rpc('owner','checklist_evidence_thumbnail',{p_evidence:e.id})),[]);
  }
  denied(await sign(orphanKey,users.owner.token));denied(await get(bucket,orphanKey,users.owner.token));
  denied(await sign(good.derived_object_key.replace(first.id,randomUUID()),users.owner.token));
  console.log('PASS physical object present but denied for pending/removed original, pending/failed derivative, orphan and forged key');

  phase='ordinary user SQL and manifest writes';
  assert.throws(()=>sql('set role authenticated;select audit_private.claim_evidence_derivative()'),error=>String(error.stderr??'').includes('42501'));
  assert.throws(()=>sql(`set role ${role};select * from audit.checklist_evidence_derivatives`),error=>String(error.stderr??'').includes('42501'));
  const forgedMetadata=await req(`/rest/v1/checklist_evidence_derivatives?evidence_id=eq.${first.id}`,users.owner.token,{method:'PATCH',body:{state:'failed'},headers:{'Content-Profile':'audit'}});
  denied(forgedMetadata);
  phase='prohibited user Storage mutations';
  for(const name of ['owner','empty','wrong']){
    const access=users[name].token, destination=`${randomUUID()}/forged.png`;
    denied(await req(object(bucket,destination),access,{method:'POST',body:derived,headers:{'Content-Type':'image/png','x-upsert':'false'}}));
    denied(await req(object(bucket,good.derived_object_key),access,{method:'POST',body:derived,headers:{'Content-Type':'image/png','x-upsert':'true'}}));
    denied(await req(object(bucket,good.derived_object_key),access,{method:'PUT',body:derived,headers:{'Content-Type':'image/png'}}));
    for(const op of ['copy','move'])denied(await req(`/storage/v1/object/${op}`,access,{method:'POST',body:{bucketId:bucket,sourceKey:good.derived_object_key,destinationKey:destination}}));
    denied(await req(`/storage/v1/object/upload/sign/${bucket}/${keyPath(destination)}`,access,{method:'POST',body:{}}));
    const removed=await req(`/storage/v1/object/${bucket}`,access,{method:'DELETE',body:{prefixes:[good.derived_object_key]}});
    if(removed.ok)assert.deepEqual(removed.data,[]);else denied(removed);
    assert.equal(count(good.derived_object_key),1);assert.equal(count(destination),0);
  }
  assert.ok((await get(bucket,good.derived_object_key,users.owner.token)).bytes.equals(derived));
  assert.ok((await get(source,first.key,users.owner.token)).bytes.equals(original));
  console.log('PASS real Storage POST/upsert/PUT/copy/move/signed-upload/delete denied with source bytes unchanged and destination absent');

  phase='finalized and reopened';
  sql(`update audit.inspection_answers set response='AT' where inspection_id=${lit(first.inspection)}`);
  ok(await rpc('owner','finalize_inspection',{p_id:first.inspection,p_version:1,p_expected_evidence_ids:[first.id]}));
  ok(await sign(good.derived_object_key,users.reader.token));
  denied(await rpc('owner','remove_checklist_evidence',{p_evidence:first.id}));
  ok(await rpc('owner','reopen_inspection',{p_id:first.inspection,p_version:2}));ok(await sign(good.derived_object_key,users.reader.token));
  console.log('PASS finalized remains readable without edit; reopen preserves original and derivative');

  phase='two real PostgreSQL sessions';
  // Todas as fixtures anteriores são deste stack novo. Impede jobs de cenários negativos disputarem a claim do ensaio.
  sql("update audit.checklist_evidence_derivatives set attempts=5 where state<>'ready'");
  const raceEvidence=await evidence();
  const held=spawn('docker',command,{env:subprocessEnv,stdio:['pipe','pipe','pipe']});
  let stderr='';held.stderr.on('data',chunk=>{stderr+=chunk;});
  const done=new Promise((resolve,reject)=>{held.on('error',reject);held.on('close',code=>code===0?resolve():reject(new Error('Concurrent psql failed')));});
  const lines=createInterface({input:held.stdout});let firstJob;
  const barrier=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Claim barrier timeout')),10_000);
    lines.on('line',line=>{if(line.startsWith('{'))firstJob=JSON.parse(line);if(line==='CLAIM_HELD'){clearTimeout(timer);resolve();}});
    held.on('close',()=>{clearTimeout(timer);reject(new Error('Claim session closed before barrier'));});
  });
  // Não termina stdin até a segunda conexão ter tentado a claim sob lock.
  held.stdin.write(`set statement_timeout='15s';set role ${role};begin;select audit_private.claim_evidence_derivative();select 'CLAIM_HELD';\n`);
  try {
    await barrier;assert.equal(firstJob.evidence.id,raceEvidence.id);
    assert.equal(processorSql('select audit_private.claim_evidence_derivative()'),null);
    held.stdin.end('commit;\n');await done;
    assert.equal(stderr,'');assert.equal(processorSql('select audit_private.claim_evidence_derivative()'),null);
    sql(`update audit.checklist_evidence_derivatives set lease_until=clock_timestamp()-interval '1 second' where evidence_id=${lit(raceEvidence.id)}`);
    const newer=processorSql('select audit_private.claim_evidence_derivative()');assert.notEqual(newer.lease,firstJob.lease);
    assert.equal(processorSql(`select audit_private.complete_evidence_derivative(${lit(firstJob.lease)})`),false);
    assert.equal(processorSql(`select audit_private.fail_evidence_derivative(${lit(newer.lease)})`),true);
    assert.equal(processorSql('select audit_private.claim_evidence_derivative()'),null);
  } finally {if(held.exitCode===null)held.kill('SIGKILL');lines.close();await done.catch(()=>{});}
  console.log('PASS two PostgreSQL connections: advisory lock blocks second claim, active lease blocks after commit, expiry reclaims, stale CAS fails, retry respects backoff');

  phase='original removed after ready';
  ok(await rpc('owner','remove_checklist_evidence',{p_evidence:first.id}));denied(await sign(good.derived_object_key,users.reader.token));
  assert.equal(count(good.derived_object_key),1);
  console.log('PASS removal after ready revokes new signing, retains derivative and original objects; no purge');
  console.log('PASS AUD-IMG-02 real CI integration complete; no persistent provisioning or operational credentials');
} catch (error) {
  const code=String(error.stderr??'').match(/(?:ERROR|FATAL):\s*([0-9A-Z]{5})/)?.[1]??'CHECK_FAILED';
  console.error(`AUD-IMG-02 real CI integration failed at: ${phase}; code=${code}`);
  process.exitCode=1;
}
// Fixtures, roles/policies e tokens só existem neste stack efêmero. O teardown existente do
// workflow elimina o stack completo; não contornar histórico/triggers para limpar dados.
