import pg from 'pg';
import { createInterface } from 'node:readline';
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
        where n.nspname in ('core','private','audit','audit_private','storage','auth','action_plans','action_plans_private','abc','abc_private','sales_private','room_booking')
        and has_schema_privilege(current_user,n.oid,'USAGE') and c.relkind in ('r','v','m','p') and has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) as no_data_acl,
      not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname in ('core','private','audit','audit_private','action_plans','action_plans_private','abc','abc_private','sales_private','room_booking')
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
  let initialize;
  const initialized=new Promise(resolve=>{initialize=resolve;});
  const pending=new Map();let next=0;
  const lines=createInterface({input:process.stdin});
  lines.on('line',line=>{
    try{
      if(line.length>8192)throw new Error('protocol');
      const message=JSON.parse(line);
      if(message.type==='init'){initialize(message.config);initialize=()=>{};}
      else if(message.type==='token-result'){
        const request=pending.get(message.id);if(!request)return;pending.delete(message.id);clearTimeout(request.timer);
        if(message.error)request.reject(new Error('Token denied'));else request.resolve(message.value);
      }
    }catch{/* mensagem inválida não concede token */}
  });
  const config=await initialized;
  const requestToken=(lease,kind)=>new Promise((resolve,reject)=>{
    const id=++next;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Issuer timeout'));},5000);
    pending.set(id,{resolve,reject,timer});
    process.stdout.write(JSON.stringify({type:'token',id,lease,kind})+'\n');
  });
  return {config,requestToken,close:()=>{lines.close();process.stdin.destroy();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('closed'));}pending.clear();}};
}
export async function executeRuntime(config,requestToken) {
  const connection=await restrictedConnection(config.database);const repository=runtimeRepository(connection,config.expectedEvidence);
  let lease;const claim=repository.claim;repository.claim=async()=>{const job=await claim();lease=job?.lease;return job;};
  const tokens=new Map();
  const storage=storageApiAdapter({request:authorizedStorageTransport({origin:config.apiUrl,apiKey:config.anonKey,
    accessToken:async(_signal,{bucket,key})=>{
      const kind=bucket==='audit-checklist-evidence'?'source':'derived';
      const old=tokens.get(kind);
      if(old&&old.scope.key===key&&old.scope.bucket===bucket&&old.expires*1000>Date.now()+5000)return old.token;
      const issued=await requestToken(lease,kind);
      if(issued.scope.key!==key||issued.scope.bucket!==bucket)throw new Error('Unexpected token scope');
      tokens.set(kind,issued);return issued.token;
    }})});
  try{return await runOneShot({repository,storage});}finally{tokens.clear();await connection.end();}
}
