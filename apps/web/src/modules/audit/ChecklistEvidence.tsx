import { useId, useRef, useState } from "react";
import { Confirm } from "../../shared/ui";
import { downloadPrivateObject } from "../../core/auth/privateStorage";
import { ACCEPT, BUCKET, FORMATS_HINT, downloadEvidence, formatSize, typeLabel, removeEvidence } from "./evidence";
import type { ChecklistEvidence as Evidence, Item } from "./types";
import type { EvidenceController } from "./useChecklistEvidence";
import "./evidence.css";
import { EvidenceImage } from "./EvidenceImage";
import { EvidenceImageModal } from "../../shared/EvidenceImage";
import { isEvidenceImage } from "../../shared/evidenceFiles";
import { compareEvidence, evidenceName } from "./evidencePresentation";
export function Download({row,name=row.original_name,filename=name,authenticated}:{row:Evidence;name?:string;filename?:string;authenticated?:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(false);
 return <><button type="button" className="small" aria-label={`Baixar ${name}`} disabled={busy}
 onClick={async()=>{setBusy(true);setError(false);try{if(authenticated)await downloadPrivateObject(BUCKET,row.object_key,filename);else await downloadEvidence(row,filename);}catch{setError(true);}finally{setBusy(false);}}}>
 {busy?"Abrindo…":"Baixar"}</button>{error&&<span role="alert">Arquivo indisponível.</span>}</>;
}
export function ChecklistEvidence({item,editable,controller,visible=true,authenticated}:{item:Item;editable:boolean;controller:EvidenceController;visible?:boolean;authenticated?:boolean}){
 const input=useRef<HTMLInputElement>(null),button=useRef<HTMLButtonElement>(null);
 const hint=useId();
 const [removing,setRemoving]=useState<Evidence>();
 const [preview,setPreview]=useState<string>();
 const pending=controller.uploads[item.key];
 const busy=!!pending&&pending.phase!=="error";
 const rows=controller.rows.filter(e=>e.item_key===item.key).sort(compareEvidence);
 const previewIndex=rows.findIndex(e=>e.id===preview);
 return <section className="audit-evidence" aria-label={`Evidências do critério ${item.number}`}>
 <h3>Evidências</h3>
 {controller.loading&&<p role="status">Carregando evidências…</p>}
 {controller.error&&<p role="alert">Não foi possível carregar evidências. <button type="button" onClick={controller.reload}>Tentar novamente</button></p>}
 {!controller.loading&&!controller.error&&!rows.length&&<p className="muted">Nenhuma evidência anexada.</p>}
 <ul className="audit-evidence-list">
 {rows.map((e,index)=>{const name=evidenceName(e.original_name,index);return <li key={e.id} className="file-item">
 <div className="file-body evidence-image-details">
 {visible && isEvidenceImage(e.content_type) &&
 <EvidenceImage row={e} name={name} authenticated={authenticated} onOpenOriginal={()=>setPreview(e.id)}/>}
 <div className="evidence-image-info"><strong className="audit-evidence-name">{name}</strong>
 <p className="file-meta">{typeLabel(e.content_type)} · {formatSize(e.size_bytes)} · {e.uploaded_by_name} · {new Date(e.uploaded_at).toLocaleString("pt-BR")}</p></div>
 </div><div className="file-actions"><Download row={e} name={name} authenticated={authenticated}/>{editable&&<button type="button" className="small" aria-label={`Remover ${name}`} onClick={()=>setRemoving(e)}>Remover</button>}</div>
 </li>;})}
 </ul>
 {editable&&<>
 <input ref={input} type="file" accept={ACCEPT} hidden aria-label={`Arquivo do critério ${item.number}`}
 onChange={e=>{const file=e.target.files?.[0];if(file)void controller.send(item.key,file);e.target.value="";}}/>
 <button ref={button} type="button" disabled={busy} aria-describedby={hint} onClick={()=>input.current?.click()}>Anexar arquivo ao critério {item.number}</button>
 <p id={hint} className="muted">{FORMATS_HINT} Os arquivos originais podem conter metadados de localização (EXIF/GPS). Arquivos permanecem não confiáveis.</p>
 </>}
 {pending&&<div className="file-item pending" data-state={pending.phase}>
 <div className="file-body"><strong className="audit-evidence-name">{evidenceName(pending.name,rows.length)}</strong>
 <p role={pending.phase==="error"?"alert":"status"}>{pending.phase==="sending"?"Enviando arquivo…":pending.phase==="confirming"?"Confirmando envio…":pending.error}</p></div>
 {pending.phase==="error"&&editable&&<div className="file-actions">{pending.attempt&&<button type="button" onClick={()=>void controller.retry(item.key)}>Tentar novamente</button>}<button type="button" onClick={()=>controller.discard(item.key)}>Descartar envio</button></div>}
 </div>}
 {visible&&previewIndex>=0&&<EvidenceImageModal name={evidenceName(rows[previewIndex].original_name,previewIndex)} onClose={()=>setPreview(undefined)}>
 <EvidenceImage expanded authenticated={authenticated} key={preview} row={rows[previewIndex]} name={evidenceName(rows[previewIndex].original_name,previewIndex)}/>
 </EvidenceImageModal>}
 {removing&&<Confirm title="Remover evidência" description={`Remover “${evidenceName(removing.original_name,rows.findIndex(e=>e.id===removing.id))}” deste critério? O registro histórico será preservado.`}
 onClose={()=>{setRemoving(undefined);button.current?.focus();}} onConfirm={async()=>{
  await removeEvidence(removing.id);controller.reload();
 }}/>}
 </section>;
}
