import { readFileSync, readdirSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createTestDatabase } from "./pglite";
import { STORAGE_STUB } from "./storage-stub";
const db = createTestDatabase();
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
async function owner(sql: string, args: unknown[] = []) {
  await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)");
  return db.query(sql,args);
}
async function login(n: number | null, role = "authenticated") {
  await db.exec(`reset role; set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n ? uid(n) : ""]);
}
type Row = { id: string; version: number; state: string; status: string; title: string; created_by: string };
const input = { p_id: null, p_expected_version: null, p_title: "Assunto sintético", p_message: "Somente conteúdo sintético.", p_category: "information", p_tone: "info", p_priority: 0, p_starts_at: null, p_ends_at: null, p_state: "draft", p_show_feedback: true };
async function rpc<T>(name: string,args: unknown[] = []) {
 return (await db.query<{result:T}>(`select public.announcements_${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result;
}
const save = (changes: Record<string,unknown> = {}) => rpc<Row>("notice_save",Object.values({...input,...changes}));
const edit = (row: Row,changes: Record<string,unknown> = {}) => save({p_id:row.id,p_expected_version:row.version,...changes});
const feed = () => rpc<{announcements: {id:string;title:string}[];nextRefreshAt:string|null}>("published");
const denied = (promise:Promise<unknown>, code="42501") => expect(promise).rejects.toMatchObject({code});
beforeAll(async()=>{
 await db.exec(readFileSync("tests/fixtures/room-booking-auth.sql","utf8")); await db.exec(STORAGE_STUB);
 for(const file of readdirSync("supabase/migrations").sort()) await db.exec(readFileSync(`supabase/migrations/${file}`,"utf8"));
 for(let n=1;n<=5;n++) await owner("insert into auth.users(id,email) values($1,$2)",[uid(n),`gg10-${n}@example.test`]);
 await owner(`insert into core.user_role_assignments(user_id,role_id,scope_type)
 select $1,id,'global' from core.roles where key='platform_administrator'`,[uid(1)]);
 await owner(`insert into core.user_role_assignments(user_id,role_id,scope_type)
 select $1,id,'global' from core.roles where key='announcement_manager'`,[uid(2)]);
 await owner(`insert into core.user_role_assignments(user_id,role_id,scope_type)
 select $1,id,'global' from core.roles where key='announcement_manager'`,[uid(4)]);
 await owner("update core.profiles set active=false where id=$1",[uid(4)]);
},60_000);
afterAll(()=>db.close());

describe("GG-10 — autorização e persistência",()=>{
 it("composição exata e D5-B; nenhum outro acesso ao Gestor",async()=>{
  const result=await owner(`select rp.permission_key from core.role_permissions rp join core.roles r on r.id=rp.role_id where r.key='announcement_manager'`);
  expect(result.rows).toEqual([{permission_key:"announcements.notice.manage"}]);
  expect((await owner(`select 1 from core.role_permissions rp join core.roles r on r.id=rp.role_id where r.key in ('platform_administrator','announcement_manager') and rp.permission_key='room_booking.manage'`)).rows).toEqual([]);
  await login(2); expect((await db.query("select * from core.my_access()")).rows).toHaveLength(1);
  expect((await db.query<{key:string}>("select key from core.roles")).rows).toEqual([{key:"announcement_manager"}]);
  expect((await db.query("update core.roles set name='Tentativa' returning id")).rows).toEqual([]);
 });
 it("administrador e Gestor criam, publicam, desativam e registram histórico",async()=>{
  for(const user of [1,2]){
   await login(user); const draft=await save(); expect(draft).toMatchObject({version:1,status:'draft',created_by:uid(user)});
   expect((await feed()).announcements.some(n=>n.id===draft.id)).toBe(false);
   const published=await edit(draft,{p_state:'published'}); expect(published.status).toBe('active');
   expect((await feed()).announcements.some(n=>n.id===draft.id)).toBe(true);
   const inactive=await edit(published,{p_state:'inactive'}); expect(inactive.status).toBe('inactive');
   expect((await feed()).announcements.some(n=>n.id===draft.id)).toBe(false);
   const history=await rpc<{items:{version:number;actor_user_id:string}[];total:number}>('notice_history',[draft.id]);
   expect(history.total).toBe(3);expect(history.items.map(h=>h.version)).toEqual([3,2,1]);
   expect(history.items.every(h=>h.actor_user_id===uid(user))).toBe(true);
  }
  const logs=await owner("select after_data from core.system_audit_log where module='announcements'");
  expect(logs.rows).toHaveLength(6);expect(JSON.stringify(logs.rows)).not.toContain('Somente conteúdo');
 });
 it("nega anônimo, identidade ausente, usuário comum e perfil inativo em todas RPCs administrativas",async()=>{
  for(const [user,role] of [[null,'anon'],[null,'authenticated'],[3,'authenticated'],[4,'authenticated']] as const){
   await login(user,role);await denied(save());await denied(rpc('manage_list'));await denied(rpc('notice_history',[uid(99)]));
   if(user!==3) await denied(feed());
  }
 });
 it("nega grant revogado, papel inativo, permissão inativa e relação retirada sem confiar no nome",async()=>{
  for(const [disable,enable] of [
   ["update core.user_role_assignments set active=false where user_id=$1","update core.user_role_assignments set active=true where user_id=$1"],
   ["update core.roles set active=false where key='announcement_manager' and $1::uuid is not null","update core.roles set active=true where key='announcement_manager' and $1::uuid is not null"],
   ["update core.permissions set active=false where key='announcements.notice.manage' and $1::uuid is not null","update core.permissions set active=true where key='announcements.notice.manage' and $1::uuid is not null"],
   ["delete from core.role_permissions where permission_key='announcements.notice.manage' and role_id=(select id from core.roles where key='announcement_manager') and $1::uuid is not null","insert into core.role_permissions select id,'announcements.notice.manage' from core.roles where key='announcement_manager' and $1::uuid is not null"],
  ]){
   await owner(disable,[uid(2)]);await login(2);await denied(save());await denied(rpc('manage_list'));await owner(enable,[uid(2)]);
  }
 });
 it("nega gestão em escopo unitário/setorial mesmo com capacidade em papel personalizado",async()=>{
  await owner("insert into core.units(id,code,name) values($1,'GG10-U','Sintética')",[uid(90)]);
  await owner("insert into core.sectors(id,code,name) values($1,'GG10-S','Sintético')",[uid(91)]);
  await owner("insert into core.unit_sectors values($1,$2)",[uid(90),uid(91)]);
  await owner("insert into core.roles(id,key,name) values($1,'gg10_scoped','Sintético')",[uid(92)]);
  await owner("insert into core.role_permissions values($1,'announcements.notice.manage')",[uid(92)]);
  for(const scope of ['unit','sector']){
   await owner("insert into core.user_role_assignments(user_id,role_id,scope_type,unit_id,sector_id) values($1,$2,$3,$4,$5)",[uid(5),uid(92),scope,uid(90),scope==='sector'?uid(91):null]);
   await login(5);await denied(save());await denied(rpc('manage_list'));
  }
 });
 it("DML, helpers e histórico privados negados mesmo para gestor; RLS nega após grant sintético",async()=>{
  await login(2);
  for(const sql of ["select * from announcements.notices","update announcements.notices set state='published'","delete from announcements.notices","insert into announcements.notice_history(notice_id,version,actor_user_id,after_data) values(gen_random_uuid(),1,auth.uid(),'{}')","select announcements_private.authorize(true)"])
   await denied(db.query(sql));
  await owner("grant usage on schema announcements to authenticated");
  await owner("grant select,update,delete on announcements.notices to authenticated");
  await login(2);expect((await db.query("select * from announcements.notices")).rows).toEqual([]);
  expect((await db.query("update announcements.notices set state='published' returning id")).rows).toEqual([]);
  await owner("revoke all on schema announcements from authenticated");
  await owner("revoke all on announcements.notices from authenticated");
 });
 it("edição obsoleta é negada e histórico não muda; arquivo é terminal",async()=>{
  await login(2);const first=await save();const second=await edit(first,{p_title:'Versão nova'});
  await denied(edit(first,{p_message:'Tentativa obsoleta'}),'40001');
  expect((await rpc<{total:number}>('notice_history',[first.id])).total).toBe(2);
  const archived=await edit(second,{p_state:'archived'});await denied(edit(archived),'55000');
  await owner("select set_config('request.jwt.claim.sub',$1,false)",[uid(2)]);
  await denied(db.query("delete from announcements.notices where id=$1",[first.id]),'55000');
  await denied(db.query("update announcements.notice_history set after_data='{}' where notice_id=$1",[first.id]),'55000');
 });
 it.each([
  {p_title:''},{p_title:'x'.repeat(121)},{p_message:'x'.repeat(1601)},
  {p_message:'<script>alert(1)</script>'},{p_title:'<img onerror=alert(1)>'},
  {p_category:'unknown'},{p_tone:'red'},{p_state:'unknown'},{p_starts_at:'infinity'},
  {p_starts_at:'2026-11-06T12:00:00Z',p_ends_at:'2026-11-06T12:00:00Z'},
 ])("rejeita entrada inválida %j",async changes=>{await login(2);await denied(save(changes),'23514');});
 it("ordena antes da paginação, aceita adjacência e rejeita conflitos em criação ou edição",async()=>{
  await login(2);
  const expired=await save({p_state:'published',p_ends_at:'2000-01-01T00:00:00Z'});
  const active=await save({p_state:'published',p_starts_at:'2000-01-01T00:00:00Z',
   p_ends_at:'2099-01-01T00:00:00Z',p_priority:10000,p_category:'critical',p_tone:'neutral'});
  const scheduled=await save({p_title:'Futuro reservado',p_state:'published',
   p_starts_at:'2099-01-01T00:00:00Z',p_category:'maintenance',p_tone:'info'});
  for(let i=0;i<21;i++) await save({p_title:'Rascunho reservado'});
  expect(expired.status).toBe('expired');
  expect(scheduled.status).toBe('scheduled');
  expect(active).toMatchObject({status:'active',priority:0,tone:'neutral'});
  expect((await rpc<{items:Row[]}>('manage_list',[20,0])).items[0].id).toBe(active.id);
  expect((await rpc<{items:Row[]}>('manage_list',[20,20])).items.some(n=>n.id===active.id)).toBe(false);
  await denied(save({p_state:'published'}),'23P01');
  await denied(edit(scheduled,{p_state:'published',p_starts_at:'2098-01-01T00:00:00Z'}),'23P01');
  await login(3);
  const published=await feed();expect(published.announcements.map(n=>n.id)).toEqual([active.id]);
  expect(published.nextRefreshAt).toBeTruthy();
  expect(JSON.stringify(published)).not.toMatch(/Rascunho reservado|Futuro reservado|created_by|updated_by|before_data/);
  await denied(rpc('notice_history',[active.id]));
 });
 it("paginação é limitada e schema/funções não expõem privilégios",async()=>{
  await login(2);await denied(rpc('manage_list',[101,0]),'23514');await denied(rpc('notice_history',[uid(99),20,-1]),'23514');
  const page=await rpc<{items:Row[];total:number}>('manage_list',[1,0]);expect(page.items).toHaveLength(1);expect(page.total).toBeGreaterThan(1);
  const functions=await owner("select proname,proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'announcements_%'");
  expect(functions.rows).toHaveLength(4);expect(functions.rows.every(f=>JSON.stringify(f.proconfig).includes('search_path'))).toBe(true);
 });
});
