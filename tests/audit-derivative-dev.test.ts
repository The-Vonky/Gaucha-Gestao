import {describe,it,expect,vi} from 'vitest';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateDevelopmentConfig,developmentLoop,activationCutoff} from '../scripts/audit-derivative-dev.mjs';
const inspection='11111111-1111-4111-8111-111111111111';
const config={worker:{apiUrl:'http://127.0.0.1:54321',database:{host:'127.0.0.1',port:54322,database:'postgres',user:'audit_derivative_worker',ssl:false}}};
describe('executor local sem efeitos de infraestrutura no teste',()=>{
 it('recusa origem/banco remotos, usuário privilegiado, escopo herdado ou auditoria inválida',()=>{
  expect(()=>validateDevelopmentConfig(config,inspection)).not.toThrow();
  for(const c of [{worker:{...config.worker,apiUrl:'https://remote.example'}},{worker:{...config.worker,database:{...config.worker.database,user:'postgres'}}},
   {worker:{...config.worker,database:{...config.worker.database,port:5432}}},{worker:{...config.worker,queueScope:{}}}])expect(()=>validateDevelopmentConfig(c,inspection)).toThrow();
  expect(()=>validateDevelopmentConfig(config,undefined)).not.toThrow();
  expect(()=>validateDevelopmentConfig(config,'invalid')).toThrow();
 });
 it('serializa one-shots com corte imutável e encerra sem iniciar outro após sinal',async()=>{
  const stop=new AbortController(),scope=Object.freeze({inspection,createdAfter:'2026-11-05T12:00:00Z'});
  let active=0,max=0;const run=vi.fn(async received=>{expect(received).toBe(scope);active++;max=Math.max(max,active);await Promise.resolve();active--;return {state:'ready'};});
  const wait=vi.fn(async()=>{stop.abort();});
  await developmentLoop({run,scope,signal:stop.signal,wait});expect(run).toHaveBeenCalledTimes(1);expect(max).toBe(1);
 });
 it('renova credenciais além de quatro horas, mantendo execução sequencial até o sinal',async()=>{
  const stop=new AbortController();let now=0;
  const renew=vi.fn(async()=>{}),run=vi.fn(async()=>({state:'idle'}));
  await developmentLoop({run,renew,scope:{mode:'global_new',createdAfter:'2026-11-06T12:00:00Z'},signal:stop.signal,clock:()=>now,
   wait:async()=>{now+=60*60*1000;if(now>5*60*60*1000)stop.abort();}});
  expect(run).toHaveBeenCalledTimes(6);expect(renew).toHaveBeenCalledTimes(6);
  await developmentLoop({run,renew,signal:stop.signal});expect(run).toHaveBeenCalledTimes(6);
 });
 it('falha de renovação interrompe novas claims',async()=>{
  const run=vi.fn();await expect(developmentLoop({run,signal:new AbortController().signal,renew:async()=>{throw Error('expired');}})).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
 });
});

it('reutiliza o marco persistido com precisão de microssegundos e bloqueia conteúdo inválido',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'audit-activation-'));
 try{
  const file=join(dir,'activated-after');
  const time=vi.fn().mockResolvedValueOnce('2026-11-11T11:55:00.123456Z');
  expect(await activationCutoff(file,time)).toBe('2026-11-11T11:55:00.123456Z');
  expect(await activationCutoff(file,time)).toBe('2026-11-11T11:55:00.123456Z');
  expect(time).toHaveBeenCalledOnce();
  await writeFile(file,'invalid');
  await expect(activationCutoff(file,time)).rejects.toMatchObject({code:'CUTOFF'});
  expect(time).toHaveBeenCalledOnce();
 }finally{await rm(dir,{recursive:true});}
});
