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
const sqlSave=(row)=>({text:"select public.announcements_notice_save($1,$2,'Edição concorrente','Texto seguro','information','info',1,null,null,'published',true) result",values:[row.id,row.version]});
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
 for(const changes of [{p_category:'critical',p_tone:'success'},{p_message:'<script>alert(1)</script>'},{p_starts_at:'2030-01-01T00:00:00Z',p_ends_at:'2029-01-01T00:00:00Z'},{p_priority:10001}])denied(await rpc('manager','notice_save',{...input,...changes}),'23514');
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
 phase='revogação já bloqueada precede escrita';
 await a.query('begin');await a.query('update core.user_role_assignments set active=false where user_id=$1',[users.manager]);
 await begin(b);const stale=b.query(sqlSave(winner)).then(value=>({value}),error=>({error}));
 await blocked(pids.find(p=>p.application_name==='gg10-b').pid,pids.find(p=>p.application_name==='gg10-a').pid);
 await a.query('commit');assert.equal((await stale).error?.code,'42501');await b.query('rollback');
 console.log('PASS GG-10: Auth/JWT/API reais, ACL/RLS, gestor/admin, negativas, histórico, datas/cores, agendamento/expiração, CAS e revogação concorrentes.');
}catch(error){console.error(`GG-10 falhou na fase: ${phase}`);throw error;}
finally{await Promise.allSettled([a.query('rollback'),b.query('rollback')]);await Promise.allSettled([db.end(),a.end(),b.end()]);}
