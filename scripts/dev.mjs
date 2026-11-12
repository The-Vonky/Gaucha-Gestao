#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const webRoot=root+'apps/web';
const startVite=()=>spawn(process.execPath,
 [root+'node_modules/vite/bin/vite.js','--strictPort','--host','127.0.0.1',...process.argv.slice(2)],{cwd:webRoot,stdio:'inherit'});

export async function superviseDevelopment({signal,nativeThumbnails=false,startFrontend=startVite,
 startThumbnails=options=>import('./audit-derivative-dev.mjs').then(module=>module.startDevelopmentThumbnails(options)),
 onThumbnailError=()=>console.error('[AUD-IMG-02] Executor indisponível. Vite segue ativo.'),
}={}){
 if(signal?.aborted)return;
 const stop=new AbortController();
 const frontend=startFrontend();
 const shutdown=()=>{
  stop.abort();
  if(frontend.exitCode===null&&frontend.signalCode===null)frontend.kill('SIGTERM');
 };
 const frontendDone=new Promise((resolve,reject)=>{
  frontend.once('error',()=>reject(new Error('Falha ao iniciar o Vite.')));
  frontend.once('close',(code,terminated)=>{
   if(!stop.signal.aborted&&(code!==0||terminated))reject(new Error('Vite encerrou com erro.'));
   else resolve();
  });
 });
 signal?.addEventListener('abort',shutdown,{once:true});
 const thumbnailsDone=nativeThumbnails ? undefined :
  Promise.resolve().then(()=>startThumbnails({signal:stop.signal})).catch(onThumbnailError);
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
 try{
  const {loadEnv}=await import('vite');
  const args=process.argv.slice(2);
  const modeIndex=args.indexOf('--mode');
  const mode=modeIndex>=0 ? args[modeIndex+1] : args.find(arg=>arg.startsWith('--mode='))?.slice(7);
  const env=loadEnv(mode??'development',webRoot,'VITE_AUDIT_EVIDENCE_STORAGE_TRANSFORMS');
  await superviseDevelopment({signal:stop.signal,nativeThumbnails:env.VITE_AUDIT_EVIDENCE_STORAGE_TRANSFORMS==='true'});
 }catch{
  console.error('Desenvolvimento encerrado. Confira a saída do Vite.');
  process.exitCode=1;
 }
}
