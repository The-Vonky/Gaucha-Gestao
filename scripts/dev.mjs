#!/usr/bin/env node
// Supervisor da sessão local: frontend só inicia depois da fila estar protegida.
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {startDevelopmentThumbnails} from './audit-derivative-dev.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function superviseDevelopment({signal,startThumbnails=startDevelopmentThumbnails,startFrontend=()=>spawn(process.execPath,
 [root+'node_modules/vite/bin/vite.js','--strictPort','--host','127.0.0.1',...process.argv.slice(2)],{cwd:root+'apps/web',stdio:'inherit'})}={}){
 const stop=new AbortController();let frontend,frontendDone;
 const shutdown=()=>{stop.abort();if(frontend&&frontend.exitCode===null&&frontend.signalCode===null)frontend.kill('SIGTERM');};
 signal?.addEventListener('abort',shutdown,{once:true});
 if(signal?.aborted)stop.abort();
 try{
  await startThumbnails({signal:stop.signal,onReady:()=>{
   if(stop.signal.aborted)return;
   frontend=startFrontend();
   frontendDone=new Promise((resolve,reject)=>{
    frontend.once('error',error=>{shutdown();reject(error);});
    frontend.once('close',(code,terminated)=>{const stopping=stop.signal.aborted;shutdown();
     if(!stopping&&(code!==0||terminated))reject(new Error('Frontend failed'));else resolve();});
   });
   // Observar rejeição imediatamente; finally também a propaga após NOLOGIN.
   frontendDone.catch(shutdown);
  }});
 }finally{
  shutdown();
  try{await frontendDone;}finally{signal?.removeEventListener('abort',shutdown);}
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const stop=new AbortController();
 for(const name of ['SIGINT','SIGTERM','SIGHUP'])process.on(name,()=>stop.abort());
 try{await superviseDevelopment({signal:stop.signal});}
 catch{console.error('Desenvolvimento encerrado por falha. Conferir configuração privada, Docker local, migration, lock e NOLOGIN.');process.exitCode=1;}
}
