import pg from 'pg';
import {FrameChannel} from './audit-derivative-runtime-protocol.mjs';
import { runOneShot, storageApiAdapter, authorizedStorageTransport } from './audit-derivative-worker.mjs';
export async function restrictedConnection(database) {
  // Allowlist: jamais aceitar options/role, URL administrativa ou variáveis PG herdadas.
  const {host,port,database:dbName,user,password,ssl=false}=database;
  if(!host||!dbName||user!=='audit_derivative_worker'||!password)throw new Error('Invalid worker login');
  const client=new pg.Client({host,port,database:dbName,user,password,ssl,application_name:'audit-derivative-worker',
    connectionTimeoutMillis:5000,statement_timeout:15000,lock_timeout:5000});
  await client.connect();
  try {
    const {rows:[identity]}=await client.query(`select session_user=current_user and current_user=$1 as own_login,
      not(rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls) as restricted,
      not exists(select 1 from pg_auth_members where member=r.oid) as no_memberships,
      not has_database_privilege(current_user,current_database(),'CREATE')
      and not has_schema_privilege(current_user,'audit_private','CREATE') as no_create_acl,
      nullif(current_setting('app.settings.jwt_secret',true),'') is null
      and nullif(current_setting('pgrst.jwt_secret',true),'') is null
      and not exists(select 1 from pg_db_role_setting cross join lateral unnest(setconfig) setting
        where setting ~* '(jwt_secret|service_role_key|service_key|postgres_password|password)=' and split_part(setting,'=',2)<>'') as no_global_secrets,
      not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname in ('core','private','audit','audit_private','storage','auth','action_plans','action_plans_private','abc','abc_private','sales_private','room_booking','public')
        and has_schema_privilege(current_user,n.oid,'USAGE') and c.relkind in ('r','v','m','p') and has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) as no_data_acl,
      not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname in ('core','private','audit','audit_private','action_plans','action_plans_private','abc','abc_private','sales_private','room_booking','public')
        and has_schema_privilege(current_user,n.oid,'USAGE') and p.prosecdef and has_function_privilege(current_user,p.oid,'EXECUTE')
        and not(n.nspname='audit_private' and p.proname in ('runtime_derivative_claim','runtime_derivative_prepare','runtime_derivative_complete','runtime_derivative_fail','runtime_derivative_scope'))) as only_runtime_calls
      from pg_roles r where rolname=current_user`,[user]);
    const failures={own_login:'SQL_LOGIN_MISMATCH',restricted:'SQL_ROLE_PRIVILEGED',no_memberships:'SQL_MEMBERSHIP',no_create_acl:'SQL_CREATE_ACL',no_global_secrets:'SQL_GLOBAL_SECRET',no_data_acl:'SQL_DATA_ACL',only_runtime_calls:'SQL_FUNCTION_ACL'};
    for(const [check,code] of Object.entries(failures))if(!identity?.[check])throw Object.assign(new Error('Unsafe SQL identity/configuration'),{code});
    return client;
  } catch(error){await client.end();throw error;}
}
export function runtimeRepository(connection,expectedEvidence=null) {
  const call=async(name,args=[]) => (await connection.query(`select audit_private.runtime_derivative_${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
  return {claim:()=>call('claim',[expectedEvidence]),prepare:(lease,m)=>call('prepare',[lease,JSON.stringify(m)]),complete:lease=>call('complete',[lease]),fail:lease=>call('fail',[lease]),scope:(lease,kind)=>call('scope',[lease,kind])};
}
export async function workerBoot() {
  let initialize,rejectInit,timer;
  const initialized=new Promise((resolve,reject)=>{initialize=resolve;rejectInit=reject;});
  const pending=new Map();let next=0;let configured=false;
  const fail=()=>{clearTimeout(timer);channel.close();process.stdin.destroy();rejectInit(new Error('Supervisor closed'));for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Supervisor closed'));}pending.clear();};
  const channel=new FrameChannel({input:process.stdin,output:process.stdout,onError:fail,onEnd:fail,onFrame:(message,body)=>{
    if(message.type==='init'&&!configured){configured=true;clearTimeout(timer);initialize(message.config);return;}
    if(!['token-result','encode-result'].includes(message.type)){fail();channel.close();return;}
    const request=pending.get(message.id);if(!request||message.type!==request.type+'-result'){fail();channel.close();process.stdin.destroy();return;}
    pending.delete(message.id);clearTimeout(request.timer);
    if(message.error)request.reject(Object.assign(new Error('Supervisor denied'),{code:message.code}));
    else if(message.type==='encode-result')request.resolve({...message.value,bytes:body});
    else request.resolve(message.value);
  }});
  timer=setTimeout(()=>{fail();channel.close();process.stdin.destroy();},5000);
  const config=await initialized;
  const request=(type,payload,body,timeout)=>new Promise((resolve,reject)=>{
    const id=++next;
    const wait=setTimeout(()=>{pending.delete(id);reject(new Error('Supervisor timeout'));fail();channel.close();process.stdin.destroy();},timeout);
    pending.set(id,{resolve,reject,timer:wait,type});
    void channel.send({type,id,...payload},body).catch(()=>{fail();channel.close();});
  });
  return {config,
    requestToken:(lease,kind)=>request('token',{lease,kind},Buffer.alloc(0),5000),
    requestEncode:(lease,args)=>request('encode',{lease,contentType:args.contentType},args.bytes,30000),
    sendResult:result=>channel.send({type:'result',result}),
    close:()=>{clearTimeout(timer);channel.close();process.stdin.destroy();fail();}};
}
export async function executeRuntime(config,requestToken,requestEncode) {
  const connection=await restrictedConnection(config.database);const originalRepository=runtimeRepository(connection,config.expectedEvidence);
  let lease,phase='sql claim',failureCode;const tokens=new Map();
  const step=(name,fn)=>async(...args)=>{phase=name;try{return await fn(...args);}catch(error){failureCode=/^[A-Z0-9_]{1,32}$/.test(error.code??'')?error.code:undefined;throw error;}};
  const repository={
    claim:step('sql claim',async()=>{const job=await originalRepository.claim();lease=job?.lease;return job;}),
    prepare:step('sql prepare',originalRepository.prepare),complete:step('sql complete',originalRepository.complete),fail:originalRepository.fail,
  };
  const api=storageApiAdapter({request:authorizedStorageTransport({origin:config.apiUrl,apiKey:config.anonKey,
    accessToken:async(_signal,{bucket,key})=>{
      const kind=bucket==='audit-checklist-evidence'?'source':'derived';const old=tokens.get(kind);
      if(old&&old.scope.key===key&&old.scope.bucket===bucket&&old.expires*1000>Date.now()+5000)return old.token;
      const issued=await requestToken(lease,kind);
      if(issued.scope.key!==key||issued.scope.bucket!==bucket)throw new Error('Unexpected token scope');
      tokens.set(kind,issued);return issued.token;
    }})});
  const storage={readOriginal:step('read source',api.readOriginal),putDerived:step('upload derived',api.putDerived),readDerived:step('read derived',api.readDerived)};
  const encoder={encode:step('encode',async args=>{if(!requestEncode)throw new Error('Encoder channel missing');return requestEncode(lease,args);})};
  try{const result=await runOneShot({repository,storage,encoder});return result.state==='failed'?{...result,phase,code:failureCode}:result;}
  finally{tokens.clear();await connection.end();}
}
