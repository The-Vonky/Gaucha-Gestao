// Benchmark somente leitura do build servido localmente; fixture de login privada.
import assert from 'node:assert/strict';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {chromium} from 'playwright';
import {attachAuditTraffic} from '../tests/integration/audit-evidence-traffic.mjs';
const [fixtureFile,output]=process.argv.slice(2);
assert.equal(process.env.MED01_LOCAL_TARGET,'gaucha-gestao-local');assert.ok(fixtureFile?.startsWith('/')&&output?.startsWith('/'));
assert.equal((await stat(fixtureFile)).mode&0o077,0);
const fixture=JSON.parse(await readFile(fixtureFile,'utf8'));
const origin='http://127.0.0.1:5173';const browser=await chromium.launch({headless:true});const runs=[];
try{
 for(let repetition=1;repetition<=3;repetition++){
  const context=await browser.newContext({viewport:{width:1280,height:960},locale:'pt-BR'});const page=await context.newPage();
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  let meter=await attachAuditTraffic(page,{appOrigin:origin,storageOrigin:'http://127.0.0.1:54321'});
  const stages=[];const row={repetition,stages};runs.push(row);
  async function measure(name,action){
   await meter.close();meter=await attachAuditTraffic(page,{appOrigin:origin,storageOrigin:'http://127.0.0.1:54321'});
   const before=0;const start=performance.now();
   const metricsBefore=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
   await action();const usableMs=Math.round(performance.now()-start);await page.waitForTimeout(300);
   const metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
   await page.waitForLoadState('networkidle');const snapshot=await meter.snapshot();assert.equal(snapshot.unfinished,0);
   const requests=snapshot.requests.slice(before);const resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(x=>x.initiatorType==='script'||x.initiatorType==='link').map(x=>({kind:x.name.split('?')[0].split('.').at(-1),transferSize:x.transferSize,encodedBodySize:x.encodedBodySize,durationMs:Math.round(x.duration),blocking:x.renderBlockingStatus})));
   stages.push({name,unfinished:snapshot.unfinished,usableMs,scriptMs:Math.round((metrics.ScriptDuration-(name==='audit-route'?metricsBefore.ScriptDuration:0))*1000),taskMs:Math.round((metrics.TaskDuration-(name==='audit-route'?metricsBefore.TaskDuration:0))*1000),resources,requests});
  }
  await measure('login-cold',async()=>{await page.goto(origin);await page.getByRole('button',{name:'Entrar',exact:true}).waitFor();});
  await page.getByLabel('E-mail',{exact:true}).fill(fixture.owner.email);await page.getByLabel('Senha',{exact:true}).fill(fixture.owner.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByLabel('Senha',{exact:true}).waitFor({state:'detached'});
  await measure('home-reload',async()=>{await page.reload();await page.getByRole('button',{name:'Sair',exact:true}).first().waitFor();});
  await page.locator('.sidebar .menu-group-toggle').filter({hasText:'Qualidade'}).click();await page.waitForTimeout(300);
  await measure('audit-route',async()=>{await page.getByRole('link',{name:'Auditorias',exact:true}).first().click();await page.getByRole('heading',{name:'Auditorias',exact:true}).waitFor();});
  row.unfinished=(await meter.snapshot()).unfinished;await meter.close();await cdp.detach();await context.close();
 }
}finally{await writeFile(output,JSON.stringify({browser:browser.version(),viewport:{width:1280,height:960},network:'loopback sem throttle',runs},null,2)+'\n',{mode:0o600});await browser.close();}
console.log('PASS frontend: três contextos, login/home/Auditoria, bytes/CDP/CPU.');
