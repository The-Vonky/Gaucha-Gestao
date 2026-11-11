#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const startVite=()=>spawn(process.execPath,
 [root+'node_modules/vite/bin/vite.js','--strictPort','--host','127.0.0.1',...process.argv.slice(2)],{cwd:root+'apps/web',stdio:'inherit'});

export async function superviseDevelopment({signal,startFrontend=startVite,
 startThumbnails=options=>import('./audit-derivative-dev.mjs').then(module=>module.startDevelopmentThumbnails(options)),
 onThumbnailError=async error=>{
  const {reportDevelopmentThumbnailError}=await import('./audit-derivative-dev.mjs');
  reportDevelopmentThumbnailError(error);
 }}={}){
 if(signal?.aborted)return;
 const stop=new AbortController();
 const frontend=startFrontend();
 const shutdown=()=>{
  stop.abort();
  if(frontend.exitCode===null&&frontend.signalCode===null)frontend.kill('SIGTERM');
 };
 const frontendDone=new Promise((resolve,reject)=>{
  frontend.once('error',()=>reject(new Error('VITE_SPAWN')));
  frontend.once('close',(code,terminated)=>{
   if(!stop.signal.aborted&&(code!==0||terminated))reject(new Error('VITE_EXIT'));
   else resolve();
  });
 });
 signal?.addEventListener('abort',shutdown,{once:true});
 const thumbnailsDone=Promise.resolve().then(()=>startThumbnails({signal:stop.signal})).catch(async error=>{
  try{await onThumbnailError(error);}
  catch{console.error('[AUD-IMG-02] Dependências do executor indisponíveis. Vite segue ativo.');}
 });
 try{await frontendDone;}
 finally{
  stop.abort();
  signal?.removeEventListener('abort',shutdown);
  await thumbnailsDone;
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const stop=new AbortController();
 for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.on(name,()=>stop.abort());
 try{await superviseDevelopment({signal:stop.signal});}
 catch(error){
  console.error(error.message==='VITE_SPAWN'?'Não foi possível iniciar o processo do Vite.':'Vite encerrou com erro. Consulte a saída do Vite acima.');
  process.exitCode=1;
 }
}
