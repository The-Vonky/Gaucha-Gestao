// MED-01 opt-in. Fixture privada pré-anexada; somente navegação/download no loopback.
// Não cria infraestrutura, conta, inspeção ou objeto; não registra URLs/identidades.
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {attachAuditTraffic} from '../tests/integration/audit-evidence-traffic.mjs';
const [fixtureFile,mode,output]=process.argv.slice(2);
assert.equal(process.env.MED01_LOCAL_TARGET,'gaucha-gestao-local');
assert.ok(['baseline','candidate'].includes(mode)&&fixtureFile?.startsWith('/')&&output?.startsWith('/'));
assert.equal((await stat(fixtureFile)).mode&0o077,0,'Fixture deve ser privada');
const fixture=JSON.parse(await readFile(fixtureFile,'utf8'));
assert.match(fixture.inspection,/^[a-f0-9-]{36}$/);
assert.equal(fixture.items.length,10);assert.equal(fixture.rows.length,100);
for(const row of fixture.rows)assert.match(row.file,/^synthetic-[0-9]{3}\.png$/);
const origin='http://127.0.0.1:5173',storage='http://127.0.0.1:54321';
const browser=await chromium.launch({headless:true});
const results=[];
const report={mode,revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),browser:browser.version(),viewport:{width:1280,height:960},network:'loopback sem throttle',cache:'habilitado; contexto novo por repetição; sem interceptação',runs:results};
const save=()=>writeFile(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
const digest=b=>createHash('sha256').update(b).digest('hex');
async function login(page){
 await page.getByLabel('E-mail',{exact:true}).fill(fixture.owner.email);
 await page.getByLabel('Senha',{exact:true}).fill(fixture.owner.password);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();
 await page.getByLabel('Senha',{exact:true}).waitFor({state:'detached'});await page.waitForLoadState('networkidle');
}
try{
 for(const count of [10,30,100])for(let repetition=1;repetition<=3;repetition++){
  const context=await browser.newContext({viewport:report.viewport,locale:'pt-BR',acceptDownloads:true});
  const page=await context.newPage();page.setDefaultTimeout(30000);
  let meter=await attachAuditTraffic(page,{appOrigin:origin,storageOrigin:storage});
  const run={count,repetition,durations:{},assertions:{}};results.push(run);
  const stage=async(name,action)=>{console.log('Etapa',mode,count,repetition,name);meter.stage(name);const start=performance.now();await action();await page.waitForLoadState('networkidle');await page.waitForTimeout(100);run.durations[name]=Math.round(performance.now()-start);};
  const selected=fixture.items.slice(0,count/10);
  const navigate=()=>page.goto(origin+'/audit/inspections/'+fixture.inspection+'/checklist');
  async function select(item){
   const index=fixture.items.findIndex(x=>x.key===item.key),section=index<5?1:2;
   const button=page.getByRole('navigation',{name:'Seções do checklist'}).getByRole('button',{name:new RegExp('^Seção '+section+':')});
   if(await button.getAttribute('aria-current')!=='true')await button.click();
   return page.locator('#audit-item-'+item.key);
  }
  async function walk(items){
   for(const item of items){
    const criterion=await select(item);const toggle=criterion.locator('.audit-evidence-toggle');
    if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
    const rows=criterion.locator('.audit-evidence-list .file-item');await rows.first().waitFor();assert.equal(await rows.count(),10);
    for(let i=0;i<10;i++){
     const row=rows.nth(i);await row.scrollIntoViewIfNeeded();
     await row.locator('img').waitFor();await page.waitForFunction(key=>{const item=document.querySelector('#audit-item-'+key);const images=[...item.querySelectorAll('img')];return images.length>0&&images.every(img=>img.complete&&img.naturalWidth>0);},item.key,{timeout:15000});
    }
    await toggle.click();
   }
  }
  try{
   await stage('startup',async()=>{await page.goto(origin);await login(page);await navigate();await page.locator('.audit-evidence-toggle').first().waitFor();});
   run.startupTraffic=await meter.snapshot();await meter.close();meter=await attachAuditTraffic(page,{appOrigin:origin,storageOrigin:storage});
   await stage('first-visit',()=>walk(selected));
   await stage('revisit',()=>walk(selected));
   await stage('section',async()=>{await page.getByRole('navigation',{name:'Seções do checklist'}).getByRole('button',{name:/^Seção 2:/}).click();await walk(selected.slice(0,1));});
   // Original explícito: uma imagem, idêntica nos dois modos e em todas as contagens.
   const criterion=await select(selected[0]);await criterion.locator('.audit-evidence-toggle').click();
   const first=criterion.locator('.audit-evidence-list .file-item').first();await first.scrollIntoViewIfNeeded();await first.locator('img').waitFor();
   await page.waitForTimeout(200);
   await stage('modal',async()=>{await first.getByRole('button',{name:/Ampliar Evidência/}).click();const img=page.getByRole('dialog').locator('img');await img.waitFor();await page.waitForFunction(()=>{const img=document.querySelector('[role=dialog] img,dialog img');return img?.complete&&img.naturalWidth>0;},{timeout:15000});await page.keyboard.press('Escape');});
   await stage('download',async()=>{const [download]=await Promise.all([page.waitForEvent('download'),first.getByRole('button',{name:/Baixar Evidência/}).click()]);const body=await readFile(await download.path());const original=await readFile(new URL('images/'+fixture.rows[0].file,pathToFileURL(fixtureFile)));run.assertions.download={bytes:body.length,identical:digest(body)===digest(original)};assert.ok(run.assertions.download.identical);});
   await stage('reload',async()=>{await page.reload();await page.locator('.audit-evidence-toggle').first().waitFor();await walk(selected);});
   await page.waitForLoadState('networkidle');Object.assign(run,await meter.snapshot());assert.equal(run.unfinished,0);
   if(count===10&&repetition===1){
    await meter.close();meter=await attachAuditTraffic(page,{appOrigin:origin,storageOrigin:storage});
    await stage('expiry',async()=>{await page.waitForTimeout(61000);await walk(selected.slice(0,1));});
    await stage('session',async()=>{await page.getByRole('button',{name:'Sair',exact:true}).first().click();await page.getByLabel('Senha',{exact:true}).waitFor();run.assertions.logoutImages=await page.locator('.audit-image-slot img').count();assert.equal(run.assertions.logoutImages,0);await login(page);await navigate();await walk(selected.slice(0,1));});
    await stage('offline',async()=>{await context.setOffline(true);run.assertions.offlineFetchFailed=await page.evaluate(()=>fetch('/favicon.svg',{cache:'no-store'}).then(()=>false,()=>true));assert.ok(run.assertions.offlineFetchFailed);await context.setOffline(false);await navigate();await walk(selected.slice(0,1));});
   }
   await page.waitForTimeout(500);if(count===10&&repetition===1)run.extraTraffic=await meter.snapshot();
   // CDP reporta navegação de download como abortada; bytes/hash salvos em separado.
   assert.equal(run.unfinished,0);
   const firstGets=run.requests.filter(r=>r.stage==='first-visit'&&['image-get','thumbnail-get'].includes(r.category));
   assert.equal(new Set(firstGets.map(r=>r.object)).size,count);assert.ok(firstGets.every(r=>!r.failed&&r.status===200&&r.imageKind===(mode==='candidate'?'thumbnail':'original')));
   console.log('PASS',mode,count,repetition);
  }finally{if(!run.requests)run.incompleteTraffic=await meter.snapshot();await save();await meter.close();await context.close();}
 }
}finally{await save();await browser.close();}
