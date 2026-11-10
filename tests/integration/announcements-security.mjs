// Executar somente no stack descartável já criado pelo action-plans-integration.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
assert.equal(process.env.GITHUB_ACTIONS,'true','Ensaio exclusivo do runtime descartável de CI; não executar em local persistente');
assert.equal(process.env.CI,'true');
assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');
const config=JSON.parse(execFileSync('npx',['--yes','supabase@2.117.0','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
for(const url of [config.API_URL,config.DB_URL]) assert.equal(new URL(url).hostname,'127.0.0.1');
const db=new pg.Client({connectionString:config.DB_URL});
const a=new pg.Client({connectionString:config.DB_URL,application_name:'gg10-a'});
const b=new pg.Client({connectionString:config.DB_URL,application_name:'gg10-b'});
const users={}, clients={}, tag=randomUUID(), password=`Synthetic-${randomUUID()}-aA1!`;
const input={p_id:null,p_expected_version:null,p_title:'Aviso sintético CI',p_message:'Mensagem sintética CI.',p_category:'information',p_tone:'info',p_priority:0,p_starts_at:null,p_ends_at:null,p_state:'draft',p_show_feedback:true};
function must(result){assert.equal(result.error?.code??(result.error?'error':null),null,'RPC deve confirmar sucesso');return result.data;}
function denied(result,code='42501'){assert.equal(result.error?.code,code);assert.equal(result.data,null);}
const rpc=(name,fn,args={})=>clients[name].schema('public').rpc(`announcements_${fn}`,args);
const feedback=(name,fn,args)=>clients[name].schema('public').rpc(`feedback_${fn}`,args);
const bucket=(name)=>clients[name].storage.from('feedback-attachments');
async function user(name,role){
 const response=await fetch(`${config.API_URL}/auth/v1/admin/users`,{method:'POST',headers:{apikey:config.SERVICE_ROLE_KEY,Authorization:`Bearer ${config.SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({email:`gg10-${name}-${tag}@example.test`,password,email_confirm:true})});
 assert.equal(response.status,200);users[name]=(await response.json()).id;
 clients[name]=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 must(await clients[name].auth.signInWithPassword({email:`gg10-${name}-${tag}@example.test`,password}));
 if(role) await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type) select $1,id,'global' from core.roles where key=$2",[users[name],role]);
}
async function blocked(waiter,blocker){
 const until=Date.now()+5000;
 while(Date.now()<until){const result=await db.query('select $2::int=any(pg_blocking_pids($1::int)) blocked',[waiter,blocker]);if(result.rows[0].blocked)return;await new Promise(resolve=>setTimeout(resolve,25));}
 assert.fail('Bloqueio concorrente não observado');
}
const sqlSave=(row)=>({text:"select public.announcements_notice_save($1,$2,'Edição concorrente','Texto seguro','information','info',1,'2098-01-01T00:00:00Z','2098-01-02T00:00:00Z','published',true) result",values:[row.id,row.version]});
async function begin(connection){await connection.query('begin');await connection.query("set local statement_timeout='12s'");await connection.query("select set_config('request.jwt.claim.sub',$1,true)",[users.manager]);await connection.query('set local role authenticated');}
let phase='setup';
try{
 await Promise.all([db.connect(),a.connect(),b.connect()]);
 for(const [name,role] of [['admin','platform_administrator'],['manager','announcement_manager'],['common',null],['inactive','announcement_manager'],['revoked','announcement_manager']])await user(name,role);
 await db.query('update core.profiles set active=false where id=$1',[users.inactive]);
 await db.query('update core.user_role_assignments set active=false where user_id=$1',[users.revoked]);
 clients.anon=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false}});
 phase='negativas JWT/API';
 for(const name of ['anon','common','inactive','revoked']){
  denied(await rpc(name,'manage_list'));denied(await rpc(name,'notice_save',input));denied(await rpc(name,'notice_history',{p_id:randomUUID()}));
 }
 denied(await rpc('inactive','published'));
 for(const name of ['admin','manager']){
  const draft=must(await rpc(name,'notice_save',input));assert.equal(draft.status,'draft');
  const published=must(await rpc(name,'notice_save',{...input,p_id:draft.id,p_expected_version:1,p_state:'published'}));assert.equal(published.status,'active');
  const feed=must(await rpc('common','published'));assert.ok(feed.announcements.some(n=>n.id===draft.id));
  const inactive=must(await rpc(name,'notice_save',{...input,p_id:draft.id,p_expected_version:2,p_state:'inactive'}));assert.equal(inactive.status,'inactive');
  assert.equal(must(await rpc(name,'notice_history',{p_id:draft.id})).total,3);
 }
 phase='schema privado, revogação atual e D5-B';
 for(const name of ['common','manager']){
  for(const operation of ['select','insert','update','delete']){
   const table=clients[name].schema('announcements').from('notices');
   const query=operation==='select'?table.select('*'):operation==='insert'?table.insert({title:'Intrusão'}):operation==='update'?table.update({state:'published'}).eq('id',randomUUID()):table.delete().eq('id',randomUUID());
   const result=await query;assert.ok(result.error);assert.ok(result.status>=400&&result.status<500);assert.equal(result.data,null);
  }
 }
 const access=must(await clients.manager.schema('core').rpc('my_access'));assert.deepEqual(access.map(g=>g.permission),['announcements.notice.manage']);
 assert.equal((await db.query("select count(*)::int n from core.role_permissions rp join core.roles r on r.id=rp.role_id where r.key in ('platform_administrator','announcement_manager') and rp.permission_key='room_booking.manage'")).rows[0].n,0);
 await db.query('update core.user_role_assignments set active=false where user_id=$1',[users.manager]);denied(await rpc('manager','notice_save',input));
 await db.query('update core.user_role_assignments set active=true where user_id=$1',[users.manager]);
 for(const changes of [{p_tone:'invalid'},{p_message:'<script>alert(1)</script>'},{p_starts_at:'2030-01-01T00:00:00Z',p_ends_at:'2029-01-01T00:00:00Z'}])denied(await rpc('manager','notice_save',{...input,...changes}),'23514');
 phase='leitura sem rascunho/futuro e fronteiras reais';
 const secret=must(await rpc('manager','notice_save',{...input,p_title:'Rascunho invisível'}));
 const future=must(await rpc('manager','notice_save',{...input,p_title:'Futuro invisível',p_state:'published',p_starts_at:new Date(Date.now()+1800).toISOString(),p_ends_at:new Date(Date.now()+4000).toISOString()}));
 const before=must(await rpc('common','published'));assert.ok(!JSON.stringify(before).includes('invisível'));assert.ok(before.nextRefreshAt);
 const deadline=Date.now()+3500;let active=false;
 while(Date.now()<deadline){if(must(await rpc('common','published')).announcements.some(n=>n.id===future.id)){active=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(active,'Agendamento ativa pelo relógio SQL');
 await new Promise(resolve=>setTimeout(resolve,2300));assert.ok(!must(await rpc('common','published')).announcements.some(n=>n.id===future.id));
 assert.ok(!must(await rpc('common','published')).announcements.some(n=>n.id===secret.id));
 phase='duas sessões: versão esperada e histórico';
 const entry=must(await rpc('manager','notice_save',input));
 await begin(a);await begin(b);
 const winner=(await a.query(sqlSave(entry))).rows[0].result;
 const pending=b.query(sqlSave(entry)).then(value=>({value}),error=>({error}));
 const pids=(await db.query("select pid,application_name from pg_stat_activity where application_name in ('gg10-a','gg10-b')")).rows;
 await blocked(pids.find(p=>p.application_name==='gg10-b').pid,pids.find(p=>p.application_name==='gg10-a').pid);
 await a.query('commit');assert.equal((await pending).error?.code,'40001');await b.query('rollback');assert.equal(winner.version,2);
 assert.equal(must(await rpc('manager','notice_history',{p_id:entry.id})).total,2);
 phase='publicações concorrentes com períodos sobrepostos';
 const competing=must(await rpc('manager','notice_save',input));
 const blocking=must(await rpc('manager','notice_save',input));
 const scheduledSave=(row)=>({
  text:"select public.announcements_notice_save($1,$2,'Concorrência sintética','Texto sintético','maintenance','info',0,'2099-06-01T00:00:00Z','2099-06-02T00:00:00Z','published',true)",
  values:[row.id,row.version],
 });
 await begin(a);await begin(b);
 await a.query(scheduledSave(blocking));
 const conflict=b.query(scheduledSave(competing)).then(value=>({value}),error=>({error}));
 await blocked(pids.find(p=>p.application_name==='gg10-b').pid,pids.find(p=>p.application_name==='gg10-a').pid);
 await a.query('commit');assert.equal((await conflict).error?.code,'23P01');await b.query('rollback');
 const adjacent=must(await rpc('manager','notice_save',{...input,p_state:'published',p_starts_at:'2099-06-02T00:00:00Z',p_ends_at:'2099-06-03T00:00:00Z'}));
 assert.equal(adjacent.status,'scheduled');
 phase='revogação já bloqueada precede escrita';
 await a.query('begin');await a.query('update core.user_role_assignments set active=false where user_id=$1',[users.manager]);
 await begin(b);const stale=b.query(sqlSave(winner)).then(value=>({value}),error=>({error}));
 await blocked(pids.find(p=>p.application_name==='gg10-b').pid,pids.find(p=>p.application_name==='gg10-a').pid);
 await a.query('commit');assert.equal((await stale).error?.code,'42501');await b.query('rollback');
 phase='GG-11: Auth, PostgREST, Storage privado e revogação';
 const filters={p_kind:null,p_module:null,p_from:null,p_until:null,p_before:null,p_before_id:null};
 const reportId=randomUUID();
 const payload={p_id:reportId,p_kind:'problem',p_module:'rooms',p_description:'Relato exclusivamente sintético para CI.',
  p_origin:'home',p_app_version:'ci-test',p_extension:'png'};
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jiiUAAAAASUVORK5CYII=','base64');
 const key=`${reportId}.png`;
 denied(await feedback('anon','prepare',payload));
 denied(await feedback('inactive','prepare',payload));
 assert.equal(must(await feedback('common','prepare',payload)).attachmentKey,key);
 denied(await feedback('common','receive',{p_id:reportId}),'P0002');
 denied(await feedback('manager','prepare',payload));
 denied(await feedback('manager','receive',{p_id:reportId}));
 assert.ok((await bucket('manager').upload(key,png,{contentType:'image/png'})).error);
 assert.ok((await bucket('common').upload(`${reportId}.jpg`,png,{contentType:'image/png'})).error);
 assert.ok((await bucket('common').upload(key,png,{contentType:'text/html'})).error);
 assert.ok((await bucket('common').upload(key,Buffer.alloc(5242881),{contentType:'image/png'})).error);
 must(await bucket('common').upload(key,png,{contentType:'image/png',upsert:false}));
 denied(await feedback('admin','detail',{p_id:reportId}),'P0002');
 assert.ok((await bucket('admin').download(key)).error);
 const receipt=must(await feedback('common','receive',{p_id:reportId}));
 assert.equal(receipt.id,reportId);assert.ok(receipt.receivedAt);
 assert.deepEqual(must(await feedback('common','receive',{p_id:reportId})),receipt);
 assert.equal(must(await feedback('common','prepare',payload)).receivedAt,receipt.receivedAt);
 assert.equal((await db.query("select count(*)::int n from core.system_audit_log where module='feedback' and entity_id=$1",[reportId])).rows[0].n,1);
 for(const name of ['anon','common','manager','inactive','revoked']){
  denied(await feedback(name,'list',filters));
  denied(await feedback(name,'detail',{p_id:reportId}));
  assert.ok((await bucket(name).download(key)).error);
 }
 assert.equal(must(await feedback('admin','list',{...filters,p_module:'rooms'}))[0].id,reportId);
 assert.equal(must(await feedback('admin','list',{...filters,p_kind:'suggestion'})).length,0);
 assert.equal(must(await feedback('admin','detail',{p_id:reportId})).attachment_key,key);
 assert.deepEqual(Buffer.from(await must(await bucket('admin').download(key)).arrayBuffer()),png);
 assert.ok((await bucket('admin').createSignedUrl(key,60)).error);
 assert.deepEqual(must(await bucket('admin').list()),[]);
 assert.ok((await bucket('common').upload(key,png,{contentType:'image/png',upsert:true})).error);
 assert.ok(!(await fetch(`${config.API_URL}/storage/v1/object/public/feedback-attachments/${key}`)).ok);
 await db.query('update core.user_role_assignments set active=false where user_id=$1',[users.admin]);
 denied(await feedback('admin','detail',{p_id:reportId}));
 assert.ok((await bucket('admin').download(key)).error);
 await db.query('delete from auth.sessions where user_id=$1',[users.common]);
 denied(await feedback('common','prepare',{...payload,p_id:randomUUID()}));
 console.log('PASS GG-11: Auth, RPC, persistência idempotente, isolamento de dados, Storage, revogação de papel e sessão.');
 console.log('PASS GG-10: Auth/JWT/API reais, ACL/RLS, gestor/admin, negativas, histórico, datas/cores, agendamento/expiração, CAS e revogação concorrentes.');
}catch(error){console.error(`GG-10 falhou na fase: ${phase}`);throw error;}
finally{await Promise.allSettled([a.query('rollback'),b.query('rollback')]);await Promise.allSettled([db.end(),a.end(),b.end()]);}
