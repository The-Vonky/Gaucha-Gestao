import {describe,it,expect,vi} from 'vitest';
import {validateDevelopmentConfig,developmentLoop} from '../scripts/audit-derivative-dev.mjs';
const inspection='11111111-1111-4111-8111-111111111111';
const config={worker:{apiUrl:'http://127.0.0.1:54321',database:{host:'127.0.0.1',port:54322,database:'postgres',user:'audit_derivative_worker',ssl:false}}};
describe('executor local sem efeitos de infraestrutura no teste',()=>{
 it('recusa origem/banco remotos, usuário privilegiado, escopo herdado ou auditoria ausente',()=>{
  expect(()=>validateDevelopmentConfig(config,inspection)).not.toThrow();
  for(const c of [{worker:{...config.worker,apiUrl:'https://remote.example'}},{worker:{...config.worker,database:{...config.worker.database,user:'postgres'}}},
   {worker:{...config.worker,database:{...config.worker.database,port:5432}}},{worker:{...config.worker,queueScope:{}}}])expect(()=>validateDevelopmentConfig(c,inspection)).toThrow();
  expect(()=>validateDevelopmentConfig(config,undefined)).toThrow();
 });
 it('serializa one-shots com corte imutável e encerra sem iniciar outro após sinal',async()=>{
  const stop=new AbortController(),scope=Object.freeze({inspection,createdAfter:'2026-11-05T12:00:00Z'});
  let active=0,max=0;const run=vi.fn(async received=>{expect(received).toBe(scope);active++;max=Math.max(max,active);await Promise.resolve();active--;return {state:'ready'};});
  const wait=vi.fn(async()=>{stop.abort();});
  await developmentLoop({run,scope,signal:stop.signal,wait});expect(run).toHaveBeenCalledTimes(1);expect(max).toBe(1);
 });
 it('limita a duração e não repete trabalho quando já está encerrando',async()=>{
  const stop=new AbortController();let now=0;
  const run=vi.fn(async()=>({state:'idle'}));
  await developmentLoop({run,scope:{inspection},signal:stop.signal,clock:()=>now,wait:async()=>{now+=2000;},maxDuration:4000});
  expect(run).toHaveBeenCalledTimes(2);stop.abort();
  await developmentLoop({run,scope:{inspection},signal:stop.signal});expect(run).toHaveBeenCalledTimes(2);
 });
});
