// Somente ensaio sintético do CI. Reusa o cliente real do worker e o emissor real one-shot.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {workerBoot,restrictedConnection,runtimeRepository} from './audit-derivative-runtime-client.mjs';
const boot=await workerBoot();let connection;let phase='own SQL login';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const deny=async response=>{assert.ok([400,401,403,404].includes(response.status));await response.body?.cancel();};
try{
  connection=await restrictedConnection(boot.config.database);
  const repo=runtimeRepository(connection,boot.config.expectedEvidence);
  const {rows:[identity]}=await connection.query('select current_user::text u,session_user::text s');
  assert.equal(identity.u,'audit_derivative_worker');assert.equal(identity.s,identity.u);
  phase='SQL privilege denials';
  for(const query of ['select * from audit.checklist_evidence_derivatives','select * from core.profiles','select * from storage.objects',
    "select pg_read_file('/etc/passwd')","select pg_read_binary_file('/etc/passwd')",
    'select * from pg_authid','select audit_private.claim_evidence_derivative()',
    'set role postgres','set role authenticated','set role audit_derivative_storage_runtime','set session authorization postgres',
    'create schema derivative_forbidden','create function audit_private.derivative_forbidden() returns int language sql as $$select 1$$']){
    await assert.rejects(connection.query(query),error=>error.code==='42501');
  }
  await connection.query('reset role');assert.equal((await connection.query('select current_user u')).rows[0].u,identity.u);
  phase='worker cannot read issuer files or environment';
  assert.equal(process.env.JWT_SECRET,undefined);assert.equal(process.env.SERVICE_ROLE_KEY,undefined);assert.equal(process.env.POSTGRES_PASSWORD,undefined);
  await assert.rejects(readFile(boot.config.probe.canary),error=>error.code==='ENOENT');
  await assert.rejects(readFile(`/proc/${boot.config.probe.issuerPid}/environ`),error=>error.code==='ENOENT');
  phase='lease and exact object tokens';
  await assert.rejects(connection.query('select audit_private.runtime_derivative_claim($1)',[randomUUID()]),error=>error.code==='42501');
  const job=await repo.claim();assert.ok(job);const m=boot.config.probe.manifest;assert.equal(job.evidence.id,m.evidence_id);
  const source=await boot.requestToken(job.lease,'source');
  const claims=JSON.parse(Buffer.from(source.token.split('.')[1],'base64url'));
  assert.equal(claims.role,'audit_derivative_storage_runtime');assert.ok(claims.exp-claims.iat<=30);
  assert.equal(claims.audit_derivative_key,job.evidence.object_key);assert.equal(claims.audit_derivative_login,identity.u);
  const request=(bucket,key,token,options={})=>fetch(`${boot.config.apiUrl}/storage/v1/object/${options.method?'':'authenticated/'}${bucket}/${key}`,{
    ...options,headers:{apikey:boot.config.anonKey,Authorization:`Bearer ${token}`,'Content-Type':'image/png','x-upsert':'false'},signal:AbortSignal.timeout(10000)});
  const original=await request(source.scope.bucket,source.scope.key,source.token);assert.equal(original.status,200);
  assert.equal(hash(Buffer.from(await original.arrayBuffer())),m.original_sha256);
  await assert.rejects(boot.requestToken(job.lease,'service_role'));
  await assert.rejects(boot.requestToken(randomUUID(),'source'));
  assert.equal(await repo.prepare(job.lease,m),true);
  const derived=await boot.requestToken(job.lease,'derived');assert.equal(derived.scope.key,m.derived_object_key);
  const output=Buffer.from(boot.config.probe.derived,'base64');
  const uploaded=await request(derived.scope.bucket,derived.scope.key,derived.token,{method:'POST',body:output});assert.equal(uploaded.status,200);await uploaded.body?.cancel();
  const readback=await request(derived.scope.bucket,derived.scope.key,derived.token);assert.equal(readback.status,200);
  assert.equal(hash(Buffer.from(await readback.arrayBuffer())),m.derived_sha256);
  await deny(await request(derived.scope.bucket,derived.scope.key,source.token));
  await deny(await request(source.scope.bucket,source.scope.key,derived.token));
  phase='real JWT expiration and renewal without extending lease';
  await new Promise(resolve=>setTimeout(resolve,Math.max(1,source.expires*1000-Date.now()+1100)));
  // A lease continua viva; a negação seguinte é da expiração do JWT, não do job.
  const scope=await repo.scope(job.lease,'source');assert.ok(scope.lease_expires>scope.server_now+2);
  await deny(await request(source.scope.bucket,source.scope.key,source.token));
  const renewed=await boot.requestToken(job.lease,'source');assert.notEqual(renewed.token,source.token);
  assert.ok(renewed.expires>source.expires);assert.ok(renewed.expires<=source.scope.lease_expires);
  const renewedGet=await request(renewed.scope.bucket,renewed.scope.key,renewed.token);assert.equal(renewedGet.status,200);await renewedGet.body?.cancel();
  phase='closed lease denies renewal and existing tokens';
  assert.equal(await repo.fail(job.lease),true);
  await assert.rejects(boot.requestToken(job.lease,'source'));await assert.rejects(boot.requestToken(job.lease,'derived'));
  await deny(await request(renewed.scope.bucket,renewed.scope.key,renewed.token));
  process.stdout.write(JSON.stringify({type:'result',result:{state:'probed',sqlLogin:true,sqlDenials:true,isolated:true,exactKey:true,expiry:true,renewal:true,closedLease:true}})+'\n');
}catch(error){
  const code=/^[A-Z0-9_]{1,32}$/.test(String(error.code??''))?error.code:'CHECK_FAILED';
  process.stdout.write(JSON.stringify({type:'result',result:{state:'failed',phase,code}})+'\n');process.exitCode=1;
}finally{await connection?.end();boot.close();}
