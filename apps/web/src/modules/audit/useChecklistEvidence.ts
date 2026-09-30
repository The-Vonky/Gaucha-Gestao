import { useCallback, useEffect, useRef, useState } from "react";
import { useResource } from "../../shared/useResource";
import * as api from "./evidence";
export type UploadState={name:string;size:number;phase:"sending"|"confirming"|"error";error?:string;attempt?:api.UploadAttempt};
export function useChecklistEvidence(inspectionId:string){
 const resource=useResource(useCallback(()=>api.listEvidence(inspectionId),[inspectionId]));
 const [uploads,setUploads]=useState<Record<string,UploadState>>({});
 const active=useRef(new Set<string>());
 const generation=useRef(0);
 useEffect(()=>{
  generation.current++;active.current.clear();setUploads({});
  return ()=>{generation.current++;};
 },[inspectionId]);
 const update=(key:string,value:UploadState|undefined)=>{
  setUploads(previous=>{const next={...previous};if(value)next[key]=value;else delete next[key];return next;});
 };
 async function run(key:string,info:{name:string;size:number},start:()=>Promise<api.UploadAttempt>){
  if(active.current.has(key))return;
  active.current.add(key);
  const token=generation.current;let attempt:api.UploadAttempt|undefined;
  update(key,{...info,phase:"sending"});
  try{
   attempt=await start();
   await api.finishUpload(attempt,()=>{if(token===generation.current)update(key,{...info,phase:"confirming",attempt});});
   if(token===generation.current){update(key,undefined);resource.reload();}
  }catch(error){
   if(token===generation.current)update(key,{...info,phase:"error",error:api.evidenceMessage(error),attempt:attempt&&api.retryable(error)?attempt:undefined});
  }finally{if(token===generation.current)active.current.delete(key);}
 }
 return {...resource,rows:resource.data??[],uploads,
  send:(key:string,file:File)=>run(key,{name:file.name,size:file.size},()=>api.beginUpload(inspectionId,key,file)),
  retry:(key:string)=>{const state=uploads[key];if(state?.attempt)return run(key,state,async()=>state.attempt!);return Promise.resolve();},
  discard:(key:string)=>{if(!active.current.has(key))update(key,undefined);},
 };
}
export type EvidenceController=ReturnType<typeof useChecklistEvidence>;
