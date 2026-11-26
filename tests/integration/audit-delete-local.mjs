// Opt-in no Compose pessoal com Identity. Todas as mutações usam UUIDs desta execução.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const project = "gaucha-gestao-local";
assert.equal(process.env.AUD_DELETE_TEST, project);
const docker = (...args) => execFileSync("docker", args, {encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
assert.ok((process.env.DOCKER_HOST || docker("context","inspect","--format","{{.Endpoints.docker.Host}}")).startsWith("unix://"));
for (const service of ["db", "identity", "storage"]) {
  assert.equal(docker("inspect","-f",'{{index .Config.Labels "com.docker.compose.project"}}/{{index .Config.Labels "com.docker.compose.service"}}',project+"-"+service+"-1"), project+"/"+service);
}
const env = Object.fromEntries(readFileSync(join(process.env.XDG_CONFIG_HOME || join(homedir(),".config"),"gaucha-gestao/backend.env"),"utf8")
  .trim().split("\n").map(line => [line.slice(0,line.indexOf("=")),line.slice(line.indexOf("=")+1).replace(/^'|'$/g,"")]));
assert.ok(docker("port",project+"-db-1","5432").split("\n").includes("127.0.0.1:"+env.GG_DB_PORT));
const db = new pg.Client({host:"127.0.0.1",port:Number(env.GG_DB_PORT),user:"postgres",database:"postgres",password:env.POSTGRES_PASSWORD});
const base = "http://127.0.0.1:"+env.GG_API_PORT;
const client = createClient(base,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const tag = "AUD-DELETE-"+randomUUID().slice(0,8);
const unit = randomUUID();
const email = tag.toLowerCase()+"@example.test";
const password = "Sintetica-aA1!"+randomUUID();
const one = async (sql,args) => (await db.query(sql,args)).rows[0];
let phase = "pré-validação", browser, user;
function must(result) {
  if (result.error) throw Object.assign(new Error("API"),{code:result.error.code || result.error.statusCode || "API_ERROR"});
  return result.data;
}
const rpc = async (fn,args={}) => must(await client.schema("audit").rpc(fn,args));
const create = () => rpc("create_inspection",{p_unit:unit,p_applied_on:"2026-11-26",p_previous_visit_on:null});
const impact = id => rpc("inspection_delete_impact",{p_inspection:id});
const state = id => rpc("inspection_delete_state",{p_inspection:id});
const start = async id => rpc("begin_inspection_delete",{p_inspection:id,p_snapshot:(await impact(id)).snapshot,p_confirmation:"excluir auditoria"});
const finish = id => rpc("finish_inspection_delete",{p_inspection:id});
const pdf = Buffer.from("%PDF-1.4\nAUD-DELETE-01\n");
const beginFile = async id => (await rpc("begin_checklist_evidence_upload",{p_inspection:id,p_item_key:"item-001",p_original_name:"fixture.pdf",p_content_type:"application/pdf",p_size:pdf.length}))[0];
const attach = async id => {
  const file = await beginFile(id);
  must(await client.storage.from("audit-checklist-evidence").upload(file.object_key,pdf,{contentType:"application/pdf"}));
  await rpc("confirm_checklist_evidence_upload",{p_evidence:file.evidence_id});
  return file;
};
const runIn = (service,code,data) => execFileSync("docker",["exec","-i",project+"-"+service+"-1","node","-e",code],{
  input:JSON.stringify(data),encoding:"utf8",stdio:["pipe","pipe","pipe"],
}).trim();
function physicalFile(bucket,key,version) {
  return runIn("storage",`const [bucket,key,v]=JSON.parse(require('fs').readFileSync(0)); console.log(require('fs').existsSync('/mnt/stub/stub/'+bucket+'/'+key+'/'+v));`,[bucket,key,version])==="true";
}
try {
  await db.connect();
  assert.equal((await one("select private.identity_enabled() enabled")).enabled,true);
  assert.ok((await one("select to_regprocedure('audit.finish_inspection_delete(uuid)') fn")).fn);
  phase="identidade sintética";
  user=runIn("identity",`const data=JSON.parse(require('fs').readFileSync(0));fetch('http://auth:9999/admin/users',{method:'POST',headers:{Authorization:'Bearer '+process.env.GG_IDENTITY_AUTH_ADMIN_KEY,'Content-Type':'application/json'},body:JSON.stringify(data)}).then(async r=>{if(!r.ok)process.exit(1);console.log((await r.json()).id)})`,
    {email,password,email_confirm:true,user_metadata:{display_name:tag}});
  assert.match(user,/^[0-9a-f-]{36}$/);
  await db.query("insert into core.units(id,code,name) values($1,$2,$2)",[unit,tag]);
  await db.query("insert into private.identity_credentials(user_id,state) values($1,'active') on conflict(user_id) do nothing",[user]);
  await db.query("insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id) select $1,id,'unit',$2 from core.roles where key='quality'",[user,unit]);
  const auth=must(await client.auth.signInWithPassword({email,password}));
  assert.equal(auth.user.id,user);
  const saved=await create(), keep=await attach(saved);
  must(await client.schema("action_plans").rpc("create_manual_plan",{p_unit:unit,p_sector:null,p_improvement_point:"Plano manual "+tag}));
  const target=await create();
  phase="três buckets";
  const own=await attach(target);
  await rpc("remove_checklist_evidence",{p_evidence:own.evidence_id});
  must(await client.schema("audit").from("inspection_answers").update({response:"AP",observation:tag}).eq("inspection_id",target).eq("item_key","item-001"));
  const plan=(await one("select id from action_plans.plans where source_inspection_id=$1",[target])).id;
  const planFile=must(await client.schema("action_plans").rpc("begin_evidence_upload",{p_plan:plan,p_kind:"execution",p_original_name:"fixture.pdf",p_content_type:"application/pdf",p_size:pdf.length}))[0];
  must(await client.storage.from("action-plan-evidence").upload(planFile.object_key,pdf,{contentType:"application/pdf"}));
  must(await client.schema("action_plans").rpc("confirm_evidence_upload",{p_evidence:planFile.evidence_id}));
  // Objeto legado sintético órfão do manifesto, mas de UUID de evidência inequívoco.
  const thumb = own.evidence_id+"/img-480-v1/"+"a".repeat(64)+"/"+"b".repeat(64)+".jpg";
  runIn("identity",`const {key}=JSON.parse(require('fs').readFileSync(0));fetch('http://storage:5000/object/audit-evidence-thumbnails/'+key,{method:'POST',headers:{Authorization:'Bearer '+process.env.GG_IDENTITY_AUTH_ADMIN_KEY,'Content-Type':'image/jpeg'},body:Buffer.from([255,216,255,217])}).then(r=>{if(!r.ok)process.exit(1)})`,{key:thumb});
  const snap=await impact(target);
  assert.equal(snap.counts.objects,3);
  const indexed=(await db.query("select * from audit_private.inspection_storage_objects($1)",[target])).rows;
  for (const o of indexed) assert.ok(physicalFile(o.bucket,o.name,o.revision));
  await start(target);
  phase="revogação, retomada e preservação";
  const objects=(await state(target)).objects;
  for (const bucket of ["action-plan-evidence","audit-checklist-evidence","audit-evidence-thumbnails"]) {
    const names=objects.filter(o=>o.bucket===bucket).map(o=>o.name);
    if(bucket==="audit-checklist-evidence") names.push(keep.object_key);
    assert.equal(must(await client.storage.from(bucket).remove(names)).length,1);
    if(bucket==="action-plan-evidence") {
      await assert.rejects(finish(target),{code:"55000"});
      await db.query("update core.user_role_assignments set active=false where user_id=$1 and unit_id=$2",[user,unit]);
      await assert.rejects(state(target),{code:"42501"});
      await db.query("update core.user_role_assignments set active=true where user_id=$1 and unit_id=$2",[user,unit]);
    }
  }
  await finish(target); await finish(target);
  for (const o of indexed) assert.equal(physicalFile(o.bucket,o.name,o.revision),false);
  assert.equal((await db.query("select id from action_plans.plans where id=$1",[plan])).rowCount,0);
  assert.equal((await db.query("select id from action_plans.plans where unit_id=$1 and source_type='manual'",[unit])).rowCount,1);
  assert.equal((await db.query("select from audit.inspections where id=$1",[saved])).rowCount,1);
  assert.equal((await db.query("select from storage.objects where bucket_id='audit-checklist-evidence' and name=$1",[keep.object_key])).rowCount,1);
  phase="órfão físico";
  const interrupted=await create();
  const reserved=await beginFile(interrupted);
  const version=randomUUID();
  // Exatamente a etapa de persistência anterior ao completeUpload, sem parar o serviço.
  runIn("storage",`const {FileBackend}=require('./dist/storage/backend/file'); const {key,v}=JSON.parse(require('fs').readFileSync(0));const bytes=Buffer.from('%PDF-1.4 fixture');new FileBackend().uploadObject('stub','stub/audit-checklist-evidence/'+key,v,require('stream').Readable.from(bytes),'application/pdf','0',undefined,bytes.length).catch(()=>process.exit(1));`,{key:reserved.object_key,v:version});
  assert.ok(physicalFile("audit-checklist-evidence",reserved.object_key,version));
  await start(interrupted);
  assert.deepEqual(await state(interrupted),{completed:false,reconcile:true,objects:[]});
  await assert.rejects(finish(interrupted),{code:"55000"});
  const reconcile = (...extra) => execFileSync("python3",["scripts/audit-delete/reconcile-local.py",interrupted,...extra],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  for(let attempt=0;;attempt++) {
    try { assert.match(reconcile(), /encontradas: 1/); reconcile("--apply"); break; }
    catch(error) { if(attempt>=12) throw error; await new Promise(r=>setTimeout(r,5000)); }
  }
  assert.equal(physicalFile("audit-checklist-evidence",reserved.object_key,version),false);
  await finish(interrupted);
  phase="Chromium no Vite";
  browser=await chromium.launch();
  for(const width of [1280,375]) {
    const ctx=await browser.newContext({viewport:{width,height:812}});
    const page=await ctx.newPage();
    const ui=await create();
    await page.goto("http://127.0.0.1:5173");
    await page.getByLabel(/E-mail/i).fill(email);
    await page.getByLabel(/^Senha$/i).fill(password);
    await page.getByRole("button",{name:"Entrar",exact:true}).click();
    await page.getByLabel(/^Senha$/i).waitFor({state:"detached"});
    await page.goto("http://127.0.0.1:5173/audit/units/"+unit+"/historico");
    const li=page.locator("li").filter({has:page.locator('a[href="/audit/inspections/'+ui+'"]')});
    const button=li.getByRole("button",{name:"Excluir",exact:true});
    await button.focus(); await page.keyboard.press("Enter");
    const dialog=page.getByRole("dialog",{name:"Excluir auditoria"});
    await dialog.getByText("Respostas preenchidas").waitFor();
    assert.equal(await dialog.getByRole("button",{name:"Excluir definitivamente"}).isEnabled(),false);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.keyboard.press("Escape");
    assert.ok(await button.evaluate(e=>e===document.activeElement));
    await button.click();
    await dialog.getByRole("textbox").fill("excluir auditoria");
    await dialog.getByRole("button",{name:"Excluir definitivamente"}).click();
    await page.getByText("Auditoria excluída definitivamente.").waitFor();
    assert.equal((await db.query("select from audit.inspections where id=$1",[ui])).rowCount,0);
    await ctx.close();
  }
  console.log("PASS Identity, três buckets, órfão físico, retomada, isolamento e Chromium 1280/375.");
  console.log("Fixture de homologação: "+tag+" | http://127.0.0.1:5173/audit/units/"+unit+"/historico");
} catch(error) {
  console.error("Falha AUD-DELETE-01 DEV: "+phase+" ("+(error.code??error.name??"verificação")+")");
  process.exitCode=1;
} finally {
  await browser?.close();
  if(user) await db.query("update core.profiles set active=false where id=$1",[user]);
  await db.end();
}
