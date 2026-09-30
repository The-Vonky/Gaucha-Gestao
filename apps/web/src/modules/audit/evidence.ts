import { client } from "../../core/client";
import { message } from "../../shared/errors";
import { checkFile, FileValidationError } from "../../shared/evidenceFiles";
import { db } from "./api";
import type { ChecklistEvidence } from "./types";
export { ACCEPT, FORMATS_HINT, checkFile, normalizeName, typeLabel, formatSize } from "../../shared/evidenceFiles";
export const BUCKET="audit-checklist-evidence";
export type UploadAttempt={id:string;key:string;body:Blob;uploaded:boolean};
export async function listEvidence(inspection:string):Promise<ChecklistEvidence[]>{
 const {data,error}=await db().rpc("checklist_evidence",{p_inspection:inspection});
 if(error)throw error;return data??[];
}
export async function pendingCount(inspection:string):Promise<number>{
 const {data,error}=await db().rpc("checklist_evidence_pending_count",{p_inspection:inspection});
 if(error)throw error;return data??0;
}
export async function beginUpload(inspection:string,itemKey:string,file:File):Promise<UploadAttempt>{
 const metadata=await checkFile(file);
 const {data,error}=await db().rpc("begin_checklist_evidence_upload",{
 p_inspection:inspection,p_item_key:itemKey,p_original_name:metadata.name,p_content_type:metadata.type,p_size:file.size});
 if(error)throw error;
 const row=data?.[0];if(!row)throw new Error("Não foi possível iniciar o envio.");
 return {id:row.evidence_id,key:row.object_key,body:file.slice(0,file.size,metadata.type),uploaded:false};
}
export async function finishUpload(a:UploadAttempt,onStored:()=>void=()=>{}){
 if(!client)throw new Error("Configuração indisponível.");
 if(!a.uploaded){
 const {error}=await client.storage.from(BUCKET).upload(a.key,a.body,{contentType:a.body.type,upsert:false,cacheControl:"0"});
 if(error&&String(error.statusCode)!=="409")throw error;
 a.uploaded=true;
 }
 onStored();
 const {error}=await db().rpc("confirm_checklist_evidence_upload",{p_evidence:a.id});
 if(error)throw error;
}
export async function removeEvidence(id:string){
 const {error}=await db().rpc("remove_checklist_evidence",{p_evidence:id});
 if(error)throw error;
}
export async function downloadUrl(e:ChecklistEvidence){
 if(!client)throw new Error("Configuração indisponível.");
 const {data,error}=await client.storage.from(BUCKET).createSignedUrl(e.object_key,60);
 if(error)throw error;
 // Native download option double-encodes Unicode in the installed storage-js version.
 const url=new URL(data.signedUrl);
 const origin=import.meta.env.VITE_SUPABASE_URL;
 if(origin&&url.origin!==new URL(origin).origin)throw new Error("Arquivo indisponível.");
 url.searchParams.set("download",e.original_name);
 return url.href;
}
export async function downloadEvidence(e:ChecklistEvidence){
 const url=await downloadUrl(e);
 // Check the actual bytes endpoint before starting a same-tab attachment download.
 // A missing backend file must be shown as unavailable even when signing succeeds.
 const response=await fetch(url,{method:"HEAD",cache:"no-store"});
 if(!response.ok)throw new Error("Arquivo indisponível.");
 const anchor=document.createElement("a");anchor.href=url;anchor.rel="noopener";document.body.append(anchor);anchor.click();anchor.remove();
}
export function retryable(e:unknown){
 if(e instanceof FileValidationError)return false;
 const error=(e??{}) as {code?:string;statusCode?:string|number};
 return !error.code&&!error.statusCode;
}
export function evidenceMessage(e:unknown){
 if(e instanceof FileValidationError)return e.message;
 const text=String((e as {message?:string})?.message??"");
 if(/Criterion evidence limit reached/.test(text))return "Limite de 10 evidências ativas neste critério atingido.";
 if(/Inspection evidence limit reached/.test(text))return "Limite de 100 evidências ativas nesta auditoria atingido.";
 if(/Upload expired/.test(text))return "O envio expirou. Anexe o arquivo novamente.";
 if(/Upload lifecycle changed/.test(text))return "A auditoria foi finalizada ou reaberta durante o envio. Anexe o arquivo novamente.";
 if(/object does not match/.test(text))return "O arquivo enviado não confere com o registro. Anexe novamente.";
 return message(e);
}
