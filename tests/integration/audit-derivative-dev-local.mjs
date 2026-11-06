// Opt-in: duas auditorias sintéticas explícitas, Docker local já existente e configuração privada provisionada.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
assert.equal(process.env.AUD_IMG_02_LOCAL_TEST,'gaucha-gestao-local');
const root=fileURLToPath(new URL('../../',import.meta.url)),dir=process.env.AUD_IMG_02_LOCAL_DIR;
assert.ok(dir?.startsWith('/'));
const fixture=JSON.parse(readFileSync(dir+'/browser-private.json'));
assert.equal(fixture.inspections.length,2);assert.notEqual(...fixture.inspections);
const digest=b=>createHash('sha256').update(b).digest('hex');
const proof={singleCommand:'npm run dev',audits:2,items:[],originalReadsBeforeAction:0};
let runner,browser,closed,phase='start',stage='list';const transfers=[],bodies=[];
try{
 runner=spawn('npm',['run','dev'],{cwd:root,env:process.env,detached:true,stdio:['ignore','pipe','pipe']});
 closed=new Promise(resolve=>runner.once('close',code=>resolve(code)));
 await new Promise((resolve,reject)=>{
  let output='';const timer=setTimeout(()=>reject(Error('startup timeout')),30000);
  runner.stdout.on('data',b=>{output+=b.toString();if(output.includes('Local:')&&output.includes('Executor local iniciado')){clearTimeout(timer);resolve();}});
  runner.once('close',()=>{clearTimeout(timer);reject(Error('startup failed'));});
 });
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:960},locale:'pt-BR',acceptDownloads:true});
 await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(45000);
 page.on('response',r=>{
  const u=new URL(r.url());
  if(r.request().method()==='GET'&&u.pathname.startsWith('/storage/v1/object/')){
   const entry={stage,bucket:u.pathname.includes('/audit-evidence-thumbnails/')?'thumbnail':'original',status:r.status()};transfers.push(entry);
   bodies.push(r.body().then(b=>Object.assign(entry,{bytes:b.length,sha256:digest(b)})).catch(()=>{}));
  }
 });
 phase='login';await page.goto('http://127.0.0.1:5173');
 await page.getByLabel('E-mail',{exact:true}).fill(fixture.owner.email);await page.getByLabel('Senha',{exact:true}).fill(fixture.owner.password);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByLabel('Senha',{exact:true}).waitFor({state:'detached'});
 for(let i=0;i<2;i++){
  phase='upload audit '+i;stage='list-'+i;
  await page.goto('http://127.0.0.1:5173/audit/inspections/'+fixture.inspections[i]+'/checklist');
  const section=page.getByRole('region',{name:'Evidências do critério 1',exact:true});
  const toggle=page.locator('li.audit-item:has([aria-label="Evidências do critério 1"]) .audit-evidence-toggle');
  await toggle.waitFor();if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();await section.waitFor();
  const filename=fixture.files[i],original=readFileSync(dir+'/'+filename);
  await section.locator('input[type=file]').setInputFiles(dir+'/'+filename);
  await section.getByText('Preparando miniatura…',{exact:true}).waitFor();
  const item=section.locator('.audit-evidence-list .file-item').first();
  await item.getByRole('img').waitFor();await page.waitForFunction(()=>document.querySelector('.audit-evidence-thumbnail img')?.naturalWidth>0);
  await Promise.all(bodies);
  assert.equal(transfers.filter(t=>t.bucket==='original'&&t.stage.startsWith('list-')).length,0);
  const thumbnail=transfers.find(t=>t.stage===stage&&t.bucket==='thumbnail'&&t.status===200);assert.ok(thumbnail?.bytes<original.length);
  await section.screenshot({path:dir+'/audit-'+i+'.png'});
  phase='original audit '+i;stage='expand-'+i;
  await item.getByRole('button',{name:/Ampliar Evidência/}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();await page.waitForFunction(()=>{const img=document.querySelector('dialog img');return img?.complete&&img.naturalWidth>0;});
  await Promise.all(bodies);assert.ok(transfers.some(t=>t.stage===stage&&t.sha256===digest(original)));
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});stage='download-'+i;
  const [download]=await Promise.all([page.waitForEvent('download'),item.getByRole('button',{name:/Baixar Evidência/}).click()]);
  assert.ok(readFileSync(await download.path()).equals(original));
  proof.items.push({originalBytes:original.length,originalSha256:digest(original),thumbnailBytes:thumbnail.bytes,thumbnailSha256:thumbnail.sha256,automatic:true,preparingObserved:true,downloadIdentical:true,expandedIdentical:true});
 }
 console.log('PASS npm run dev: JPEG e PNG em duas auditorias, atualização automática, sem UUID/restart; originais idênticos.');
}catch(error){console.error('FAIL fase:',phase,'código:',error.code??'CHECK_FAILED');process.exitCode=1;}
finally{
 await browser?.close();
 if(runner&&runner.exitCode===null){process.kill(-runner.pid,'SIGINT');await closed;}
 const enabled=execFileSync('docker',['exec','supabase_db_gaucha-gestao-local','psql','-U','supabase_admin','-d','postgres','-X','-Atqc',"select rolcanlogin from pg_roles where rolname='audit_derivative_worker'"],{encoding:'utf8'}).trim();
 proof.technicalLoginEnabled=enabled==='t';assert.equal(enabled,'f');
 writeFileSync(dir+'/proof.json',JSON.stringify(proof,null,2),{mode:0o600});
 console.log('PASS encerramento do grupo npm: NOLOGIN confirmado.');
}
