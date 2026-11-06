// Diagnóstico opt-in, somente leitura e tentativas negadas sobre a fixture sintética existente.
// Não cria dados, processa fila, configura roles ou altera containers/permissões.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {open,writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import sharp from 'sharp';

const target='gaucha-gestao-local';
assert.equal(process.env.AUD_IMG_02_LOCAL_TEST,target,'Exige destino local explícito');
const fixtureFile=process.env.AUD_IMG_02_LOCAL_FIXTURE;
const outputFile=process.env.AUD_IMG_02_LOCAL_OUTPUT;
assert.ok(fixtureFile?.startsWith('/')&&outputFile?.startsWith('/'),'Arquivos locais absolutos obrigatórios');
async function privateRead(file){
 const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const s=await handle.stat();
  assert.ok(s.isFile()&&s.uid===process.getuid()&&(s.mode&0o077)===0,'Arquivo privado 0600 obrigatório');
  return await handle.readFile('utf8');
 }finally{await handle.close();}
}
const fixture=JSON.parse(await privateRead(fixtureFile));
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
assert.match(fixture.evidence,uuid);assert.match(fixture.owner,uuid);
const bucket='audit-evidence-thumbnails',key=fixture.derived.key;
assert.ok(key.startsWith(fixture.evidence+'/img-480-v1/'));
const digest=b=>createHash('sha256').update(b).digest('hex');
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:15000});
const inspect=name=>JSON.parse(docker(['inspect','--format','{{json .}}',name]));
const storage=inspect('supabase_storage_'+target),database=inspect('supabase_db_'+target);
assert.equal(storage.Name,'/supabase_storage_'+target);assert.equal(storage.State.Running,true);
assert.ok(storage.Config.Image.endsWith('/storage-api:v1.72.1'),'Diagnóstico delimitado à versão local conhecida');
assert.ok(database.NetworkSettings.Ports['5432/tcp'].some(p=>p.HostIp==='127.0.0.1'&&p.HostPort==='54322'));
const env=Object.fromEntries((await privateRead('apps/web/.env.local')).split('\n').filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));
assert.equal(env.VITE_SUPABASE_URL,'http://127.0.0.1:54321');
const apiKey=env.VITE_SUPABASE_PUBLISHABLE_KEY;assert.ok(apiKey&&!apiKey.startsWith('sb_secret_'));
const sql=text=>docker(['exec','-i','supabase_db_'+target,'psql','-X','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],`begin read only;${text};rollback;`);
const snapshot=()=>JSON.parse(sql(`select json_build_object(
 'objects',(select json_agg(o order by id) from storage.objects o where
 (bucket_id='audit-checklist-evidence' and name=(select object_key from audit.checklist_evidence where id='${fixture.evidence}'))
 or (bucket_id='${bucket}' and name=(select derived_object_key from audit.checklist_evidence_derivatives where evidence_id='${fixture.evidence}'))),
 'manifest',(select row_to_json(d) from audit.checklist_evidence_derivatives d where evidence_id='${fixture.evidence}'),
 'migrations',(select json_agg(m order by version) from supabase_migrations.schema_migrations m),
 'login',(select rolcanlogin from pg_roles where rolname='audit_derivative_worker'))`));
const before=snapshot();assert.equal(before.login,false);assert.equal(before.manifest.state,'ready');assert.equal(before.objects.length,2);
assert.equal(key,before.manifest.derived_object_key);
assert.ok(before.objects.some(o=>o.bucket_id==='audit-checklist-evidence'&&o.name===fixture.originalKey));
const login=await fetch(env.VITE_SUPABASE_URL+'/auth/v1/token?grant_type=password',{
 method:'POST',headers:{apikey:apiKey,'Content-Type':'application/json'},body:JSON.stringify(fixture.users.owner),signal:AbortSignal.timeout(10000)});
assert.equal(login.status,200);const {access_token:token}=await login.json();assert.ok(token);
assert.equal(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub,fixture.owner);
const auth={apikey:apiKey,Authorization:'Bearer '+token};
async function read(bucket,key){
 const r=await fetch(env.VITE_SUPABASE_URL+'/storage/v1/object/authenticated/'+bucket+'/'+key,{headers:auth,signal:AbortSignal.timeout(10000)});
 assert.equal(r.status,200);return Buffer.from(await r.arrayBuffer());
}
const input=await read(bucket,key),original=await read('audit-checklist-evidence',fixture.originalKey);
assert.equal(digest(input),fixture.derived.sha256);assert.equal(digest(original),fixture.original.sha256);
const small=await sharp(input).resize({width:16}).png().toBuffer();
// Docker Desktop não garante rota do host para o IP interno. Executar um cliente
// temporário no container existente permite controle direto, sem porta/serviço novo.
// Ambiente limpo e somente JWT do usuário comum via stdin; nenhuma chave administrativa.
const directClient=`
let input='';for await(const chunk of process.stdin)input+=chunk;
const c=JSON.parse(input);let phase='headers',status=null;
try{
 const r=await fetch(c.url,{method:'POST',headers:c.headers,body:Buffer.from(c.body,'base64'),signal:AbortSignal.timeout(10000)});
 status=r.status;phase='body';const text=await r.text();
 if(text.length>8192)throw Error('oversized');
 let value;try{value=JSON.parse(text)}catch{value={}};
 const code=String(value.error??value.code??'');
 process.stdout.write(JSON.stringify({status,code:/^[A-Za-z_]{1,40}$/.test(code)?code:'UNCLASSIFIED',kind:[400,401,403,404].includes(status)&&['Unauthorized','AccessDenied','unauthorized'].includes(code)?'authorization_denied':'unexpected_http'}));
}catch(e){process.stdout.write(JSON.stringify({status,phase,kind:e.name==='TimeoutError'||e.name==='AbortError'?'http_timeout':'unexpected_failure'}))}
`;
const routes=[{name:'container-loopback-close',direct:true},{name:'gateway',direct:false}];
const results=[];let failure;
try{
 // Oito requisições sequenciais, no máximo 10s cada; sem retry automático.
 for(const route of routes)for(const [size,body] of [['small',small],['full',input]])for(const upsert of [false,true]){
  const start=performance.now();let phase='headers',status=null;
  const entry={route:route.name,size,payloadBytes:body.length,upsert};
  try{
   const headers={...auth,'Content-Type':'image/png','x-upsert':String(upsert)};
   if(route.direct){
    const data=execFileSync('docker',['exec','-i',storage.Name,'env','-i','PATH=/usr/local/bin:/usr/bin:/bin','/usr/local/bin/node','-e',directClient],{
     input:JSON.stringify({url:'http://127.0.0.1:5000/object/'+bucket+'/'+key,headers:{...headers,Connection:'close'},body:body.toString('base64')}),
     encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:12000});
    Object.assign(entry,JSON.parse(data));
   }else{
    const r=await fetch(env.VITE_SUPABASE_URL+'/storage/v1/object/'+bucket+'/'+key,{method:'POST',body,
     headers,redirect:'error',signal:AbortSignal.timeout(10000)});
    status=r.status;phase='body';
    const text=await r.text();assert.ok(text.length<8192,'Resposta de erro limitada');
    let value;try{value=JSON.parse(text);}catch{value={};}
    const code=String(value.error??value.code??'');
    const explicitDenial=[400,401,403,404].includes(status)&&['Unauthorized','AccessDenied','unauthorized'].includes(code);
    Object.assign(entry,{status,code:/^[A-Za-z_]{1,40}$/.test(code)?code:'UNCLASSIFIED',kind:explicitDenial?'authorization_denied':'unexpected_http'});
   }
   assert.ok(['authorization_denied','http_timeout'].includes(entry.kind),'HTTP inesperado não prova negação');
  }catch(e){
   if(e.name==='TimeoutError'||e.name==='AbortError')Object.assign(entry,{status,phase,kind:'http_timeout'});
   else{Object.assign(entry,{status,phase,kind:'unexpected_failure'});failure=e;}
  }
  entry.elapsedMs=Math.round(performance.now()-start);results.push(entry);console.log(JSON.stringify(entry));
  if(failure)throw failure;
 }
}finally{
 assert.deepEqual(snapshot(),before,'Metadata, manifesto, migrations e NOLOGIN devem permanecer intactos');
 assert.equal(digest(await read(bucket,key)),fixture.derived.sha256);
 assert.equal(digest(await read('audit-checklist-evidence',fixture.originalKey)),fixture.original.sha256);
 const after=inspect('supabase_storage_'+target);
 assert.equal(after.Id,storage.Id);assert.equal(after.State.StartedAt,storage.State.StartedAt);
 const proof={head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),storage:storage.Config.Image,
  results,objectsAndHashesPreserved:true,ledgerPreserved:true,technicalLoginEnabled:false,storageNotRestarted:true,
  complete:!failure&&results.length===8&&results.every(r=>r.kind==='authorization_denied')};
 await writeFile(outputFile,JSON.stringify(proof,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log('Integridade preservada; matriz HTTP '+(proof.complete?'completa':'parcial'));
 if(!proof.complete)process.exitCode=2;
}
