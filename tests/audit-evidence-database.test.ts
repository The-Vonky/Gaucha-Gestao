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
    : new PGlite();
  // Minimal Supabase Auth contract; real PostgreSQL roles, grants, triggers and RLS.
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
 create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
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
describe.sequential("Audit checklist evidence contract",()=>{
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
