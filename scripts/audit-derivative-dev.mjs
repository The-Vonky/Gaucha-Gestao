#!/usr/bin/env node
// Executor local: uploads novos de qualquer auditoria, sem backfill.
import {execFileSync} from 'node:child_process';
import {open,unlink,readFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {privateFile} from './audit-derivative-config.mjs';
import {restrictedConnection} from './audit-derivative-runtime-client.mjs';
import {launchRuntime} from './audit-derivative-runtime.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export const RENEW_INTERVAL_MS=60*1000;
export const CREDENTIAL_TTL_SECONDS=600;
export function validateDevelopmentConfig(config,inspection){
 if(inspection!=null&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(inspection))throw new Error('Explicit inspection required');
 const w=config.worker,d=w?.database;
 if(w?.apiUrl!=='http://127.0.0.1:54321'||d?.host!=='127.0.0.1'||d.port!==54322||d.database!=='postgres'||d.user!=='audit_derivative_worker'||d.ssl!==false)throw new Error('Local target required');
 if(w.queueScope)throw new Error('Session scope cannot be supplied by config');
}
export async function developmentLoop({run,scope,signal,clock=Date.now,wait=ms=>sleep(ms,undefined,{signal}),onResult=()=>{},renew=async()=>{}}){
 let nextRenew=clock();
 while(!signal.aborted){
  if(clock()>=nextRenew){await renew();nextRenew=clock()+RENEW_INTERVAL_MS;}
  if(signal.aborted)break;
  const result=await run(scope);onResult(result);
  if(signal.aborted)break;
  try{await wait(result.state==='ready'?250:2000);}catch(error){if(!signal.aborted)throw error;}
 }
}
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000});
const sql=text=>docker(['exec','-i','supabase_db_gaucha-gestao-local','psql','-X','-U','supabase_admin','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],text);
export async function startDevelopmentThumbnails({signal,onReady=()=>{},file=join(homedir(),'.local/state/gaucha-gestao/audit-thumbnails/launcher.json'),inspection}={}){
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
 signal?.addEventListener('abort',shutdown,{once:true});
 if(signal?.aborted)stop.abort();
 try{
  // Bootstrap temporário: somente LOGIN/validade. Não cria senha, role ou grants.
  sql(`begin;select pg_advisory_xact_lock(16482003);do $$begin
   if not exists(select 1 from supabase_migrations.schema_migrations where version='20261106112635') then
    raise exception 'Scoped queue migration required' using errcode='55000';end if;
   if not exists(select 1 from pg_roles r where rolname='audit_derivative_worker' and not rolcanlogin and not rolinherit
    and not(rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls)
    and not exists(select 1 from pg_auth_members m where m.member=r.oid)) then
    raise exception 'Technical login must be restricted and NOLOGIN' using errcode='42501';end if;
   execute format('alter role audit_derivative_worker login valid until %L',clock_timestamp()+interval '${CREDENTIAL_TTL_SECONDS} seconds');
  end $$;commit;`);
  enabled=true;
  if(stop.signal.aborted)return;
  connection=await restrictedConnection(config.worker.database);
  const {rows:[{cutoff}]}=await connection.query('select clock_timestamp()::text cutoff');
  const scope=Object.freeze({...(inspection?{inspection}:{mode:'global_new'}),createdAfter:cutoff});
  await connection.end();connection=null;
  console.log('Executor local iniciado. Uploads novos de qualquer auditoria; Ctrl+C encerra.');
  onReady();
  await developmentLoop({scope,signal:stop.signal,renew:async()=>{sql(`do $$begin if not exists(select 1 from pg_roles where rolname='audit_derivative_worker' and rolcanlogin) then raise exception 'Technical login disabled';end if;execute format('alter role audit_derivative_worker valid until %L',clock_timestamp()+interval '${CREDENTIAL_TTL_SECONDS} seconds');end $$;`);},run:async queueScope=>{
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
   finally{signal?.removeEventListener('abort',shutdown);await handle.close();await unlink(lock);}
  }
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const stop=new AbortController();
 for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.on(name,()=>stop.abort());
 const args=process.argv.slice(2);
 try{
  if(args.length&&!(args.length===2&&args[0]==='--config')&&!(args.length===4&&args[0]==='--config'&&args[2]==='--inspection'))throw new Error('Invalid arguments');
  await startDevelopmentThumbnails({signal:stop.signal,...(args.length?{file:args[1],inspection:args[3]}:{})});
 }catch{console.error('Executor local bloqueado ou falhou. Conferir configuração privada, migration, lock e NOLOGIN.');process.exitCode=1;}
}
