// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
const http=vi.hoisted(()=>vi.fn());
vi.mock("../apps/web/src/core/client",()=>({
 client:createClient("http://127.0.0.1:54321","test-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:http}})
}));
import { beginUpload, finishUpload, downloadUrl, listEvidence, pendingCount, removeEvidence, retryable } from "../apps/web/src/modules/audit/evidence";
import { checkFile, normalizeName } from "../apps/web/src/shared/evidenceFiles";
import type { ChecklistEvidence } from "../apps/web/src/modules/audit/types";
import { finalize } from "../apps/web/src/modules/audit/api";
afterEach(()=>http.mockReset());
describe("Audit evidence finalization client",()=>{
 it("sends the exact complete set selected by the caller",async()=>{
  http.mockResolvedValue(new Response(null,{status:204}));
  await finalize("inspection",1,["evidence-section-9","evidence-section-1"]);
  const [url,init]=http.mock.calls[0];
  expect(String(url)).toContain("/rpc/finalize_inspection");
  expect(JSON.parse(init.body)).toEqual({p_id:"inspection",p_version:1,p_expected_evidence_ids:["evidence-section-9","evidence-section-1"]});
 });
});

const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
describe("Audit evidence file and transport",()=>{
 it.each([
  ["foto.jpg",new Uint8Array([255,216,255]),"image/jpeg"],
  ["foto.png",new Uint8Array([137,80,78,71,13,10,26,10]),"image/png"],
  ["ação.pdf",new TextEncoder().encode("%PDF-1.4"),"application/pdf"],
  ["x.xlsx",new Uint8Array([80,75,3,4]),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["x.docx",new Uint8Array([80,75,3,4]),"application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
 ])("derives canonical MIME for %s, never File.type",async(name,bytes,mime)=>{
  expect(await checkFile(new File([bytes],name,{type:"text/html"}))).toMatchObject({type:mime});
 });
 it("rejects spoofed signatures, HEIC, empty and oversized files",async()=>{
  for(const file of [new File(["%PDF-"],"x.png"),new File(["x"],"x.heic"),new File([],"x.pdf"),new File([new Uint8Array(10485761)],"x.pdf")])
   await expect(checkFile(file)).rejects.toBeInstanceOf(Error);
 });
 it("normalizes NFC/basename, removes bidi and bounds Unicode display names",()=>{
  expect(normalizeName("C:\\foto\\ac\u0327a\u0303o.pdf")).toBe("ação.pdf");
  expect(normalizeName("x\u202ey.pdf")).toBe("xy.pdf");
  expect(Array.from(normalizeName("😀".repeat(200)+".pdf")).length).toBeLessThanOrEqual(180);
 });
 it("uploads canonical bytes once and retries confirmation with the same ID",async()=>{
  http.mockResolvedValueOnce(json([{evidence_id:"e1",object_key:"i1/e1"}])).mockResolvedValueOnce(json({Key:"i1/e1"})).mockResolvedValueOnce(json({code:"",message:"Failed to fetch"},500)).mockResolvedValueOnce(new Response(null,{status:204}));
  const attempt=await beginUpload("i1","item-001",new File(["%PDF-1.4"],"ação.pdf",{type:"text/html"}));
  expect(attempt.body.type).toBe("application/pdf");
  await expect(finishUpload(attempt)).rejects.toMatchObject({code:""});
  await finishUpload(attempt);
  const calls=http.mock.calls;
  expect(calls.filter(([url])=>String(url).includes("/object/audit-checklist-evidence/")).length).toBe(1);
  const upload=calls.find(([url])=>String(url).includes("/object/audit-checklist-evidence/"))!;
  expect(new Headers(upload[1].headers).get("x-upsert")).toBe("false");
  const body=upload[1].body as FormData;
  expect(body.get("cacheControl")).toBe("0");
  const confirmations=calls.filter(([url])=>String(url).includes("/confirm_checklist_evidence_upload"));
  expect(confirmations.map(([,init])=>JSON.parse(init.body).p_evidence)).toEqual(["e1","e1"]);
 });
 it("recovers a lost upload response via duplicate and confirms",async()=>{
  http.mockResolvedValueOnce(json([{evidence_id:"e1",object_key:"i1/e1"}])).mockResolvedValueOnce(json({statusCode:"409",error:"Duplicate",message:"already exists"},409)).mockResolvedValueOnce(new Response(null,{status:204}));
  const a=await beginUpload("i1","item-001",new File(["%PDF-1.4"],"x.pdf"));await finishUpload(a);expect(a.uploaded).toBe(true);
 });
 it("lists all sections, gets aggregate pending, logically removes, signs attachment for 60 seconds",async()=>{
  const row={id:"e1",inspection_id:"i1",item_key:"item-150",object_key:"i1/e1",original_name:"ação.pdf",content_type:"application/pdf",size_bytes:10,created_by:"u",uploaded_by_name:"Ana",uploaded_at:""} satisfies ChecklistEvidence;
  http.mockResolvedValueOnce(json([row])).mockResolvedValueOnce(json(1)).mockResolvedValueOnce(new Response(null,{status:204})).mockResolvedValueOnce(json({signedURL:"/object/sign/audit-checklist-evidence/i1/e1?token=test"}));
  expect(await listEvidence("i1")).toEqual([row]);expect(await pendingCount("i1")).toBe(1);await removeEvidence("e1");
  const url=new URL(await downloadUrl(row));expect(url.searchParams.get("download")).toBe("ação.pdf");
  const sign=http.mock.calls.find(([url])=>String(url).includes("/object/sign/"))!;
  expect(JSON.parse(sign[1].body)).toEqual({expiresIn:60});
  expect(retryable({code:"42501"})).toBe(false);expect(retryable(new Error("network"))).toBe(true);
 });
});
