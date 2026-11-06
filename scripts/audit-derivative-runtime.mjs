// Emissor e supervisor ONE-SHOT confiável. Nenhum servidor/timer é criado.
import { createHmac,randomUUID,createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {FrameChannel} from './audit-derivative-runtime-protocol.mjs';
import {isolatedEncoder} from './audit-derivative-encoder.mjs';
import {storageApiAdapter,authorizedStorageTransport} from './audit-derivative-worker.mjs';
import {DERIVATIVE_MAX_ORIGINAL_BYTES,DERIVATIVE_MAX_OUTPUT_BYTES,DERIVATIVE_ENCODER_VERSION} from './audit-derivative-protocol.mjs';
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
// Uma única imagem, escopo fresco e bytes conferidos contra o objeto autorizado.
export function oneShotEncoder({connection,readSource,encode=isolatedEncoder.encode}) {
  const repository=runtimeRepository(connection);let used=false;
  return async({lease,contentType},bytes,authorizedLease,signal)=>{
    if(used||!authorizedLease||lease!==authorizedLease||!Buffer.isBuffer(bytes)||bytes.length<1||
      bytes.length>DERIVATIVE_MAX_ORIGINAL_BYTES||!['image/jpeg','image/png'].includes(contentType))throw new Error('Encode denied');
    used=true;
    const scope=await repository.scope(lease,'source');
    if(scope.lease!==lease||scope.login!=='audit_derivative_worker'||scope.bucket!=='audit-checklist-evidence'||
      !scope.key||Number(scope.bytes)!==bytes.length||scope.mime!==contentType)throw new Error('Encode scope denied');
    signal?.throwIfAborted();
    const original=await readSource(scope,signal);
    const digest=value=>createHash('sha256').update(value).digest('hex');
    if(!Buffer.isBuffer(original)||original.length!==bytes.length||digest(original)!==digest(bytes))throw new Error('Encode source mismatch');
    signal?.throwIfAborted();
    const result=await encode({bytes,contentType,version:DERIVATIVE_ENCODER_VERSION},{signal});
    signal?.throwIfAborted();
    if(!Buffer.isBuffer(result?.bytes)||result.bytes.length<1||result.bytes.length>DERIVATIVE_MAX_OUTPUT_BYTES||result.bytes.length>=bytes.length||
      !['image/jpeg','image/png'].includes(result.mime)||!Number.isInteger(result.width)||!Number.isInteger(result.height)||
      result.width<1||result.width>480||result.height<1||result.height>480)throw new Error('Invalid encoder output');
    return {bytes:result.bytes,mime:result.mime,width:result.width,height:result.height};
  };
}
export async function launchRuntime({workerConfig,signingSecret,probe=false}) {
  if(typeof signingSecret!=='string'||signingSecret.length<32)throw new Error('Invalid issuer secret');
  // O emissor consulta escopo com O MESMO login mínimo; nenhuma sessão administrativa.
  const connection=await restrictedConnection(workerConfig.database);
  const issue=leaseIssuer({connection,signingSecret});
  const abort=new AbortController();
  const encode=oneShotEncoder({connection,readSource:async(scope,signal)=>{
    const issued=await issue({lease:scope.lease,kind:'source'});
    const storage=storageApiAdapter({request:authorizedStorageTransport({origin:workerConfig.apiUrl,apiKey:workerConfig.anonKey,signal,
      accessToken:async()=>{signal.throwIfAborted();return issued.token;}})});
    return storage.readOriginal(scope.key,Number(scope.bytes),scope.mime);
  }});
  const entry=probe?'audit-derivative-runtime-probe.mjs':'audit-derivative-runtime-worker.mjs';
  const files=['audit-derivative-protocol.mjs','audit-derivative-worker.mjs','audit-derivative-encoder.mjs',
    'audit-derivative-runtime-protocol.mjs','audit-derivative-runtime-client.mjs',entry];
  const args=['--unshare-all','--share-net','--die-with-parent','--new-session','--cap-drop','ALL',
    '--ro-bind','/usr','/usr','--ro-bind','/lib','/lib','--ro-bind','/lib64','/lib64','--proc','/proc','--dev','/dev','--tmpfs','/tmp',
    '--dir','/app','--dir','/app/scripts','--dir','/runtime','--ro-bind',process.execPath,'/runtime/node',
    '--ro-bind',modules,'/app/node_modules'];
  for(const file of files)args.push('--ro-bind',scripts+file,'/app/scripts/'+file);
  args.push('--chdir','/app','/runtime/node','--max-old-space-size=96','/app/scripts/'+entry);
  const child=spawn('/usr/bin/bwrap',args,{env:{PATH:'/usr/bin:/bin'},stdio:['pipe','pipe','ignore']});
  let result,authorizedLease;let active=false;let requests=0;
  const stop=()=>{abort.abort();child.kill('SIGKILL');child.stdin.destroy();child.stdout.destroy();};
  const timer=setTimeout(stop,110_000);
  const finished=new Promise((resolve,reject)=>{
    child.on('error',()=>{stop();reject(new Error('Worker unavailable'));});
    child.on('close',code=>{abort.abort();if(code===0&&result)resolve(result);else reject(Object.assign(new Error('Isolated worker failed'),{phase:result?.phase,code:result?.code}));});
  });
  void finished.catch(()=>{}); // O envio inicial também pode falhar antes do await.
  const channel=new FrameChannel({input:child.stdout,output:child.stdin,onError:stop,onEnd:()=>{},onFrame:(m,body)=>{
    if(m.type==='result'){
      if(active||result||!['idle','ready','stale','failed','orphan',...(probe?['probed']:[])].includes(m.result?.state)){stop();return;}
      result={state:m.result.state};
      if(probe)for(const flag of ['sqlLogin','sqlDenials','isolated','exactKey','expiry','renewal','closedLease'])result[flag]=m.result[flag]===true;
      if(/^[a-zA-Z0-9 /:.-]{1,100}$/.test(m.result.phase??''))result.phase=m.result.phase;
      if(/^[A-Z0-9_]{1,32}$/.test(m.result.code??''))result.code=m.result.code;
      return;
    }
    if(result||!['token','encode'].includes(m.type)||active||++requests>34){stop();return;}
    active=true;
    const operation=m.type==='token'?issue({lease:m.lease,kind:m.kind}).then(value=>{
      authorizedLease=value.scope.lease;return {message:{type:'token-result',id:m.id,value}};
    }):encode(m,body,authorizedLease,abort.signal).then(({bytes,...value})=>({message:{type:'encode-result',id:m.id,value},body:bytes}));
    void operation.catch(error=>({message:{type:m.type+'-result',id:m.id,error:true,
      code:/^DECODER_[A-Z_]{1,24}$/.test(error.code??'')?error.code:'REQUEST_DENIED'}}))
      .then(reply=>{active=false;if(!abort.signal.aborted)return channel.send(reply.message,reply.body);})
      .catch(stop);
  }});
  // Allowlist: nunca transmitir o segredo de assinatura ou ambiente do supervisor.
  const {host,port,database,user,password,ssl}=workerConfig.database;
  try{
    await channel.send({type:'init',config:{apiUrl:workerConfig.apiUrl,anonKey:workerConfig.anonKey,
      database:{host,port,database,user,password,ssl},expectedEvidence:workerConfig.expectedEvidence,
      ...(workerConfig.queueScope?{queueScope:{mode:workerConfig.queueScope.mode,inspection:workerConfig.queueScope.inspection,createdAfter:workerConfig.queueScope.createdAfter}}:{}),...(probe?{probe:workerConfig.probe}:{})}});
    return await finished;
  }finally{clearTimeout(timer);channel.close();stop();await connection.end();}
}
