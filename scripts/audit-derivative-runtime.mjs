// Emissor e supervisor ONE-SHOT confiável. Nenhum servidor/timer é criado.
import { createHmac,randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { restrictedConnection,runtimeRepository } from './audit-derivative-runtime-client.mjs';
export const TECHNICAL_TOKEN_TTL=30;
const scripts=fileURLToPath(new URL('./',import.meta.url));
const modules=fileURLToPath(new URL('../node_modules',import.meta.url));
export function leaseIssuer({connection,signingSecret}) {
  if(typeof signingSecret!=='string'||signingSecret.length<32)throw new Error('Invalid issuer secret');
  const repository=runtimeRepository(connection);let boundLease;let issued=0;
  return async({lease,kind})=>{
    if(++issued>32||!['source','derived'].includes(kind)||(boundLease&&lease!==boundLease))throw new Error('Token denied');
    const scope=await repository.scope(lease,kind);
    if(scope.lease!==lease||scope.login!=='audit_derivative_worker'||scope.bucket!==(kind==='source'?'audit-checklist-evidence':'audit-evidence-thumbnails')||!scope.key)throw new Error('Scope denied');
    boundLease=lease;
    const now=Number(scope.server_now),exp=Math.min(now+TECHNICAL_TOKEN_TTL,Number(scope.lease_expires));
    if(!Number.isSafeInteger(now)||!Number.isSafeInteger(exp)||exp<=now+1)throw new Error('Lease ending');
    const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const body=Buffer.from(JSON.stringify({role:'audit_derivative_storage_runtime',iss:'supabase',aud:'authenticated',sub:lease,
      iat:now,exp,jti:randomUUID(),audit_derivative_lease:lease,audit_derivative_login:scope.login,
      audit_derivative_bucket:scope.bucket,audit_derivative_key:scope.key})).toString('base64url');
    const signature=createHmac('sha256',signingSecret).update(`${head}.${body}`).digest('base64url');
    return {token:`${head}.${body}.${signature}`,expires:exp,scope};
  };
}
export async function launchRuntime({workerConfig,signingSecret,probe=false}) {
  if(typeof signingSecret!=='string'||signingSecret.length<32)throw new Error('Invalid issuer secret');
  // O emissor consulta escopo com O MESMO login mínimo; não há conexão administrativa aqui.
  const connection=await restrictedConnection(workerConfig.database);
  const issue=leaseIssuer({connection,signingSecret});
  const entry=probe?'audit-derivative-runtime-probe.mjs':'audit-derivative-runtime-worker.mjs';
  const files=['audit-derivative-protocol.mjs','audit-derivative-worker.mjs','audit-derivative-encoder.mjs','audit-derivative-decoder.mjs',
    'audit-derivative-runtime-client.mjs',entry];
  const args=['--unshare-all','--share-net','--die-with-parent','--new-session','--cap-drop','ALL',
    '--ro-bind','/usr','/usr','--ro-bind','/lib','/lib','--ro-bind','/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp',
    '--dir','/app','--dir','/app/scripts','--dir','/runtime','--ro-bind',process.execPath,'/runtime/node',
    '--ro-bind',modules,'/app/node_modules'];
  for(const file of files)args.push('--ro-bind',scripts+file,'/app/scripts/'+file);
  args.push('--chdir','/app','/runtime/node','--max-old-space-size=96','/app/scripts/'+entry);
  const child=spawn('/usr/bin/bwrap',args,{env:{PATH:'/usr/bin:/bin'},stdio:['pipe','pipe','ignore']});
  const lines=createInterface({input:child.stdout});let result;let active=false;let requests=0;
  const timer=setTimeout(()=>child.kill('SIGKILL'),110_000);
  const finished=new Promise((resolve,reject)=>{
    child.on('error',reject);child.on('close',code=>code===0&&result?resolve(result):reject(Object.assign(new Error('Isolated worker failed'),{phase:result?.phase,code:result?.code})));
  });
  lines.on('line',line=>{
    if(line.length>8192){child.kill('SIGKILL');return;}
    let m;try{m=JSON.parse(line);}catch{child.kill('SIGKILL');return;}
    if(m.type==='result'){
      if(!['idle','ready','stale','failed','orphan',...(probe?['probed']:[])].includes(m.result?.state)){child.kill('SIGKILL');return;}
      result={state:m.result.state};
      if(probe){
        for(const flag of ['sqlLogin','sqlDenials','isolated','exactKey','expiry','renewal','closedLease'])result[flag]=m.result[flag]===true;
        if(/^[a-zA-Z0-9 /:.-]{1,100}$/.test(m.result.phase??''))result.phase=m.result.phase;
        if(/^[A-Z0-9_]{1,32}$/.test(m.result.code??''))result.code=m.result.code;
      }
      return;
    }
    if(m.type!=='token'||active||++requests>32){child.kill('SIGKILL');return;}
    active=true;
    void issue({lease:m.lease,kind:m.kind}).then(value=>({type:'token-result',id:m.id,value}),()=>({type:'token-result',id:m.id,error:true}))
      .then(reply=>{if(!child.stdin.destroyed)child.stdin.write(JSON.stringify(reply)+'\n');})
      .finally(()=>{active=false;});
  });
  child.stdin.on('error',()=>{});
  // Allowlist de configuração: mesmo um chamador que passe config com secrets não os transmite.
  const {host,port,database,user,password,ssl}=workerConfig.database;
  child.stdin.write(JSON.stringify({type:'init',config:{apiUrl:workerConfig.apiUrl,anonKey:workerConfig.anonKey,
    database:{host,port,database,user,password,ssl},expectedEvidence:workerConfig.expectedEvidence,...(probe?{probe:workerConfig.probe}:{} )}})+'\n');
  try{return await finished;}finally{clearTimeout(timer);lines.close();if(child.exitCode===null)child.kill('SIGKILL');await connection.end();}
}
