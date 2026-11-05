// Opt-in para o Supabase persistente autorizado do mantenedor; nunca aplica migrations/reset.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import pg from 'pg';
import {createClient} from '@supabase/supabase-js';
import {chromium,expect} from 'playwright/test';
import {salesLocalWeb} from './sales-local-web.mjs';
assert.equal(process.env.GG10_LOCAL_TEST,'gaucha-gestao-local','Exige opt-in explícito do ambiente local autorizado');
assert.ok(process.env.GG10_SUPABASE_CLI,'Informe CLI existente');
const container='supabase_db_gaucha-gestao-local';
const info=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(info.Name,`/${container}`);assert.ok(info.State.Running);
assert.ok(info.Config.Image.includes('supabase/postgres:')); 
assert.ok(info.NetworkSettings.Ports['5432/tcp'].some(p=>p.HostIp==='127.0.0.1'&&p.HostPort==='54322'));
const config=JSON.parse(execFileSync(process.env.GG10_SUPABASE_CLI,['status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
assert.equal(config.API_URL,'http://127.0.0.1:54321');assert.equal(new URL(config.DB_URL).hostname,'127.0.0.1');assert.equal(new URL(config.DB_URL).port,'54322');assert.equal(new URL(config.DB_URL).pathname,'/postgres');
const db=new pg.Client({connectionString:config.DB_URL});
const directory=process.env.GG10_LOCAL_ARTIFACT_DIR??'tmp/gg10-real-local';mkdirSync(directory,{recursive:true,mode:0o700});
const resume=process.env.GG10_LOCAL_RECEIPT?JSON.parse(readFileSync(process.env.GG10_LOCAL_RECEIPT,"utf8")):null;
const tag=resume?.tag??`GG10-LOCAL-${randomUUID().slice(0,8)}`;
assert.match(tag,/^GG10-LOCAL-[a-f0-9]{8}$/);
const checks=[],users={},notices=[],clients=[];
const manifest={tag,users:[],assignments:[],notices,checks,cleanup:'Pendente',phase:'setup'};
const receipt=()=>writeFileSync(`${directory}/${tag}-manifest.json`,JSON.stringify(manifest,null,2),{mode:0o600});
const record=(label)=>{checks.push(label);receipt();console.log(`PASS ${label}`);};
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const must=(result,label='RPC')=>{assert.equal(result.error?.code??(result.error?'error':null),null,label);return result.data;};
const denied=(result,code='42501')=>{assert.equal(result.error?.code,code);assert.equal(result.data,null);};
const rpc=(name,fn,args={})=>users[name].client.schema('public').rpc(`announcements_${fn}`,args);
const base={p_id:null,p_expected_version:null,p_title:`${tag} verificação`,p_message:'Conteúdo exclusivamente sintético de desenvolvimento local.',p_category:'information',p_tone:'info',p_priority:0,p_starts_at:null,p_ends_at:null,p_state:'draft',p_show_feedback:true};
async function save(name,changes={}){const row=must(await rpc(name,'notice_save',{...base,...changes}));if(!notices.includes(row.id))notices.push(row.id);receipt();return row;}
async function edit(name,row,changes={}){return save(name,{p_id:row.id,p_expected_version:row.version,...changes});}
async function auth(name,role){
 const email=`${tag}-${name}@example.test`.toLowerCase(),password=`Synthetic-${randomUUID()}-aA1!`;
 let id;
 const previous=resume?.users.find(u=>u.email===email);
 if(previous){
   const proof=(await db.query('select id,email from auth.users where id=$1',[previous.id])).rows[0];
   assert.equal(proof?.email,email,'Reutilizar somente identidade sintética comprovada');
   const response=await fetch(`${config.API_URL}/auth/v1/admin/users/${previous.id}`,{method:'PUT',headers:{apikey:config.SERVICE_ROLE_KEY,Authorization:`Bearer ${config.SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({password})});
   assert.equal(response.status,200);id=previous.id;await db.query('update core.profiles set active=true where id=$1',[id]);
 }else{
   const response=await fetch(`${config.API_URL}/auth/v1/admin/users`,{method:'POST',headers:{apikey:config.SERVICE_ROLE_KEY,Authorization:`Bearer ${config.SERVICE_ROLE_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{display_name:`GG-10 Local ${name}`}})});
   assert.equal(response.status,200,'Criar identidade sintética no Auth local');id=(await response.json()).id;
 }
 const client=createClient(config.API_URL,config.PUBLISHABLE_KEY??config.ANON_KEY,opts);clients.push(client);users[name]={id,email,password,client};manifest.users.push({id,email});receipt();
 must(await client.auth.signInWithPassword({email,password}),'Auth real');
 if(role){
  const reused=resume?(await db.query("select a.id from core.user_role_assignments a join core.roles r on r.id=a.role_id where a.id=any($1::uuid[]) and a.user_id=$2 and r.key=$3 and a.scope_type='global'",[resume.assignments,id,role])).rows[0]:null;
  if(reused){await db.query('update core.user_role_assignments set active=true where id=$1',[reused.id]);manifest.assignments.push(reused.id);receipt();return;}
  const assignment=(await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type) select $1,id,'global' from core.roles where key=$2 returning id",[id,role])).rows[0];manifest.assignments.push(assignment.id);receipt();}
}
let browser,server,debugPage;
const pageErrors=[];
try{
 await db.connect();assert.ok((await db.query("select pg_try_advisory_lock(hashtext('gg10-local-fixtures')) locked")).rows[0].locked);
 assert.equal((await db.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20261105131548'")).rows[0].n,1,'Aplicar migration autorizada antes do ensaio');
 manifest.before={profiles:(await db.query('select count(*)::int n from core.profiles')).rows[0].n,notices:(await db.query('select count(*)::int n from announcements.notices')).rows[0].n};receipt();
 for(const [name,role] of [['admin','platform_administrator'],['manager','announcement_manager'],['common',null]])await auth(name,role);
 const anon=createClient(config.API_URL,config.PUBLISHABLE_KEY??config.ANON_KEY,opts);clients.push(anon);
 for(const fn of ['published','manage_list'])denied(await anon.schema('public').rpc(`announcements_${fn}`));
 for(const fn of ['manage_list','notice_save','notice_history'])denied(await rpc('common',fn,fn==='notice_save'?base:fn==='notice_history'?{p_id:randomUUID()}:{}));
 record('API real: endpoint disponível; anônimo e usuário comum negados na gestão');
 for(const name of ['admin','manager']){
  const draft=await save(name);assert.equal(draft.status,'draft');
  assert.ok(!must(await rpc('common','published')).announcements.some(n=>n.id===draft.id));
  const published=await edit(name,draft,{p_state:'published'});assert.equal(published.status,'active');
  assert.ok(must(await rpc('common','published')).announcements.some(n=>n.id===draft.id));
  const inactive=await edit(name,published,{p_state:'inactive'});assert.equal(inactive.status,'inactive');
  assert.equal(must(await rpc(name,'notice_history',{p_id:draft.id})).total,3);
 }
 record('Administrador e Gestor: rascunho/publicação/desativação persistentes e histórico real');
 const access=must(await users.manager.client.schema('core').rpc('my_access'));assert.deepEqual(access.map(g=>g.permission),['announcements.notice.manage']);
 assert.equal((await db.query("select count(*)::int n from core.role_permissions rp join core.roles r on r.id=rp.role_id where r.key in ('platform_administrator','announcement_manager') and rp.permission_key='room_booking.manage'")).rows[0].n,0);
 for(const operation of ['select','insert','update','delete']){
  const table=users.manager.client.schema('announcements').from('notices');
  const result=await(operation==='select'?table.select('id'):operation==='insert'?table.insert({title:'Tentativa sintética'}):operation==='update'?table.update({state:'published'}).eq('id',randomUUID()):table.delete().eq('id',randomUUID()));
  assert.ok(result.error);assert.ok(result.status>=400&&result.status<500);assert.equal(result.data,null);
 }
 await db.query('update core.user_role_assignments set active=false where id=any($1::uuid[]) and user_id=$2',[manifest.assignments,users.manager.id]);denied(await rpc('manager','manage_list'));denied(await rpc('manager','notice_save',base));
 await db.query('update core.user_role_assignments set active=true where id=any($1::uuid[]) and user_id=$2',[manifest.assignments,users.manager.id]);
 await db.query('update core.profiles set active=false where id=$1',[users.manager.id]);denied(await rpc('manager','published'));denied(await rpc('manager','notice_save',base));await db.query('update core.profiles set active=true where id=$1',[users.manager.id]);
 await db.query('update core.user_role_assignments set active=true where id=any($1::uuid[]) and user_id=$2',[manifest.assignments,users.manager.id]);
 record('Revogação e perfil inativo negados com JWT válido; escrita direta negada; D5-B e isolamento do Gestor');
 for(const changes of [{p_message:'<script>alert(1)</script>'},{p_category:'critical',p_tone:'success'},{p_starts_at:'2030-01-02T00:00:00Z',p_ends_at:'2030-01-01T00:00:00Z'},{p_priority:10001}])denied(await rpc('manager','notice_save',{...base,...changes}),'23514');
 const first=await save('manager');const second=await edit('manager',first,{p_title:`${tag} nova versão`});denied(await rpc('manager','notice_save',{...base,p_id:first.id,p_expected_version:1}),'40001');assert.equal(must(await rpc('manager','notice_history',{p_id:first.id})).total,2);
 await edit('manager',second,{p_state:'archived'});
 record('Validação de HTML/cor/datas/prioridade e versão obsoleta; arquivo terminal');
 const planned=await save('manager',{p_title:`${tag} fronteira temporal`,p_state:'published',p_starts_at:new Date(Date.now()+1800).toISOString(),p_ends_at:new Date(Date.now()+4200).toISOString()});assert.equal(planned.status,'scheduled');
 assert.ok(!must(await rpc('common','published')).announcements.some(n=>n.id===planned.id));
 const until=Date.now()+3500;let active=false;while(Date.now()<until){if(must(await rpc('common','published')).announcements.some(n=>n.id===planned.id)){active=true;break;}await new Promise(r=>setTimeout(r,100));}assert.ok(active);
 await new Promise(r=>setTimeout(r,2500));assert.ok(!must(await rpc('common','published')).announcements.some(n=>n.id===planned.id));
 record('Agendamento e expiração reais pelo relógio PostgreSQL, sem conteúdo futuro no feed');
 manifest.phase='browser';receipt();server=await salesLocalWeb(config);browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
 await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 const page=await context.newPage();debugPage=page;const errors=pageErrors,network=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{const path=new URL(r.url()).pathname;if(path.includes('announcements_'))network.push({path,status:r.status()});});
 await page.goto('http://127.0.0.1:5173/');
 await page.getByLabel('E-mail',{exact:true}).fill(users.admin.email);await page.getByLabel('Senha',{exact:true}).fill(users.admin.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Áreas de trabalho',exact:true})).toBeVisible();
 await page.locator('.sidebar').getByRole('button',{name:'Administração',exact:true}).click();await page.locator('.sidebar').getByRole('link',{name:'Comunicados',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Comunicados',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Novo comunicado',exact:true}).click();const form=page.getByRole('dialog',{name:'Novo comunicado',exact:true});
 const title=`Ambiente local de desenvolvimento ${randomUUID().slice(0,4)}`;const text='GG-10 validada com persistência real no Supabase local. Este comunicado é exclusivamente de teste; utilize apenas dados autorizados no desenvolvimento.';
 await form.getByLabel('Assunto',{exact:true}).fill(title);await form.getByLabel('Mensagem completa',{exact:true}).fill(text);await form.getByLabel(/^Categoria/).selectOption('testing');await form.getByRole('button',{name:'Salvar rascunho',exact:true}).click();
 await expect(form).toHaveCount(0);await expect(page.getByText('Comunicado salvo no servidor.',{exact:true})).toBeVisible();
 let demo=(await db.query('select * from announcements.notices where created_by=$1 and title=$2',[users.admin.id,title])).rows[0];assert.ok(demo);notices.push(demo.id);manifest.demo={id:demo.id,title,state:demo.state};receipt();
 await page.reload();await expect(page.getByRole('button',{name:`Editar ${title}`,exact:true})).toBeVisible();
 await page.getByRole('button',{name:`Editar ${title}`,exact:true}).click();const editor=page.getByRole('dialog',{name:'Editar comunicado',exact:true});
 await expect(editor.getByRole('textbox',{name:'Mensagem completa',exact:true})).toHaveValue(text);await editor.getByRole('button',{name:'Publicar comunicado',exact:true}).click();await expect(editor).toHaveCount(0);
 const banner=page.getByRole('region',{name:'Aviso institucional',exact:true});await expect(banner).toBeVisible();await expect(banner.getByRole('button',{name:`Ler comunicado: ${title}`,exact:true})).toBeVisible();
 await page.reload();await expect(banner).toBeVisible();
 demo=(await db.query('select * from announcements.notices where id=$1',[demo.id])).rows[0];assert.equal(demo.state,'published');assert.equal(demo.version,2);manifest.demo={...manifest.demo,state:demo.state,version:demo.version};receipt();
 await page.getByRole('button',{name:`Histórico de ${title}`,exact:true}).click();const history=page.getByRole('dialog',{name:`Histórico: ${title}`,exact:true});await expect(history).toContainText('Versão 2');await expect(history).toContainText('Versão 1');
 await page.screenshot({path:`${directory}/history-1440.png`,animations:'disabled'});await page.keyboard.press('Escape');
 for(const [width,height] of [[1440,1000],[1024,768],[768,1000],[375,812],[320,568]]){
  await page.setViewportSize({width,height});await expect(banner).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const box=await banner.boundingBox();assert.ok(box.height>=44&&box.height<=56);await page.screenshot({path:`${directory}/real-admin-${width}.png`,animations:'disabled'});
 }
 await banner.getByRole('button',{name:`Ler comunicado: ${title}`,exact:true}).click();const detail=page.getByRole('dialog',{name:title,exact:true});await expect(detail).toContainText(text);await page.screenshot({path:`${directory}/real-detail-320.png`,animations:'disabled'});await page.keyboard.press('Escape');
 record('Navegador real: login, menu, criação de rascunho, recarga, publicação, barra reaparece, recarga persistente e histórico');
 const managerContext=await browser.newContext({viewport:{width:1440,height:1000},locale:'pt-BR'});const managerPage=await managerContext.newPage();
 await managerContext.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 await managerPage.goto('http://127.0.0.1:5173/');await managerPage.getByLabel('E-mail',{exact:true}).fill(users.manager.email);await managerPage.getByLabel('Senha',{exact:true}).fill(users.manager.password);await managerPage.getByRole('button',{name:'Entrar',exact:true}).click();
 await expect(managerPage.getByRole('heading',{name:'Comunicados',exact:true})).toBeVisible();
 await managerPage.locator('.sidebar').getByRole('button',{name:'Administração',exact:true}).click();
 await expect(managerPage.locator('.sidebar').getByRole('link',{name:'Comunicados',exact:true})).toBeVisible();
 for(const label of ['Usuários','Perfis de acesso','Permissões','Unidades','Setores','Logs do sistema'])await expect(managerPage.locator('.sidebar').getByRole('link',{name:label,exact:true})).toHaveCount(0);
 await managerPage.goto('http://127.0.0.1:5173/admin/users');await expect(managerPage.getByRole('heading',{name:'Acesso não autorizado',exact:true})).toBeVisible();
 record('Navegador do Gestor: somente Comunicados e rota de Usuários negada');
 assert.ok(network.some(r=>r.path.endsWith('announcements_published')&&r.status===200));assert.ok(network.every(r=>r.status!==404));assert.deepEqual(errors,[]);
 manifest.network=network;manifest.pageerrors=errors;manifest.result='PASS';manifest.phase='complete';receipt();
} catch(error){if(debugPage){await debugPage.screenshot({path:`${directory}/failure.png`,animations:'disabled'}).catch(()=>{});manifest.browserDebug=await debugPage.evaluate(()=>({url:location.pathname,dialogs:[...document.querySelectorAll('dialog')].map(d=>({open:d.open,label:d.getAttribute('aria-labelledby'),head:d.querySelector('h2')?.textContent})),headings:[...document.querySelectorAll('h1')].map(h=>h.textContent)})).catch(()=>null);manifest.pageerrors=pageErrors;console.error('Diagnóstico browser:',JSON.stringify({debug:manifest.browserDebug,pageerrors:pageErrors}));}
 manifest.result='FAIL';manifest.error={name:error.name,code:error.code??null,message:error.message.slice(0,400)};receipt();console.error(`GG-10 local falhou na fase ${manifest.phase}:`,error.message);process.exitCode=1;}
finally{
 await browser?.close();await server?.close();
 const cleanupErrors=[];
 const attempt=async(label,operation)=>{try{await operation();}catch(error){cleanupErrors.push({label,code:error.code??error.name});}};
 try{
  // Sempre encerra sessões/inativa fixtures, inclusive se algum passo de domínio falhar.
  await attempt('inativar avisos sintéticos',async()=>{
    for(const id of notices){if(id===manifest.demo?.id)continue;const row=(await db.query('select * from announcements.notices where id=$1',[id])).rows[0];
      if(row&&row.state!=='archived')await edit('admin',row,{p_state:'inactive'});
    }
  });
  for(const client of clients)await attempt('encerrar sessão',()=>client.auth.signOut());
  await attempt('revogar grants próprios',async()=>{if(manifest.assignments.length)await db.query('update core.user_role_assignments set active=false where id=any($1::uuid[])',[manifest.assignments]);});
  await attempt('inativar perfis próprios',async()=>{if(manifest.users.length)await db.query('update core.profiles set active=false where id=any($1::uuid[])',[manifest.users.map(u=>u.id)]);});
  manifest.cleanup=cleanupErrors.length?'Teardown incompleto; consultar recibo privado.':'Somente perfis e grants sintéticos desta execução inativados; sessões encerradas; registros/histórico preservados; demonstração publicada mantida.';
  manifest.cleanupErrors=cleanupErrors;
  receipt();writeFileSync(`${directory}/latest-local-result.json`,JSON.stringify(manifest,null,2),{mode:0o600});
  if(cleanupErrors.length)process.exitCode=1;
 }finally{await db.end();}
}
