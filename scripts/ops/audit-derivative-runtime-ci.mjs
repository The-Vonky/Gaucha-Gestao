// Acrescenta somente a prova que faltava: LOGIN SQL e emissor isolado, no stack já existente.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import sharp from 'sharp';
import {launchRuntime} from '../audit-derivative-runtime.mjs';
import {restrictedConnection} from '../audit-derivative-runtime-client.mjs';
export async function runRuntimeCI({sql,json,compose,subprocessEnv,config,base,root,evidence,manifest,lit,count,verifyOriginal}) {
  let phase='runtime bootstrap';
  try{
  const login='audit_derivative_worker',password=randomBytes(32).toString('hex');
  sql(`create role ${login} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 3
    password ${lit(password)} valid until ${lit(new Date(Date.now()+3600000).toISOString())}`,true);
  sql(readFileSync(root+'/scripts/ops/sql/audit-derivative-runtime-access.sql','utf8'),true);
  const container=execFileSync('docker',[...compose,'ps','--quiet','db'],{env:subprocessEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const networks=JSON.parse(execFileSync('docker',['inspect','--format','{{json .NetworkSettings.Networks}}',container],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  const host=Object.values(networks).map(n=>n.IPAddress).find(Boolean);assert.ok(host);
  const database={host,port:5432,database:'postgres',user:login,password,ssl:false};
  phase='runtime actual SCRAM authentication';
  const bad=new pg.Client({...database,password:randomBytes(32).toString('hex'),connectionTimeoutMillis:5000});
  try{await assert.rejects(bad.connect(),error=>error.code==='28P01');}finally{await bad.end().catch(()=>{});}
  const session=await restrictedConnection(database);await session.end();
  // Demonstra também a pré-condição de migração de configuração do ambiente existente.
  // O valor nunca retorna ao cliente mínimo: o guard faz somente um teste booleano.
  phase='runtime global secret guard';
  sql(`alter database postgres set "app.settings.jwt_secret" to ${lit(config.JWT_SECRET)}`,true);
  await assert.rejects(restrictedConnection(database),error=>error.code==='SQL_GLOBAL_SECRET');
  sql('alter database postgres reset "app.settings.jwt_secret"',true);
  const safe=await restrictedConnection(database);await safe.end();
  console.log('PASS runtime SQL LOGIN: real SCRAM password, wrong password denied, no SET ROLE; legacy global JWT GUC blocks startup until removed');
  sql("update audit.checklist_evidence_derivatives set attempts=5 where state<>'ready'");
  phase='runtime isolated token and SQL probe';
  const probeEvidence=await evidence();const m=manifest(probeEvidence);
  const canary=`/tmp/audit-issuer-${randomBytes(12).toString('hex')}`;
  writeFileSync(canary,randomBytes(32),{mode:0o600,flag:'wx'});
  try{
    const result=await launchRuntime({workerConfig:{apiUrl:base,anonKey:config.ANON_KEY,database,expectedEvidence:probeEvidence.id,
      probe:{manifest:m,canary,issuerPid:process.pid}},signingSecret:config.JWT_SECRET,probe:true});
    assert.equal(result.state,'probed');assert.ok(result.sqlLogin&&result.sqlDenials&&result.isolated&&result.exactKey&&result.expiry&&result.renewal&&result.closedLease);
  }finally{unlinkSync(canary);}
  assert.equal(count(m.derived_object_key+'-forbidden'),0);
  assert.equal(Number(sql(`select attempts from audit.checklist_evidence_derivatives where evidence_id=${lit(probeEvidence.id)}`)),1);
  sql(`update audit.checklist_evidence_derivatives set attempts=5 where evidence_id=${lit(probeEvidence.id)}`);
  console.log('PASS runtime isolated LOGIN worker: SQL/admin/Storage metadata denials, issuer files/proc/env hidden, exact bucket/key, real 30s JWT expiry, renewal and closed-lease revocation');
  phase='runtime actual LOGIN full worker';
  const large=await sharp(randomBytes(960*640*4),{raw:{width:960,height:640,channels:4}}).png().toBuffer();
  assert.ok(large.length>2*1024*1024 && large.length<=10*1024*1024);
  const actual=await evidence('available',large);
  const result=await launchRuntime({workerConfig:{apiUrl:base,anonKey:config.ANON_KEY,database,expectedEvidence:actual.id},signingSecret:config.JWT_SECRET});
  assert.equal(result.state,'ready');
  const key=sql(`select derived_object_key from audit.checklist_evidence_derivatives where evidence_id=${lit(actual.id)}`);assert.equal(count(key),1);
  const state=json(`select json_build_object('state',state,'login',runtime_login) from audit.checklist_evidence_derivatives where evidence_id=${lit(actual.id)}`);
  assert.deepEqual(state,{state:'ready',login});
  await verifyOriginal(actual.key,large);
  sql(`alter role ${login} nologin`,true);
  console.log('PASS runtime full one-shot: dedicated PostgreSQL LOGIN -> bounded one-shot issuer -> sibling isolated decoder -> ready, original >2 MiB intact; only technical password/public API key in worker, no administrative connection/secret');
  }catch(error){if(!error.phase)error.phase=phase;throw error;}
}
