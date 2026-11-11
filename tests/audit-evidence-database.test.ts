import { createTestDatabase } from "./pglite";
import { Postgres } from "./integration/postgres.mjs";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STORAGE_STUB } from "./storage-stub";
let db: PGlite;
const uid = (n: number) =>
  `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const users = {
  admin: uid(1),
  global: uid(2),
  unitA: uid(3),
  sector: uid(4),
  empty: uid(5),
  inactive: uid(6),
  reader: uid(7),
  creator: uid(8),
  editor: uid(9),
  finalizer: uid(10),
  reopener: uid(11),
};
const A = "10000000-0000-0000-0000-000000000001";
const B = "10000000-0000-0000-0000-000000000002";
const C = "10000000-0000-0000-0000-000000000003";
const S = "20000000-0000-0000-0000-000000000001";
async function login(id: string, role = "authenticated") {
  await db.exec(
    `reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
async function one<T>(sql: string, params: unknown[] = []) {
  return (await db.query<T>(sql, params)).rows[0];
}
async function rows(sql: string, params: unknown[] = []) {
  return (await db.query(sql, params)).rows;
}
async function create(unit: string) {
  return (
    await one<{ id: string }>(
      "select audit.create_inspection($1,current_date,null) as id",
      [unit],
    )
  ).id;
}
async function inspection(id: string) {
  return one<{
    status: string;
    version: number;
    final_score: string | null;
    final_classification: string | null;
  }>("select * from audit.inspections where id=$1", [id]);
}
beforeAll(async () => {
  db = process.env.AUDIT_TEST_DATABASE_URL
    ? (new Postgres(process.env.AUDIT_TEST_DATABASE_URL) as unknown as PGlite)
    : createTestDatabase();
  // Minimal Supabase Auth contract; real PostgreSQL roles, grants, triggers and RLS.
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
 create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}', last_sign_in_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;`);
  await db.exec(STORAGE_STUB);
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  const values = Object.values(users)
    .map((id) => `('${id}','${id}@example.test',now())`)
    .join(",");
  const role = (key: string, permissions: string[]) =>
    `insert into core.roles(key,name) values ('${key}','${key}'); insert into core.role_permissions select id,p from core.roles cross join unnest(array['${permissions.join("','")}']) p where key='${key}';`;
  const assign = (
    user: string,
    key: string,
    scope = "unit",
    unit: string | null = A,
    sector: string | null = null,
  ) =>
    `insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) select '${user}',id,'${scope}',${unit ? `'${unit}'` : "null"},${sector ? `'${sector}'` : "null"} from core.roles where key='${key}';`;
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ${values};
 select private.bootstrap_administrator('${users.admin}');
 insert into core.units(id,code,name) values ('${A}','A','Unit A'),('${B}','B','Unit B'),('${C}','C','Unit C');
 insert into core.sectors(id,code,name) values ('${S}','S','Sector S');
 insert into core.unit_sectors values ('${A}','${S}');
 ${role("audit-reader", ["audit.inspection.read"])}
 ${role("audit-creator", ["audit.inspection.read", "audit.inspection.create"])}
 ${role("audit-editor", ["audit.inspection.read", "audit.inspection.edit"])}
 ${role("audit-finalizer", ["audit.inspection.read", "audit.inspection.finalize"])}
 ${role("audit-reopener", ["audit.inspection.read", "audit.inspection.reopen"])}
 ${assign(users.global, "quality", "global", null)}
 ${assign(users.unitA, "quality")}
 ${assign(users.sector, "quality", "sector", A, S)}
 ${assign(users.inactive, "quality", "global", null)}
 ${assign(users.reader, "audit-reader")}
 ${assign(users.creator, "audit-creator")}
 ${assign(users.editor, "audit-editor")}
 ${assign(users.finalizer, "audit-finalizer")}
 ${assign(users.reopener, "audit-reopener")}
 update core.units set active=false where id='${C}';
 update core.profiles set active=false where id='${users.inactive}';`);
}, 60000);
afterAll(async () => {
  await db?.close();
});

const begin=(id:string,item="item-001",name="ação.pdf",type="application/pdf",size=16)=>one<{evidence_id:string;object_key:string}>("select * from audit.begin_checklist_evidence_upload($1,$2,$3,$4,$5)",[id,item,name,type,size]);
const confirm=(id:string)=>db.query("select audit.confirm_checklist_evidence_upload($1)",[id]);
const remove=(id:string)=>db.query("select audit.remove_checklist_evidence($1)",[id]);
const list=(id:string,item:string|null=null)=>rows("select * from audit.checklist_evidence($1,$2)",[id,item]);
const finalize=(id:string,ids:string[]|null=[],version=1)=>db.query("select audit.finalize_inspection($1,$2,$3)",[id,version,ids]);
async function draft(){
 await login(users.unitA);
 return create(A);
}
async function object(key:string,owner=users.unitA,size=16,type="application/pdf"){
 await db.exec("reset role");
 await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values ('audit-checklist-evidence',$1,$2,jsonb_build_object('size',$3::integer,'mimetype',$4::text))",[key,owner,size,type]);
 await login(owner);
}
async function attach(id:string,item="item-001"){
 const b=await begin(id,item);await object(b.object_key);await confirm(b.evidence_id);return b;
}
async function fill(id:string){
 await db.exec("reset role");await db.query("update audit.inspection_answers set response='AT' where inspection_id=$1",[id]);await login(users.unitA);
}
describe("Audit checklist evidence contract", { concurrent: false }, () =>{
 it("owns criterion evidence, private bucket, minimal grants and no finalize bypass",async()=>{
  await db.exec("reset role");
  expect((await one<{e:string}>("select to_regclass('audit.checklist_evidence')::text e")).e).toBe("audit.checklist_evidence");
  expect((await one<{old:string|null}>("select to_regprocedure('audit.finalize_inspection(uuid,integer)')::text old")).old).toBeNull();
  expect(await one("select public,file_size_limit from storage.buckets where id='audit-checklist-evidence'")).toMatchObject({public:false,file_size_limit:10485760});
  const grants=await rows("select privilege_type from information_schema.role_table_grants where table_schema='audit' and table_name='checklist_evidence' and grantee='authenticated'");
  expect(grants).toEqual([{privilege_type:"SELECT"}]);
  expect((await one<{n:number}>("select count(*)::integer n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='audit_private' and p.proname like '%evidence%' and has_function_privilege('anon',p.oid,'EXECUTE')")).n).toBe(0);
 });
 it("validates composite FK without locking or changing answers",async()=>{
  const id=await draft();
  await expect(begin(id,"item-999")).rejects.toMatchObject({code:"42501"});
  const b=await begin(id);
  expect(b.object_key).toBe(id+"/"+b.evidence_id);
  expect((await inspection(id)).version).toBe(1);
  expect((await rows("select version from audit.inspection_answers where inspection_id=$1",[id])).every((x)=> (x as {version:number}).version===1)).toBe(true);
  await db.exec("reset role");
  await expect(db.query("insert into audit.checklist_evidence(inspection_id,item_key,original_name,content_type,size_bytes,created_by,inspection_version_at_begin) values($1,'item-999','x.pdf','application/pdf',16,$2,1)",[id,users.unitA])).rejects.toMatchObject({code:"23503"});
 });
 it.each(["empty","inactive","sector","reader"] as const)("denies %s mutations and hides foreign IDs",async(name)=>{
  const id=await draft();
  await login(users[name]);
  await expect(begin(id)).rejects.toMatchObject({code:"42501"});
  await expect(begin(uid(9999))).rejects.toMatchObject({code:"42501"});
  await expect(confirm(uid(9999))).rejects.toMatchObject({code:"42501"});
  await expect(remove(uid(9999))).rejects.toMatchObject({code:"42501"});
 });
 it("denies anon RPCs, inactive reads, wrong unit and sector-only reads",async()=>{
  const id=await draft();await attach(id);
  for(const user of [users.empty,users.inactive,users.sector]){
   await login(user);expect(await list(id)).toEqual([]);expect(await rows("select * from audit.checklist_evidence")).toEqual([]);
  }
  await login(users.global);expect((await list(id)).length).toBe(1);
  const foreign=await create(B);await begin(foreign);
  await login(users.unitA);expect(await list(foreign)).toEqual([]);
  await expect(begin(foreign)).rejects.toMatchObject({code:"42501"});
  await login(users.reader);expect((await list(id)).length).toBe(1);
  await login(users.unitA,"anon");await expect(list(id)).rejects.toMatchObject({code:"42501"});
 });
 it("revoga leitura de imagem entre unidades, por inativação e por retirada do grant",async()=>{
  const id=await draft();const b=await begin(id,"item-001","sintetica.jpg","image/jpeg",16);
  await object(b.object_key,users.unitA,16,"image/jpeg");await confirm(b.evidence_id);
  const allowed=()=>one("select audit_private.can_read_checklist_evidence_object($1) allowed",[b.object_key]);
  expect(await allowed()).toMatchObject({allowed:true});
  for(const change of [
   ()=>db.query("update core.profiles set active=false where id=$1",[users.unitA]),
   ()=>db.query("update core.user_role_assignments set unit_id=$1 where user_id=$2 and scope_type='unit'",[B,users.unitA]),
   ()=>db.query("delete from core.user_role_assignments where user_id=$1",[users.unitA]),
  ]){
   await db.exec("reset role;begin");
   try {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users.admin]);
    await change();await login(users.unitA);
    expect(await allowed()).toMatchObject({allowed:false});expect(await list(id)).toEqual([]);
   } finally { await db.exec("rollback;reset role"); }
   await login(users.unitA);expect(await allowed()).toMatchObject({allowed:true});
  }
 });
 it("edit-only may mutate independently of read",async()=>{
  const id=await draft();
  await db.exec("reset role");
  await db.query("delete from core.role_permissions where role_id=(select id from core.roles where key='audit-editor') and permission_key='audit.inspection.read'");
  await login(users.editor);await begin(id);expect(await list(id)).toEqual([]);
 });
 it.each([
  ["../x.pdf","application/pdf",16],["a\\\\b.pdf","application/pdf",16],[".x.pdf","application/pdf",16],["x.pdf ","application/pdf",16],
  ["x\n.pdf","application/pdf",16],["x\u202e.pdf","application/pdf",16],['a".pdf',"application/pdf",16],
  ["e\u0301.pdf","application/pdf",16],["x".repeat(177)+".pdf","application/pdf",16],
  ["x.png","application/pdf",16],["x.heic","image/heic",16],["x.xlsm","application/vnd.ms-excel",16],
  ["x.pdf","application/pdf",0],["x.pdf","application/pdf",10485761]
 ])("rejects invalid file %s / %s / %s",async(name,type,size)=>{
  const id=await draft();await expect(begin(id,"item-001",name as string,type as string,size as number)).rejects.toMatchObject({code:"23514"});
 });
 it.each([
  ["x.JPEG","image/jpeg"],["x.png","image/png"],["x.pdf","application/pdf"],
  ["x.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["x.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
 ])("accepts canonical format %s and exact maximum size",async(name,type)=>{
  const id=await draft();expect((await begin(id,"item-001",name,type,10485760)).evidence_id).toBeTruthy();
 });
 it("requires uploader, live pending and exact Storage metadata",async()=>{
  const id=await draft();const b=await begin(id);
  expect(await list(id)).toEqual([]);
  await expect(confirm(b.evidence_id)).rejects.toMatchObject({code:"23514"});
  await login(users.global);await expect(confirm(b.evidence_id)).rejects.toMatchObject({code:"42501"});
  await object(b.object_key,users.unitA,15);await expect(confirm(b.evidence_id)).rejects.toMatchObject({code:"23514"});
  await db.exec("reset role");await db.query("update storage.objects set metadata=jsonb_build_object('size',16,'mimetype','image/png') where name=$1",[b.object_key]);
  await login(users.unitA);await expect(confirm(b.evidence_id)).rejects.toMatchObject({code:"23514"});
 });
 it("confirm/remove retries emit one safe event and never change versions",async()=>{
  const id=await draft();const b=await attach(id);
  await confirm(b.evidence_id);expect((await list(id)).length).toBe(1);
  await remove(b.evidence_id);await remove(b.evidence_id);expect(await list(id)).toEqual([]);
  await expect(confirm(b.evidence_id)).rejects.toMatchObject({code:"55000"});
  expect((await inspection(id)).version).toBe(1);
  await db.exec("reset role");
  const log=await rows("select module,entity_type,action,before_data,after_data,metadata from core.system_audit_log where entity_id=$1 order by occurred_at",[b.evidence_id]);
  expect(log.map((r)=>(r as {action:string}).action)).toEqual(["evidence_add","evidence_remove"]);
  expect(log.every((r)=>(r as {module:string}).module==="audit"&&(r as {entity_type:string}).entity_type==="checklist_evidence")).toBe(true);
  expect(JSON.stringify(log)).not.toMatch(/object_key|token|signedUrl|credentials/);
 });
 it("enforces 10/criterion, 100/inspection including pending; expired/removed free slots",async()=>{
  const id=await draft();
  for(let n=0;n<10;n++)await begin(id);
  await expect(begin(id)).rejects.toMatchObject({code:"23514"});
  for(let item=2;item<=10;item++)for(let n=0;n<10;n++)await begin(id,"item-"+String(item).padStart(3,"0"));
  await expect(begin(id,"item-011")).rejects.toMatchObject({code:"23514"});
  await db.exec("reset role");
  await db.exec("alter table audit.checklist_evidence disable trigger guard_checklist_evidence");
  await db.query("update audit.checklist_evidence set created_at=clock_timestamp()-interval '2 hours' where inspection_id=$1",[id]);
  await db.exec("alter table audit.checklist_evidence enable trigger guard_checklist_evidence");
  await login(users.unitA);const b=await attach(id);await remove(b.evidence_id);await begin(id);
 });
 it("enforces Storage INSERT ownership/live lifecycle and SELECT available/read; no update/delete",async()=>{
  const id=await draft();const b=await begin(id);
  await login(users.global);
  expect(await one("select audit_private.can_upload_checklist_evidence_object($1) allowed",[b.object_key])).toMatchObject({allowed:false});
  await login(users.unitA);expect(await one("select audit_private.can_upload_checklist_evidence_object($1) allowed",[b.object_key])).toMatchObject({allowed:true});
  expect(await one("select audit_private.can_read_checklist_evidence_object($1) allowed",[b.object_key])).toMatchObject({allowed:false});
  await object(b.object_key);await confirm(b.evidence_id);
  expect(await one("select audit_private.can_read_checklist_evidence_object($1) allowed",[b.object_key])).toMatchObject({allowed:true});
  expect(await rows("update storage.objects set name='forged' where name=$1 returning id",[b.object_key])).toEqual([]);
  expect(await rows("delete from storage.objects where name=$1 returning id",[b.object_key])).toEqual([]);
  await remove(b.evidence_id);expect(await one("select audit_private.can_read_checklist_evidence_object($1) allowed",[b.object_key])).toMatchObject({allowed:false});
 });
 it("enforces authenticated Storage INSERT and denies copy/signed-upload operations",async()=>{
  const id=await draft();const b=await begin(id);
  const insert=(key:string)=>db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('audit-checklist-evidence',$1,$2,'{}')",[key,users.unitA]);
  await db.exec("select set_config('storage.operation','storage.object.upload',false)");
  await expect(insert(id+"/"+uid(999))).rejects.toMatchObject({code:"42501"});
  await login(users.global);await expect(insert(b.object_key)).rejects.toMatchObject({code:"42501"});
  await login(users.unitA);
  await db.exec("select set_config('storage.operation','storage.object.copy',false)");await expect(insert(b.object_key)).rejects.toMatchObject({code:"42501"});
  await db.exec("select set_config('storage.operation','storage.object.upload',false)");await insert(b.object_key);
  const expired=await begin(id);
  await db.exec("reset role;alter table audit.checklist_evidence disable trigger guard_checklist_evidence");
  await db.query("update audit.checklist_evidence set created_at=clock_timestamp()-interval '2 hours' where id=$1",[expired.evidence_id]);
  await db.exec("alter table audit.checklist_evidence enable trigger guard_checklist_evidence");await login(users.unitA);
  await expect(insert(expired.object_key)).rejects.toMatchObject({code:"42501"});
  const old=await begin(id);await fill(id);await finalize(id);
  await expect(insert(old.object_key)).rejects.toMatchObject({code:"42501"});
  await db.query("select audit.reopen_inspection($1,2)",[id]);
  await expect(insert(old.object_key)).rejects.toMatchObject({code:"42501"});
 });
 it("binds finalize to every available ID across criteria as sorted distinct sets",async()=>{
  const id=await draft();const a=await attach(id),b=await attach(id,"item-150");await fill(id);
  await expect(finalize(id,null)).rejects.toMatchObject({code:"23514"});
  await expect(finalize(id,[])).rejects.toMatchObject({code:"40001"});
  await expect(finalize(id,[a.evidence_id])).rejects.toMatchObject({code:"40001"});
  await expect(finalize(id,[a.evidence_id,b.evidence_id,uid(999)])).rejects.toMatchObject({code:"40001"});
  await finalize(id,[b.evidence_id,a.evidence_id,a.evidence_id]);
  expect((await inspection(id)).status).toBe("finalized");
  expect((await list(id)).length).toBe(2);
  await expect(begin(id)).rejects.toMatchObject({code:"55000"});
  await expect(confirm(a.evidence_id)).rejects.toMatchObject({code:"55000"});
  await expect(remove(a.evidence_id)).rejects.toMatchObject({code:"55000"});
  await db.exec("reset role");const l=await one<{metadata:{evidence_ids:string[]}}>("select metadata from core.system_audit_log where entity_id=$1 and action='finalize'",[id]);
  expect(l.metadata.evidence_ids).toEqual([a.evidence_id,b.evidence_id].sort());
 });
 it("reopen retains available/removed, invalidates old pending, re-finalize preserves both snapshots",async()=>{
  const id=await draft();const keep=await attach(id),gone=await attach(id),pending=await begin(id);
  await object(pending.object_key);await remove(gone.evidence_id);await fill(id);await finalize(id,[keep.evidence_id]);
  await db.query("select audit.reopen_inspection($1,2)",[id]);
  await expect(confirm(pending.evidence_id)).rejects.toMatchObject({code:"55000"});
  expect((await list(id)).map((e)=>(e as {id:string}).id)).toEqual([keep.evidence_id]);
  await remove(keep.evidence_id);await finalize(id,[],3);
  await db.exec("reset role");
  const logs=await rows("select metadata from core.system_audit_log where entity_id=$1 and action='finalize' order by occurred_at",[id]);
  expect(logs).toEqual([{metadata:{evidence_ids:[keep.evidence_id]}},{metadata:{evidence_ids:[]}}]);
 });
 it("expires pending at decision time and reconciles missing/expired/orphan metadata privately",async()=>{
  const id=await draft();const b=await begin(id),available=await attach(id);
  await db.exec("reset role");await db.exec("alter table audit.checklist_evidence disable trigger guard_checklist_evidence");
  await db.query("update audit.checklist_evidence set created_at=clock_timestamp()-interval '2 hours' where id=$1",[b.evidence_id]);
  await db.exec("alter table audit.checklist_evidence enable trigger guard_checklist_evidence");
  await db.query("delete from storage.objects where name=$1",[available.object_key]);
  await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('audit-checklist-evidence',$1,$2,'{}')",[id+"/"+uid(999),users.unitA]);
  const report=await rows("select issue from audit_private.checklist_evidence_reconciliation() where object_key like $1 order by issue",[id+"/%"]);
  expect(report).toEqual([{issue:"available_missing_object"},{issue:"expired_pending"},{issue:"orphan_object"}]);
  await login(users.unitA);await expect(confirm(b.evidence_id)).rejects.toMatchObject({code:"55000"});
  await expect(db.query("select * from audit_private.checklist_evidence_reconciliation()")).rejects.toMatchObject({code:"42501"});
 });
});

// PostgreSQL/PGlite real para SQL/RLS; Storage/Auth são stubs, não prova da API self-hosted.
describe('AUD-IMG-02: manifesto, fila e RLS em memória', { concurrent: false }, () => {
 it.each(['a','b','uuid'] as const)('global_new processa duas auditorias novas, recupera só leases do corte e preserva o acervo (ordem %s)',async(order)=>{
  await db.exec("reset role;begin;update audit.checklist_evidence_derivatives set state='failed',attempts=5,lease_id=null,lease_until=null");
  const globalClaim=async()=>{await db.exec('reset role');return (await one<{job:{lease:string;evidence:{id:string}}|null}>('select audit_private.runtime_derivative_claim(null) job')).job;};
  try{
   const old=await png(),expired=await png();await db.exec('reset role');
   await db.query("update audit.checklist_evidence_derivatives set state='processing',attempts=5,lease_id=gen_random_uuid(),lease_until=clock_timestamp()-interval '1 second' where evidence_id=$1",[expired.evidence_id]);
   await login(users.unitA);const pending=await begin(old.inspection,'item-002','late.png','image/png',800);
   await object(pending.object_key,users.unitA,800,'image/png');await confirm(pending.evidence_id);
   const a=await png(),b=await png();await db.exec('reset role');
   const archive=[old.evidence_id,expired.evidence_id,pending.evidence_id];
   const fresh=[a.evidence_id,b.evidence_id];
   // Tempos sintéticos explícitos: chamadas sequenciais podem cair no mesmo ms no PGlite.
   // O corte SQL é inclusivo. Acervo fica 1 µs antes; uploads novos ficam exatamente no corte.
   const {cutoff}=await one<{cutoff:string}>("select (clock_timestamp()-interval '1 minute')::text cutoff");
   await db.exec('alter table audit.checklist_evidence disable trigger guard_checklist_evidence');
   try{
    await db.query("update audit.checklist_evidence set created_at=$1::timestamptz-case when id=any($2::uuid[]) then interval '1 microsecond' else interval '0' end where id=any($3::uuid[])",[cutoff,archive,[...archive,...fresh]]);
   }finally{await db.exec('alter table audit.checklist_evidence enable trigger guard_checklist_evidence');}
   await db.query("update audit.checklist_evidence_derivatives set created_at=$1::timestamptz-interval '1 microsecond' where evidence_id=any($2::uuid[])",[cutoff,[old.evidence_id,expired.evidence_id]]);
   // A confirmação tardia cria job no corte, mas o início anterior deve excluí-lo.
   await db.query("update audit.checklist_evidence_derivatives set created_at=$1::timestamptz where evidence_id=$2",[cutoff,pending.evidence_id]);
   const expectedFirst=order==='uuid'?[...fresh].sort()[0]:order==='a'?a.evidence_id:b.evidence_id;
   const expectedSecond=fresh.find(id=>id!==expectedFirst)!;
   // Duas prioridades possíveis e empate total com desempate por UUID; nenhum FIFO implícito.
   await db.query("update audit.checklist_evidence_derivatives set created_at=$1::timestamptz,next_attempt_at=$1::timestamptz+case when $2::boolean and evidence_id=$3::uuid then interval '1 microsecond' else interval '0' end where evidence_id=any($4::uuid[])",[cutoff,order!=='uuid',expectedSecond,fresh]);
   const archiveRows=()=>rows('select to_jsonb(d) value from audit.checklist_evidence_derivatives d where evidence_id=any($1::uuid[]) order by evidence_id',[archive]);
   const originals=()=>rows('select to_jsonb(e) value from audit.checklist_evidence e where id=any($1::uuid[]) order by id',[[...archive,...fresh]]);
   const objects=()=>rows('select to_jsonb(o) value from storage.objects o order by id');
   const before=await archiveRows(),originalsBefore=await originals(),objectsBefore=await objects();
   await db.query("select set_config('audit_derivative.created_after',$1,true),set_config('audit_derivative.queue_mode','global_new',true)",[cutoff]);
   const first=await globalClaim();expect(first?.evidence.id).toBe(expectedFirst);expect(await globalClaim()).toBeNull();
   // Crash do one-shot: só depois de expirar a lease, sem duas execuções simultâneas.
   await db.query("update audit.checklist_evidence_derivatives set lease_until=clock_timestamp()-interval '1 second' where evidence_id=$1",[expectedFirst]);
   const retry=await globalClaim();expect(retry?.evidence.id).toBe(expectedFirst);expect(retry?.lease).not.toBe(first?.lease);
   expect(await one('select audit_private.runtime_derivative_fail($1) ok',[first?.lease])).toEqual({ok:false});
   expect(await one('select attempts from audit.checklist_evidence_derivatives where evidence_id=$1',[expectedFirst])).toEqual({attempts:2});
   await db.query("select set_config('audit_derivative.failure_code','derivative_not_smaller',true)");
   expect(await one('select audit_private.runtime_derivative_fail($1) ok',[retry?.lease])).toEqual({ok:true});
   const second=await globalClaim();expect(second?.evidence.id).toBe(expectedSecond);
   expect(new Set([first?.evidence.id,second?.evidence.id])).toEqual(new Set(fresh));
   expect(await one('select attempts from audit.checklist_evidence_derivatives where evidence_id=$1',[expectedSecond])).toEqual({attempts:1});
   expect(await one('select audit_private.runtime_derivative_fail($1) ok',[second?.lease])).toEqual({ok:true});expect(await globalClaim()).toBeNull();
   expect(await rows("select state,attempts,error_code,lease_id,lease_until from audit.checklist_evidence_derivatives where evidence_id=any($1::uuid[])",[fresh])).toEqual(fresh.map(()=>({state:'failed',attempts:5,error_code:'derivative_not_smaller',lease_id:null,lease_until:null})));
   expect(await archiveRows()).toEqual(before);expect(await originals()).toEqual(originalsBefore);expect(await objects()).toEqual(objectsBefore);
   // Job elegível para o corte original permanece excluído por uma sessão com corte posterior.
   await db.query("update audit.checklist_evidence_derivatives set state='pending',attempts=0,error_code=null where evidence_id=$1",[expectedFirst]);
   await db.query("select set_config('audit_derivative.created_after',($1::timestamptz+interval '2 microseconds')::text,true)",[cutoff]);
   expect(await globalClaim()).toBeNull();
   await db.query("select set_config('audit_derivative.created_after',$1,true)",[cutoff]);
   expect((await globalClaim())?.evidence.id).toBe(expectedFirst);
  }finally{await db.exec('rollback;reset role');}
 });
 it.each(['derivative_dimensions_exceeded','derivative_invalid_image'])('encerra %s pela lease atual e preserva RLS',async(reason)=>{
  await db.exec("reset role;begin;update audit.checklist_evidence_derivatives set state='failed',attempts=5,lease_id=null,lease_until=null");
  try{
   const fresh=await png();
   await db.exec('reset role');
   const {job}=await one<{job:{lease:string;evidence:{id:string}}}>('select audit_private.runtime_derivative_claim(null) job');
   expect(job.evidence.id).toBe(fresh.evidence_id);
   expect(await one('select attempts from audit.checklist_evidence_derivatives where evidence_id=$1',[fresh.evidence_id])).toEqual({attempts:1});
   await db.query("select set_config('audit_derivative.failure_code',$1,true)",[reason]);
   expect(await one('select audit_private.runtime_derivative_fail($1) ok',[uid(999)])).toEqual({ok:false});
   expect(await one('select audit_private.runtime_derivative_fail($1) ok',[job.lease])).toEqual({ok:true});
   expect(await one('select audit_private.runtime_derivative_claim(null) job')).toEqual({job:null});
   await login(users.reader);
   expect(await rows('select * from audit.checklist_evidence_thumbnail_state($1)',[fresh.evidence_id])).toEqual([{state:'failed',reason,retryable:false}]);
   await login(users.inactive);
   expect(await rows('select * from audit.checklist_evidence_thumbnail_state($1)',[fresh.evidence_id])).toEqual([]);
  }finally{await db.exec('rollback;reset role');}
 });
 it('global_new exige corte explícito e rejeita filtros inválidos sem tocar a fila',async()=>{
  for(const [mode,after,inspection] of [['global_new','',''],['global_new','infinity',''],['global_new','2099-01-01',''],['global_new','2026-01-01',A],['unknown','','']]){
   await db.exec('reset role;begin');
   try{
    await db.query("select set_config('audit_derivative.queue_mode',$1,true),set_config('audit_derivative.created_after',$2,true),set_config('audit_derivative.inspection_id',$3,true)",[mode,after,inspection]);
    await expect(claim()).rejects.toMatchObject({code:'42501'});
   }finally{await db.exec('rollback;reset role');}
  }
 });
 it('executor filtra uploads novos da auditoria, preserva outras filas e termina imagens sem ganho',async()=>{
  await db.exec("reset role;begin;update audit.checklist_evidence_derivatives set state='failed',attempts=5,lease_id=null,lease_until=null");
  try{
   const old=await png();await db.exec('reset role');
   const {cutoff}=await one<{cutoff:string}>('select clock_timestamp()::text cutoff');
   const outside=await png();await login(users.unitA);
   const fresh=await begin(old.inspection,'item-002','fresh.png','image/png',800);
   await object(fresh.object_key,users.unitA,800,'image/png');await confirm(fresh.evidence_id);await db.exec('reset role');
   await db.query("select set_config('audit_derivative.created_after',$1,true),set_config('audit_derivative.inspection_id',$2,true)",[cutoff,old.inspection]);
   const job=await one<{job:{lease:string;evidence:{id:string}}}>('select audit_private.runtime_derivative_claim(null) job');
   expect(job.job.evidence.id).toBe(fresh.evidence_id);
   expect(await rows('select attempts,state from audit.checklist_evidence_derivatives where evidence_id=any($1::uuid[])',[ [old.evidence_id,outside.evidence_id] ])).toEqual([{attempts:0,state:'pending'},{attempts:0,state:'pending'}]);
   await db.query("select set_config('audit_derivative.failure_code','derivative_not_smaller',true)");
   expect(await one('select audit_private.runtime_derivative_fail($1) ok',[job.job.lease])).toEqual({ok:true});
   await login(users.reader);
   expect(await rows('select * from audit.checklist_evidence_thumbnail_state($1)',[fresh.evidence_id])).toEqual([{state:'failed',reason:'derivative_not_smaller',retryable:false}]);
   expect(await rows('select * from audit.checklist_evidence_thumbnail($1)',[fresh.evidence_id])).toEqual([]);
   for(const u of [users.empty,users.inactive,users.sector]){await login(u);expect(await rows('select * from audit.checklist_evidence_thumbnail_state($1)',[fresh.evidence_id])).toEqual([]);}
   await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users.admin]);
   await db.query("update core.user_role_assignments set unit_id=$1 where user_id=$2 and scope_type='unit'",[B,users.unitA]);
   await login(users.unitA);expect(await rows('select * from audit.checklist_evidence_thumbnail_state($1)',[fresh.evidence_id])).toEqual([]);
   await login(users.unitA,'anon');await db.exec('savepoint anon_state');
   await expect(db.query('select * from audit.checklist_evidence_thumbnail_state($1)',[fresh.evidence_id])).rejects.toMatchObject({code:'42501'});
   await db.exec('rollback to anon_state');
  }finally{await db.exec('rollback;reset role');}
 });
 const claim = async () => { await db.exec('reset role'); return (await one<{job:{lease:string; evidence:{id:string}}|null}>('select audit_private.claim_evidence_derivative() job')).job; };
 const manifest = (e:{evidence_id:string;object_key:string}) => ({ evidence_id:e.evidence_id,original_object_key:e.object_key,
  encoder_version:'img-480-v1',original_sha256:'a'.repeat(64),derived_sha256:'b'.repeat(64),
  derived_object_key:`${e.evidence_id}/img-480-v1/${'a'.repeat(64)}/${'b'.repeat(64)}.png`,mime:'image/png',width:480,height:320,bytes:120 });
 const prepare = (lease:string,m:unknown) => one<{ok:boolean}>('select audit_private.prepare_evidence_derivative($1,$2) ok',[lease,JSON.stringify(m)]);
 const complete = (lease:string) => one<{ok:boolean}>('select audit_private.complete_evidence_derivative($1) ok',[lease]);
 async function png() {
  const inspection=await draft(); const e=await begin(inspection,'item-001','synthetic.png','image/png',800);
  await object(e.object_key,users.unitA,800,'image/png'); await confirm(e.evidence_id);
  return {...e,inspection};
 }
 async function ready() {
  const e=await png();const job=await claim();expect(job?.evidence.id).toBe(e.evidence_id);
  const m=manifest(e);expect(await prepare(job!.lease,m)).toEqual({ok:true});
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('audit-evidence-thumbnails',$1,jsonb_build_object('size',120,'mimetype','image/png'))",[m.derived_object_key]);
  expect(await complete(job!.lease)).toEqual({ok:true});return {...e,m};
 }
 // Cada caso fica isolado em transação em memória; nenhuma exclusão em banco persistente.
 it('bucket privado, EXECUTE técnico fechado e fila apenas após confirmação idempotente',async()=>{
  await db.exec("reset role;begin;update audit.checklist_evidence_derivatives set state='failed',attempts=5,lease_id=null,lease_until=null");try{
   expect(await one("select public,file_size_limit from storage.buckets where id='audit-evidence-thumbnails'")).toMatchObject({public:false,file_size_limit:1048576});
   const inspection=await draft();const e=await begin(inspection,'item-001','synthetic.png','image/png',800);
   await db.exec('reset role');expect(await rows('select * from audit.checklist_evidence_derivatives where evidence_id=$1',[e.evidence_id])).toEqual([]);
   await object(e.object_key,users.unitA,800,'image/png');await confirm(e.evidence_id);await confirm(e.evidence_id);
   await db.exec('reset role');expect((await rows('select * from audit.checklist_evidence_derivatives where evidence_id=$1',[e.evidence_id])).length).toBe(1);
   for(const role of ['anon','authenticated']){
    const functions=await rows("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='audit_private' and p.proname in ('claim_evidence_derivative','prepare_evidence_derivative','complete_evidence_derivative','fail_evidence_derivative') and has_function_privilege($1,p.oid,'EXECUTE')",[role]);expect(functions).toEqual([]);
   }
   await login(users.unitA);await expect(db.query('select audit_private.claim_evidence_derivative()')).rejects.toMatchObject({code:'42501'});
  }finally{await db.exec('rollback;reset role');}
 });
 it('claim serial, lease expirada, retry/backoff e CAS obsoleto',async()=>{
  await db.exec("reset role;begin;update audit.checklist_evidence_derivatives set state='failed',attempts=5,lease_id=null,lease_until=null");try{
   // Outros testes históricos confirmam só PDFs; este conjunto contém os únicos jobs JPEG/PNG.
   const e=await png();const first=await claim();expect(first?.evidence.id).toBe(e.evidence_id);
   expect(await claim()).toBeNull();
   await db.query("update audit.checklist_evidence_derivatives set lease_until=clock_timestamp()-interval '1 second' where evidence_id=$1",[e.evidence_id]);
   const retry=await claim();expect(retry?.lease).not.toBe(first?.lease);
   expect(await complete(first!.lease)).toEqual({ok:false});
   const second=await png();await db.exec('reset role');
   expect(await one('select audit_private.fail_evidence_derivative($1) ok',[retry!.lease])).toEqual({ok:true});
   expect(await one("select state,attempts,next_attempt_at>clock_timestamp() backoff from audit.checklist_evidence_derivatives where evidence_id=$1",[e.evidence_id])).toMatchObject({state:'failed',attempts:2,backoff:true});
   const other=await claim();expect(other?.evidence.id).toBe(second.evidence_id);
   await db.query('select audit_private.fail_evidence_derivative($1)',[other!.lease]);
   await db.query("update audit.checklist_evidence_derivatives set next_attempt_at=clock_timestamp()-interval '1 second',attempts=5 where evidence_id=$1",[e.evidence_id]);
   expect(await claim()).toBeNull();
  }finally{await db.exec('rollback;reset role');}
 });
 it('ready exige reserva, objeto coerente e evidência disponível; ID/key manipulados negados',async()=>{
  await db.exec("reset role;begin;update audit.checklist_evidence_derivatives set state='failed',attempts=5,lease_id=null,lease_until=null");try{
   const e=await png();const job=await claim();const m=manifest(e);
   expect(await complete(job!.lease)).toEqual({ok:false});
   expect(await prepare(job!.lease,{...m,evidence_id:uid(99999)})).toEqual({ok:false});
   // Erros são testados em savepoint para não abortar a transação da fixture.
   await db.exec('savepoint invalid_key');
   await expect(prepare(job!.lease,{...m,derived_object_key:'another/object'})).rejects.toMatchObject({code:'23514'});
   await db.exec('rollback to invalid_key');
   expect(await prepare(job!.lease,m)).toEqual({ok:true});expect(await complete(job!.lease)).toEqual({ok:false});
   await db.query("insert into storage.objects(bucket_id,name,metadata) values('audit-evidence-thumbnails',$1,'{\"size\":119,\"mimetype\":\"image/png\"}')",[m.derived_object_key]);
   expect(await complete(job!.lease)).toEqual({ok:false});
   await login(users.unitA);await remove(e.evidence_id);await db.exec('reset role');
   expect(await complete(job!.lease)).toEqual({ok:false});
  }finally{await db.exec('rollback;reset role');}
 });
 it('RLS e helper da assinatura negam pending/failed, anônimo, outra unidade, inativo e setor; finalized legível',async()=>{
  await db.exec("reset role;begin;update audit.checklist_evidence_derivatives set state='failed',attempts=5,lease_id=null,lease_until=null");try{
   const e=await ready();expect(await claim()).toBeNull();
   const access=()=>one<{ok:boolean}>('select audit_private.can_read_evidence_derivative($1) ok',[e.m.derived_object_key]);
   const lookup=()=>rows('select * from audit.checklist_evidence_thumbnail($1)',[e.evidence_id]);
   await login(users.unitA);expect(await access()).toEqual({ok:true});expect((await lookup()).length).toBe(1);
   for(const u of [users.empty,users.inactive,users.sector]){await login(u);expect(await access()).toEqual({ok:false});expect(await lookup()).toEqual([]);expect(await rows('select * from audit.checklist_evidence_derivatives')).toEqual([]);expect(await rows("select * from storage.objects where bucket_id='audit-evidence-thumbnails'")).toEqual([]);}
   await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users.admin]);await db.query("update core.user_role_assignments set unit_id=$1 where user_id=$2 and scope_type='unit'",[B,users.unitA]);
   await login(users.unitA);expect(await lookup()).toEqual([]);
   await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[users.admin]);await db.query("update core.user_role_assignments set unit_id=$1 where user_id=$2 and scope_type='unit'",[A,users.unitA]);
   await fill(e.inspection);await finalize(e.inspection,[e.evidence_id]);expect((await lookup()).length).toBe(1);
   await db.query('select audit.reopen_inspection($1,2)',[e.inspection]);expect((await lookup()).length).toBe(1);
   expect(await one('select version from audit.inspections where id=$1',[e.inspection])).toMatchObject({version:3});
   await remove(e.evidence_id);expect(await lookup()).toEqual([]);expect(await access()).toEqual({ok:false});
   await login(users.unitA,'anon');await db.exec('savepoint anon_access');
   await expect(lookup()).rejects.toMatchObject({code:'42501'});await db.exec('rollback to anon_access');
  }finally{await db.exec('rollback;reset role');}
 });
 it('grant revogado/inativação esvaziam leitura; objeto órfão/chave adulterada nunca liberados',async()=>{
  await db.exec("reset role;begin;update audit.checklist_evidence_derivatives set state='failed',attempts=5,lease_id=null,lease_until=null");try{
   const e=await ready();
   await db.query("update core.profiles set active=false where id=$1",[users.unitA]);await login(users.unitA);
   expect(await rows('select * from audit.checklist_evidence_thumbnail($1)',[e.evidence_id])).toEqual([]);
   await db.exec('reset role');await db.query('update core.profiles set active=true where id=$1',[users.unitA]);
   await db.query('delete from core.user_role_assignments where user_id=$1',[users.unitA]);await login(users.unitA);
   expect(await rows('select * from audit.checklist_evidence_thumbnail($1)',[e.evidence_id])).toEqual([]);
   await login(users.global);expect(await one("select audit_private.can_read_evidence_derivative('another/object') ok")).toEqual({ok:false});
   await db.exec('reset role');await db.query("update audit.checklist_evidence_derivatives set state='failed' where evidence_id=$1",[e.evidence_id]);
   await login(users.global);expect(await rows('select * from audit.checklist_evidence_thumbnail($1)',[e.evidence_id])).toEqual([]);
  }finally{await db.exec('rollback;reset role');}
 });
 it('usuário comum não grava manifesto nem INSERT/UPDATE/DELETE/copy/move no bucket',async()=>{
  await db.exec("reset role;begin;update audit.checklist_evidence_derivatives set state='failed',attempts=5,lease_id=null,lease_until=null");try{
   const e=await ready();await login(users.unitA);
   for(const sql of ["insert into storage.objects(bucket_id,name) values('audit-evidence-thumbnails','forged')",
    "insert into audit.checklist_evidence_derivatives(evidence_id,encoder_version,original_object_key) values(gen_random_uuid(),'img-480-v1','forged')",
    "update audit.checklist_evidence_derivatives set state='failed'"]){
    await db.exec('savepoint forbidden');await expect(db.exec(sql)).rejects.toMatchObject({code:'42501'});await db.exec('rollback to forbidden');
   }
   expect(await rows("update storage.objects set name='moved' where name=$1 returning id",[e.m.derived_object_key])).toEqual([]);
   expect(await rows('delete from storage.objects where name=$1 returning id',[e.m.derived_object_key])).toEqual([]);
   // COPY usa INSERT; a policy restritiva nega mesmo com operação de Storage forjada.
   await db.exec("select set_config('storage.operation','storage.object.copy',false);savepoint copy_denied");
   await expect(db.exec("insert into storage.objects(bucket_id,name) values('audit-evidence-thumbnails','copy')")).rejects.toMatchObject({code:'42501'});
   await db.exec('rollback to copy_denied');
  }finally{await db.exec('rollback;reset role');}
 });
});
