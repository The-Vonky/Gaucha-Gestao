#!/usr/bin/env node
// Executor local: uploads novos de qualquer auditoria, sem backfill.
import {execFileSync} from 'node:child_process';
import {open,unlink,readFile,link,lstat} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
import {homedir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {dirname,join} from 'node:path';
import {privateFile} from './audit-derivative-config.mjs';
import {restrictedConnection} from './audit-derivative-runtime-client.mjs';
import {launchRuntime} from './audit-derivative-runtime.mjs';
const LOCK='/tmp/gaucha-gestao-local-audit-thumbnails.lock';
const messages={
 CONFIG: 'Confira o launcher privado, seus campos e as permissões do arquivo.',
 PROJECT: 'O checkout precisa apontar para gaucha-gestao-local.',
 DOCKER: 'Docker local inacessível ou container do banco ausente. Confira docker ps e o acesso ao socket.',
 TARGET: 'O banco esperado precisa estar ativo em 127.0.0.1:54322.',
 LOCK: 'Já existe um lock do executor. Confira o PID e siga a recuperação do runbook.',
 LOCK_IO: 'Falha ao criar o lock local.',
 MIGRATION: 'A migration 20261106112635 não consta no ledger local.',
 ROLE: 'Role técnico ausente, em LOGIN, com sessões abertas ou com atributos incompatíveis. Consulte o runbook.',
 BOOTSTRAP: 'Falha ou timeout no bootstrap SQL local. Confira NOLOGIN antes de liberar o lock.',
 SQL_CONNECT: 'O login SQL restrito não conseguiu conectar ou validar sua identidade.',
 SQL_LOGIN_MISMATCH: 'A identidade SQL não corresponde ao login técnico.',
 SQL_ROLE_PRIVILEGED: 'O login SQL tem atributos privilegiados.',
 SQL_MEMBERSHIP: 'O login SQL tem memberships.',
 SQL_CREATE_ACL: 'O login SQL tem permissão CREATE indevida.',
 SQL_GLOBAL_SECRET: 'Configuração global sensível acessível ao login técnico.',
 SQL_DATA_ACL: 'O login SQL tem acesso direto a dados.',
 SQL_FUNCTION_ACL: 'O login SQL tem acesso a funções fora do contrato.',
 CUTOFF: 'Marco persistente inválido ou inacessível. Preserve o arquivo e confira o runbook.',
 RENEW: 'Falha ao renovar a validade do login técnico.',
 CLEANUP: 'Falha ao restaurar NOLOGIN. Lock preservado para recuperação conforme o runbook.',
 DECODER_ISOLATION_FAILED: 'O isolamento do decoder falhou.',
 WORKER_UNAVAILABLE: 'O worker isolado não iniciou ou não respondeu ao protocolo.'
};
const failure=code=>Object.assign(new Error(code),{code});
export function reportDevelopmentThumbnailError(error){
 const code=Object.hasOwn(messages,error?.code)?error.code:'UNKNOWN';
 console.error(`[AUD-IMG-02] Miniaturas indisponíveis (${code}). ${messages[code]??'Falha interna do executor.'} O frontend pode continuar em modo degradado.`);
}

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
function restoreNoLogin(){
 try{sql('alter role audit_derivative_worker nologin;');}
 catch{throw failure('CLEANUP');}
}
// A data do servidor fica no diretório privado do launcher. O lock global serializa a gravação.
export async function activationCutoff(file,readServerTime){
 const parent=await lstat(dirname(file));
 if(!parent.isDirectory()||parent.uid!==process.getuid()||(parent.mode&0o077)!==0)throw failure('CUTOFF');
 const validate=value=>{
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(value)||!Number.isFinite(Date.parse(value)))throw failure('CUTOFF');
  return value;
 };
 try{return validate((await privateFile(file)).trim());}
 catch(error){if(error.code!=='ENOENT')throw failure('CUTOFF');}
 const cutoff=validate(await readServerTime());
 const temporary=file+'.'+randomUUID();
 const handle=await open(temporary,'wx',0o600);
 try{
  try{await handle.writeFile(cutoff+'\n');await handle.sync();}
  finally{await handle.close();}
  await link(temporary,file);
  await unlink(temporary);
  const directory=await open(dirname(file),'r');
  try{await directory.sync();}finally{await directory.close();}
 }catch(error){
  await unlink(temporary).catch(()=>{});
  throw error;
 }
 return cutoff;
}

export async function startDevelopmentThumbnails({signal,onReady=()=>{},file=join(homedir(),'.local/state/gaucha-gestao/audit-thumbnails/launcher.json'),inspection}={}){
 if(signal?.aborted)return;
 let config,signingSecret;
 try{
  config=JSON.parse(await privateFile(file));
  validateDevelopmentConfig(config,inspection);
  signingSecret=(await privateFile(config.signingSecretFile)).trim();
  if(signingSecret.length<32||!config.worker.anonKey||!config.worker.database.password)throw failure('CONFIG');
 }catch{throw failure('CONFIG');}
 if(!(await readFile(root+'supabase/config.toml','utf8')).includes('project_id = "gaucha-gestao-local"'))throw failure('PROJECT');
 let info;
 try{
  info=JSON.parse(docker(['inspect','--format','{"name":{{json .Name}},"running":{{json .State.Running}},"image":{{json .Config.Image}},"ports":{{json .NetworkSettings.Ports}}}','supabase_db_gaucha-gestao-local']));
 }catch{throw failure('DOCKER');}
 if(info.name!=='/supabase_db_gaucha-gestao-local'||!info.running||!info.image.includes('/supabase/postgres:')||
  !info.ports?.['5432/tcp']?.some(p=>p.HostIp==='127.0.0.1'&&p.HostPort==='54322'))throw failure('TARGET');
 if(signal?.aborted)return;
 let handle;
 try{handle=await open(LOCK,'wx',0o600);}
 catch(error){throw failure(error.code==='EEXIST'?'LOCK':'LOCK_IO');}

 let enabled=false,bootstrapUncertain=false,connection;
 try{
  await handle.writeFile(String(process.pid));
  if(signal?.aborted)return;
  // Nunca reparar LOGIN automaticamente. Uma resposta perdida pode ter deixado o COMMIT aplicado.
  bootstrapUncertain=true;
  let status;
  try{
   status=sql(`begin;
    set local statement_timeout='10s';
    select pg_advisory_xact_lock(16482003);
    select case
     when not exists(select 1 from supabase_migrations.schema_migrations where version='20261106112635') then 'MIGRATION'
     when not exists(select 1 from pg_roles r where rolname='audit_derivative_worker' and not rolcanlogin and not rolinherit
      and not(rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls)
      and not exists(select 1 from pg_auth_members m where m.member=r.oid))
      or exists(select 1 from pg_stat_activity where usename='audit_derivative_worker') then 'ROLE'
     else 'OK' end as status \\gset
    select :'status';
    select :'status'='OK' as enable \\gset
    \\if :enable
     do $$begin execute format('alter role audit_derivative_worker login valid until %L',clock_timestamp()+interval '${CREDENTIAL_TTL_SECONDS} seconds');end $$;
    \\endif
    commit;`).trim();
  }catch{throw failure('BOOTSTRAP');}
  // Somente respostas conhecidas permitem retirar o lock.
  if(!['OK','ROLE','MIGRATION'].includes(status))throw failure('BOOTSTRAP');
  bootstrapUncertain=false;
  if(status!=='OK')throw failure(status);
  enabled=true;
  if(signal?.aborted)return;
  try{connection=await restrictedConnection(config.worker.database);}
  catch(error){throw failure(Object.hasOwn(messages,error?.code)?error.code:'SQL_CONNECT');}
  let cutoff;
  try{
   cutoff=await activationCutoff(join(dirname(file),inspection?`activated-after-${inspection}`:'activated-after'),async()=>{
    const {rows:[{cutoff}]}=await connection.query(`select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cutoff`);
    return cutoff;
   });
   const {rows:[{valid}]}=await connection.query('select $1::timestamptz <= clock_timestamp() valid',[cutoff]);
   if(!valid)throw failure('CUTOFF');
  }catch{throw failure('CUTOFF');}
  const scope=Object.freeze({...(inspection?{inspection}:{mode:'global_new'}),createdAfter:cutoff});
  await connection.end();connection=null;
  console.log('Executor local iniciado. Marco persistente UTC:',cutoff);
  await onReady();
  await developmentLoop({scope,signal:signal??new AbortController().signal,renew:async()=>{
   try{sql(`do $$begin if not exists(select 1 from pg_roles where rolname='audit_derivative_worker' and rolcanlogin) then raise exception 'Technical login disabled';end if;execute format('alter role audit_derivative_worker valid until %L',clock_timestamp()+interval '${CREDENTIAL_TTL_SECONDS} seconds');end $$;`);}
   catch{throw failure('RENEW');}
  },run:async queueScope=>{
   try{return await launchRuntime({workerConfig:{...config.worker,expectedEvidence:null,queueScope},signingSecret});}
   catch(error){
    if(Object.hasOwn(messages,error?.code))throw error;
    // Fase/código já sanitizados pelo supervisor one-shot. Nunca logar exceções.
    return {state:'failed',phase:error.phase??'worker',code:/^[A-Z0-9_]{1,32}$/.test(error.code??'')?error.code:'WORKER_FAILED'};
   }
  },onResult:r=>{if(r.state!=='idle')console.log('[AUD-IMG-02]',JSON.stringify(r));}});
 }finally{
  try{await connection?.end();}
  finally{
   try{
    if(enabled){
     bootstrapUncertain=true;
     restoreNoLogin();
     bootstrapUncertain=false;
     console.log('Executor encerrado; login técnico NOLOGIN.');
    }
   }finally{
    await handle.close();
    if(!bootstrapUncertain)await unlink(LOCK);
   }
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
 }catch(error){reportDevelopmentThumbnailError(error);process.exitCode=1;}
}
