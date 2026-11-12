import { describe, expect, it, vi } from "vitest";
import { attachAuditTraffic, safeHeaders } from "./integration/audit-evidence-traffic.mjs";
describe("medição sem conteúdo privado",()=>{
 it("reduz headers a diretivas e indicadores; omite nomes, URLs e tokens",()=>{
  const safe=safeHeaders({"Content-Disposition":'attachment; filename="nome-privado.jpg"',"Cache-Control":"private, max-age=0, no-store",ETag:"private-etag",Authorization:"Bearer secret",Location:"https://storage.test/?token=secret","Set-Cookie":"private-cookie","X-Content-Type-Options":"nosniff"});
  expect(safe).toMatchObject({disposition:"attachment",cacheControl:["private","max-age=0","no-store"],etagPresent:true,nosniff:true});
  expect(JSON.stringify(safe)).not.toMatch(/secret|nome-privado|private-etag|private-cookie/);
 });
 it("conta bytes de rede e GETs por alias, separa cache/assinatura e não exporta URL",async()=>{
  const handlers=new Map<string,(event:unknown)=>void>();
  const cdp={on:(event:string,callback:(event:unknown)=>void)=>handlers.set(event,callback),send:vi.fn(),detach:vi.fn()};
  const page={context:()=>({newCDPSession:async()=>cdp}),on:vi.fn(),off:vi.fn()};
  const meter=await attachAuditTraffic(page,{appOrigin:"http://127.0.0.1:5173",storageOrigin:"http://127.0.0.1:54321"});
  meter.stage("revisit");
  const emit=(name:string,event:unknown)=>handlers.get("Network."+name)!(event);
  const url="http://127.0.0.1:54321/storage/v1/object/sign/audit-checklist-evidence/private-key?token=secret";
  emit("requestWillBeSent",{requestId:"1",timestamp:1,request:{url,method:"GET"}});
  emit("responseReceived",{requestId:"1",timestamp:1.1,response:{status:200,headers:{"cache-control":"no-store"}}});
  emit("dataReceived",{requestId:"1",encodedDataLength:42});
  emit("loadingFinished",{requestId:"1",timestamp:1.2,encodedDataLength:200});
  emit("requestWillBeSent",{requestId:"2",timestamp:2,request:{url,method:"POST"}});
  emit("requestServedFromCache",{requestId:"2"});
  emit("loadingFinished",{requestId:"2",timestamp:2.1,encodedDataLength:0});
  const report=await meter.snapshot();
  expect(report.requests).toMatchObject([{stage:"revisit",object:1,category:"image-get",bodyBytes:42,wireBytes:200,durationMs:200},{object:1,category:"sign",cache:true,wireBytes:0}]);
  expect(JSON.stringify(report)).not.toMatch(/secret|private-key|127\.0\.0\.1/);
  await meter.close();
 });
});

describe("medição de derivados",()=>{
 it("distingue originais, miniaturas legadas, render nativo e RPCs sem exportar chaves",async()=>{
  const handlers=new Map<string,(event:unknown)=>void>();
  const cdp={on:(event:string,callback:(event:unknown)=>void)=>handlers.set(event,callback),send:vi.fn(),detach:vi.fn()};
  const page={context:()=>({newCDPSession:async()=>cdp}),on:vi.fn(),off:vi.fn()};
  const meter=await attachAuditTraffic(page,{appOrigin:"http://localhost:5173",storageOrigin:"http://localhost:54321"});
  const paths = [
   "/storage/v1/object/sign/audit-checklist-evidence/private-key?token=secret",
   "/storage/v1/object/sign/audit-evidence-thumbnails/private-key?token=secret",
   "/storage/v1/render/image/sign/audit-checklist-evidence/private-key?token=secret",
   "/rest/v1/rpc/checklist_evidence_thumbnail",
  ];
  for(const [index,path] of paths.entries()){
   handlers.get("Network.requestWillBeSent")!({requestId:String(index),timestamp:1,request:{url:"http://localhost:54321"+path,method:path.startsWith("/rest/")?"POST":"GET"}});
   handlers.get("Network.loadingFinished")!({requestId:String(index),timestamp:2,encodedDataLength:42});
  }
  const report=await meter.snapshot();
  expect(report.requests).toMatchObject([
   {category:"image-get",imageKind:"original",object:1,rpc:false},
   {category:"image-get",imageKind:"thumbnail",object:2,rpc:false},
   {category:"thumbnail-get",imageKind:"thumbnail",object:1,rpc:false},
   {category:"api",rpc:true},
  ]);
  expect(report.unfinished).toBe(0);
  expect(JSON.stringify(report)).not.toMatch(/private-key|secret|localhost/);
  await meter.close();
 });
});
