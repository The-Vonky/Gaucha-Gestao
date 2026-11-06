import {it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {superviseDevelopment} from '../scripts/dev.mjs';
function frontend(){
 const child=Object.assign(new EventEmitter(),{exitCode:null,signalCode:null,kill:vi.fn()});
 child.kill.mockImplementation(()=>{queueMicrotask(()=>child.emit('close',0,'SIGTERM'));return true;});return child;
}
it('inicia frontend só após ready e aguarda limpeza ao receber sinal',async()=>{
 const stop=new AbortController(),child=frontend(),startFrontend=vi.fn(()=>child);let cleaned=false;
 await superviseDevelopment({signal:stop.signal,startFrontend,startThumbnails:async({onReady,signal})=>{
  expect(startFrontend).not.toHaveBeenCalled();onReady();expect(startFrontend).toHaveBeenCalledOnce();
  const stopped=new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));stop.abort();await stopped;cleaned=true;
 }});expect(cleaned).toBe(true);expect(child.kill).toHaveBeenCalledWith('SIGTERM');
});
it('não abre frontend se configuração/migration estiver ausente',async()=>{
 const startFrontend=vi.fn();await expect(superviseDevelopment({startFrontend,startThumbnails:async()=>{throw Error('blocked');}})).rejects.toThrow('blocked');
 expect(startFrontend).not.toHaveBeenCalled();
});
it('queda do frontend cancela executor e aguarda NOLOGIN antes de propagar erro',async()=>{
 const child=frontend();let cleaned=false;
 await expect(superviseDevelopment({startFrontend:()=>child,startThumbnails:async({onReady,signal})=>{
  onReady();const stopped=new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));child.emit('close',1,null);await stopped;cleaned=true;
 }})).rejects.toThrow('Frontend failed');expect(cleaned).toBe(true);
});
it('falha do executor também encerra o frontend',async()=>{
 const child=frontend();await expect(superviseDevelopment({startFrontend:()=>child,startThumbnails:async({onReady})=>{onReady();throw Error('renewal');}})).rejects.toThrow('renewal');
 expect(child.kill).toHaveBeenCalledWith('SIGTERM');
});
