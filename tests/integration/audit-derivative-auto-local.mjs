// Opt-in local. Requer auditoria de teste vazia e dois arquivos novos declarados; não cria usuários ou infraestrutura.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
assert.equal(process.env.AUD_IMG_02_LOCAL_TEST,'gaucha-gestao-local');
const root=fileURLToPath(new URL('../../',import.meta.url));
const dir=process.env.AUD_IMG_02_LOCAL_DIR,config=process.env.AUD_IMG_02_LOCAL_CONFIG;
assert.ok(dir?.startsWith('/')&&config?.startsWith('/'),'Fixture e config locais explícitas');
const require=createRequire(root+'/package.json'),{chromium}=require('playwright');
const fixture=JSON.parse(readFileSync(dir+'/browser-private.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=['photo-78k.jpg','photo-11k.jpg'].map(name=>({name,bytes:readFileSync(dir+'/'+name)}));
const proof={inspection:fixture.inspection,preparingObserved:false,items:[],transfers:[],states:[]};
let phase='start executor',browser,runner,closed,stage='list';const bodies=[];
try{
 runner=spawn(process.execPath,[root+'/scripts/audit-derivative-dev.mjs','--config',config,'--inspection',fixture.inspection],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});
 closed=new Promise(resolve=>runner.once('close',code=>resolve(code)));
 await new Promise((resolve,reject)=>{
  let stdout='';const timeout=setTimeout(()=>reject(Error('startup timeout')),15000);
  runner.stdout.on('data',b=>{stdout+=b.toString();if(stdout.includes('Executor local iniciado')){clearTimeout(timeout);resolve();}});
  runner.once('close',()=>{clearTimeout(timeout);reject(Error('startup failed'));});
 });
 console.log('Executor de terminal iniciado; os próximos passos são somente ações pelo navegador.');
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:960},locale:'pt-BR',acceptDownloads:true});
 await context.route('**/*',route=>['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('response',r=>{
  const u=new URL(r.url());
  if(u.pathname.endsWith('/rpc/checklist_evidence_thumbnail_state'))bodies.push(r.json().then(v=>{for(const s of v)if(!proof.states.includes(s.state))proof.states.push(s.state);}).catch(()=>{}));
  if(r.request().method()==='GET'&&u.pathname.startsWith('/storage/v1/object/')){
   const e={stage,bucket:u.pathname.includes('/audit-evidence-thumbnails/')?'thumbnail':'original',status:r.status()};proof.transfers.push(e);
   bodies.push(r.body().then(b=>Object.assign(e,{bytes:b.length,sha256:hash(b)})).catch(()=>{}));
  }
 });
 phase='login';await page.goto('http://127.0.0.1:5173');
 await page.getByLabel('E-mail',{exact:true}).fill(fixture.owner.email);await page.getByLabel('Senha',{exact:true}).fill(fixture.owner.password);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByLabel('Senha',{exact:true}).waitFor({state:'detached'});
 await page.goto('http://127.0.0.1:5173/audit/inspections/'+fixture.inspection+'/checklist');
 const section=page.getByRole('region',{name:'Evidências do critério 1',exact:true});
 const toggle=page.locator('li.audit-item:has([aria-label="Evidências do critério 1"]) .audit-evidence-toggle');
 await toggle.waitFor();if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();await section.waitFor();
 phase='upload first';await section.locator('input[type=file]').setInputFiles(dir+'/'+files[0].name);
 await section.getByText('Preparando miniatura…',{exact:true}).waitFor();proof.preparingObserved=true;
 const item=n=>section.locator('.audit-evidence-list .file-item').filter({has:page.locator('strong',{hasText:`Evidência ${n}.jpg`})});
 await item(1).getByRole('img').waitFor();await page.waitForFunction(()=>document.querySelector('.audit-evidence-thumbnail img')?.naturalWidth>0);
 phase='upload second';await section.locator('input[type=file]').setInputFiles(dir+'/'+files[1].name);
 await item(2).getByRole('img').waitFor();
 await Promise.all(bodies);
 const automaticOriginals=proof.transfers.filter(t=>t.stage==='list'&&t.bucket==='original');
 assert.ok(automaticOriginals.length>0);
 assert.ok(automaticOriginals.every(t=>t.bytes===files[1].bytes.length&&t.sha256===hash(files[1].bytes)));
 assert.ok(proof.transfers.some(t=>t.stage==='list'&&t.bucket==='thumbnail'&&t.bytes<files[0].bytes.length));
 await section.screenshot({path:dir+'/automatic-list.png'});
 for(let i=0;i<files.length;i++){
  phase='expand '+i;stage='expanded-'+i;
  await item(i+1).getByRole('button',{name:`Ampliar Evidência ${i+1}.jpg`,exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();await page.waitForFunction(()=>{const i=document.querySelector('dialog img');return i?.complete&&i.naturalWidth>0;});
  await Promise.all(bodies);assert.ok(proof.transfers.some(t=>(t.stage===stage||(i===1&&t.stage==='list'))&&t.sha256===hash(files[i].bytes)&&t.bytes===files[i].bytes.length));
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
  phase='download '+i;stage='download-'+i;
  const [download]=await Promise.all([page.waitForEvent('download'),item(i+1).getByRole('button',{name:`Baixar Evidência ${i+1}.jpg`,exact:true}).click()]);
  const bytes=readFileSync(await download.path());assert.ok(bytes.equals(files[i].bytes));
  proof.items.push({originalBytes:bytes.length,originalSha256:hash(bytes),expandedOriginal:true,downloadOriginal:true});
 }
 proof.noReloadAfterUploads=true;proof.automatic=true;
 console.log('PASS dois uploads no Chromium: ready automático e original compacto autorizado; ampliar/baixar idênticos.');
}catch(e){console.error('FAIL browser phase:',phase,'code:',e.code??'CHECK_FAILED');process.exitCode=1;}
finally{
 await browser?.close();
 if(runner&&runner.exitCode===null){runner.kill('SIGINT');await closed;}
 const sql=execFileSync('docker',['exec','supabase_db_gaucha-gestao-local','psql','-U','postgres','-d','postgres','-X','-Atqc',"select rolcanlogin from pg_roles where rolname='audit_derivative_worker'"],{encoding:'utf8'}).trim();
 proof.technicalLoginEnabled=sql==='t';assert.equal(sql,'f');
 writeFileSync(dir+'/automatic-proof.json',JSON.stringify(proof,null,2),{mode:0o600});
 console.log('Executor encerrado pelo terminal; NOLOGIN confirmado.');
}
