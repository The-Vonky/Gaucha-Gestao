#!/usr/bin/env node
// Executor de terminal local, limitado a uploads novos de UMA auditoria explícita.
import {execFileSync} from 'node:child_process';
import {open,unlink,readFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {privateFile} from './audit-derivative-config.mjs';
import {restrictedConnection} from './audit-derivative-runtime-client.mjs';
import {launchRuntime} from './audit-derivative-runtime.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export const MAX_DEV_DURATION_MS=4*60*60*1000;
export function validateDevelopmentConfig(config,inspection){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(inspection??''))throw new Error('Explicit inspection required');
 const w=config.worker,d=w?.database;
 if(w?.apiUrl!=='http://127.0.0.1:54321'||d?.host!=='127.0.0.1'||d.port!==54322||d.database!=='postgres'||d.user!=='audit_derivative_worker'||d.ssl!==false)throw new Error('Local target required');
 if(w.queueScope)throw new Error('Session scope cannot be supplied by config');
}
export async function developmentLoop({run,scope,signal,clock=Date.now,wait=ms=>sleep(ms,undefined,{signal}),onResult=()=>{},maxDuration=MAX_DEV_DURATION_MS}){
 const end=clock()+Math.min(maxDuration,MAX_DEV_DURATION_MS);
 while(!signal.aborted&&clock()<end){
  // Escopo imutável, mesma auditoria/corte em todos os one-shots; sem paralelismo.
  const result=await run(scope);onResult(result);
  if(signal.aborted||clock()>=end)break;
  try{await wait(result.state==='ready'?250:2000);}catch(error){if(!signal.aborted)throw error;}
 }
}
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000});
const sql=text=>docker(['exec','-i','supabase_db_gaucha-gestao-local','psql','-X','-U','supabase_admin','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],text);
async function main(){
 const [option,file,inspectionOption,inspection,...extra]=process.argv.slice(2);
 if(option!=='--config'||inspectionOption!=='--inspection'||extra.length)throw new Error('Explicit arguments required');
 const config=JSON.parse(await privateFile(file));validateDevelopmentConfig(config,inspection);
 const signingSecret=(await privateFile(config.signingSecretFile)).trim();
 if(!(await readFile(root+'supabase/config.toml','utf8')).includes('project_id = "gaucha-gestao-local"'))throw new Error('Wrong project');
 const info=JSON.parse(docker(['inspect','--format','{{json .}}','supabase_db_gaucha-gestao-local']));
 if(info.Name!=='/supabase_db_gaucha-gestao-local'||!info.State.Running||!info.Config.Image.includes('/supabase/postgres:')||
  !info.NetworkSettings.Ports['5432/tcp']?.some(p=>p.HostIp==='127.0.0.1'&&p.HostPort==='54322'))throw new Error('Wrong local container');
 const lock='/tmp/gaucha-gestao-local-audit-thumbnails.lock';
 const handle=await open(lock,'wx',0o600);await handle.writeFile(String(process.pid));
 let enabled=false,connection;
 const stop=new AbortController();const shutdown=()=>{if(!stop.signal.aborted){console.log('Encerrando: aguardar o one-shot atual; nenhum novo trabalho será iniciado.');stop.abort();}};
 for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.on(signal,shutdown);
 try{
  // Bootstrap temporário: somente LOGIN/validade. Não cria senha, role ou grants.
  sql(`begin;select pg_advisory_xact_lock(16482003);do $$begin
   if not exists(select 1 from supabase_migrations.schema_migrations where version='20261105194432') then
    raise exception 'Scoped queue migration required' using errcode='55000';end if;
   if not exists(select 1 from pg_roles r where rolname='audit_derivative_worker' and not rolcanlogin and not rolinherit
    and not(rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls)
    and not exists(select 1 from pg_auth_members m where m.member=r.oid)) then
    raise exception 'Technical login must be restricted and NOLOGIN' using errcode='42501';end if;
   execute format('alter role audit_derivative_worker login valid until %L',clock_timestamp()+interval '4 hours 5 minutes');
  end $$;commit;`);
  enabled=true;
  connection=await restrictedConnection(config.worker.database);
  const {rows:[{cutoff}]}=await connection.query('select clock_timestamp()::text cutoff');
  const scope=Object.freeze({inspection,createdAfter:cutoff});
  await connection.end();connection=null;
  console.log('Executor local iniciado. Somente uploads novos desta auditoria; Ctrl+C encerra. Limite: quatro horas.');
  await developmentLoop({scope,signal:stop.signal,run:async queueScope=>{
   try{return await launchRuntime({workerConfig:{...config.worker,expectedEvidence:null,queueScope},signingSecret});}
   catch(error){
    if(String(error.code??'').startsWith('SQL_')||error.code==='DECODER_ISOLATION_FAILED')throw error;
    return {state:'failed',code:error.code==='DECODER_NOT_SMALLER'?'not_smaller':'generation_failed'};
   }
  },onResult:r=>{if(r.state!=='idle')console.log(JSON.stringify(r));}});
 }finally{
  try{await connection?.end();}
  finally{
   try{if(enabled){sql('alter role audit_derivative_worker nologin;');console.log('Executor encerrado; login técnico NOLOGIN.');}}
   finally{for(const signal of ['SIGINT','SIGTERM','SIGHUP'])process.off(signal,shutdown);await handle.close();await unlink(lock);}
  }
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{await main();}catch{console.error('Executor local bloqueado ou falhou. Conferir alvo/configuração privada, migration e estado do login; nenhum grant é ampliado automaticamente.');process.exitCode=1;}
}
