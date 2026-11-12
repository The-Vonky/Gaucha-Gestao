import {it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {superviseDevelopment} from '../scripts/dev.mjs';

function frontend(){
 const child=Object.assign(new EventEmitter(),{exitCode:null,signalCode:null,kill:vi.fn()});
 child.kill.mockImplementation(()=>{queueMicrotask(()=>child.emit('close',0,'SIGTERM'));return true;});
 return child;
}

it('inicia o Vite sem esperar o executor e aguarda a limpeza ao receber sinal',async()=>{
 const stop=new AbortController(),child=frontend(),startFrontend=vi.fn(()=>child);let cleaned=false;
 await superviseDevelopment({signal:stop.signal,startFrontend,startThumbnails:async({signal})=>{
  expect(startFrontend).toHaveBeenCalledOnce();
  const stopped=new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));
  stop.abort();await stopped;cleaned=true;
 }});
 expect(cleaned).toBe(true);expect(child.kill).toHaveBeenCalledWith('SIGTERM');
});

it('mantém o Vite ativo se o executor legado falhar',async()=>{
 const child=frontend(),stop=new AbortController(),onThumbnailError=vi.fn();
 const result=superviseDevelopment({signal:stop.signal,startFrontend:()=>child,onThumbnailError,
  startThumbnails:async()=>{throw Error('executor');}});
 await vi.waitFor(()=>expect(onThumbnailError).toHaveBeenCalledOnce());
 expect(child.kill).not.toHaveBeenCalled();
 stop.abort();await result;
});

it('ignora o executor inteiro no modo nativo',async()=>{
 const child=frontend(),stop=new AbortController(),startThumbnails=vi.fn();
 const result=superviseDevelopment({signal:stop.signal,nativeThumbnails:true,startFrontend:()=>child,startThumbnails});
 stop.abort();await result;
 expect(startThumbnails).not.toHaveBeenCalled();
});

it('queda do Vite cancela o executor e aguarda limpeza antes de propagar erro',async()=>{
 const child=frontend();let cleaned=false;
 await expect(superviseDevelopment({startFrontend:()=>child,startThumbnails:async({signal})=>{
  const stopped=new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));
  child.emit('close',1,null);await stopped;cleaned=true;
 }})).rejects.toThrow('Vite encerrou com erro.');
 expect(cleaned).toBe(true);
});
