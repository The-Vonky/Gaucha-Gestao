import {describe,it,expect,vi} from 'vitest';
import {PassThrough} from 'node:stream';
import {FrameChannel,FRAME_HEADER_BYTES} from '../scripts/audit-derivative-runtime-protocol.mjs';
import {oneShotEncoder} from '../scripts/audit-derivative-runtime.mjs';
const lease='11111111-1111-4111-8111-111111111111';
function wire(timeout=1000){
 const input=new PassThrough(),output=new PassThrough();const frame=vi.fn(),error=vi.fn(),end=vi.fn();
 const channel=new FrameChannel({input,output,onFrame:frame,onError:error,onEnd:end,frameTimeoutMs:timeout});
 return {input,output,frame,error,end,channel,close:()=>{channel.close();input.destroy();output.destroy();}};
}
function raw(header:object,body=Buffer.alloc(0)){const json=Buffer.from(JSON.stringify(header)),prefix=Buffer.alloc(4);prefix.writeUInt32BE(json.length);return Buffer.concat([prefix,json,body]);}
describe('protocolo binário limitado do runtime',()=>{
 it.each([['encode',10*1024*1024],['encode-result',1024*1024]])('transporta o limite completo de %s sem Base64',async(type,size)=>{
  const f=wire();const receiver=new FrameChannel({input:f.output,output:f.input,onFrame:f.frame,onError:f.error});
  const bytes=Buffer.alloc(size as number,173);
  await f.channel.send({type,id:1,lease,contentType:'image/png'},bytes);
  expect(f.frame).toHaveBeenCalledTimes(1);expect(f.frame.mock.calls[0][1].equals(bytes)).toBe(true);expect(f.error).not.toHaveBeenCalled();
  receiver.close();f.close();
 });
 it('aceita prefixo, header e corpo fragmentados e múltiplos frames no mesmo chunk',()=>{
  const f=wire();const bytes=raw({type:'encode',id:1,lease,contentType:'image/jpeg',bodyBytes:3},Buffer.from('abc'));
  for(const byte of bytes)f.input.write(Buffer.from([byte]));
  f.input.write(Buffer.concat([raw({type:'token',id:2,lease,bodyBytes:0}),raw({type:'result',bodyBytes:0})]));
  expect(f.frame).toHaveBeenCalledTimes(3);expect(f.frame.mock.calls[0][1].toString()).toBe('abc');f.close();
 });
 it.each([
  {type:'encode',id:1,lease,contentType:'image/png',bodyBytes:10*1024*1024+1},
  {type:'encode-result',id:1,bodyBytes:1024*1024+1},
  {type:'token',id:1,lease,bodyBytes:1},
  {type:'encode',id:1,lease,contentType:'text/html',bodyBytes:1},
  {type:'encode',id:1,lease:'other',contentType:'image/png',bodyBytes:1},
  {type:'encode',id:65,lease,contentType:'image/png',bodyBytes:1},
  {type:'shell',bodyBytes:0},
 ])('recusa contrato inválido antes do corpo: %j',header=>{
  const f=wire();f.input.write(raw(header));expect(f.error).toHaveBeenCalledTimes(1);expect(f.frame).not.toHaveBeenCalled();expect(f.channel.closed).toBe(true);f.close();
 });
 it('limita envio, header e JSON malformado',async()=>{
  const f=wire();await expect(f.channel.send({type:'token',id:1,lease},Buffer.alloc(1))).rejects.toThrow();
  await expect(f.channel.send({type:'result',data:'x'.repeat(FRAME_HEADER_BYTES)})).rejects.toThrow();
  f.input.write(Buffer.from([0,0,0,1,123]));expect(f.error).toHaveBeenCalledTimes(1);f.close();
  const g=wire();const prefix=Buffer.alloc(4);prefix.writeUInt32BE(FRAME_HEADER_BYTES+1);g.input.write(prefix);expect(g.error).toHaveBeenCalledTimes(1);g.close();
 });
 it('encerra frame incompleto por EOF, timeout e erro do peer',async()=>{
  const f=wire();f.input.end(Buffer.from([0]));await new Promise(resolve=>setImmediate(resolve));expect(f.error).toHaveBeenCalledTimes(1);f.close();
  const g=wire(5);g.input.write(Buffer.from([0]));await new Promise(resolve=>setTimeout(resolve,15));expect(g.error).toHaveBeenCalledTimes(1);expect(g.channel.closed).toBe(true);g.close();
  const h=wire();h.output.destroy(new Error('peer'));await new Promise(resolve=>setImmediate(resolve));expect(h.error).toHaveBeenCalledTimes(1);await expect(h.channel.send({type:'result'})).rejects.toThrow();h.close();
 });
});
const input=Buffer.alloc(100,7);
function encoderFixture(change={}){
 const query=vi.fn().mockResolvedValue({rows:[{result:{lease,login:'audit_derivative_worker',bucket:'audit-checklist-evidence',key:'canonical/object',bytes:input.length,mime:'image/png',...change}}]});
 const readSource=vi.fn().mockResolvedValue(Buffer.from(input));
 const encode=vi.fn().mockResolvedValue({bytes:Buffer.alloc(10),mime:'image/png',width:48,height:32});
 return {query,readSource,encode,run:oneShotEncoder({connection:{query},readSource,encode})};
}
describe('decoder irmão: fronteira de lease, job e um arquivo por processo',()=>{
 it('confere o objeto original autorizado byte a byte e permite só uma codificação',async()=>{
  const f=encoderFixture(),signal=new AbortController().signal;
  expect((await f.run({lease,contentType:'image/png'},input,lease,signal)).width).toBe(48);
  expect(f.query).toHaveBeenCalledWith(expect.stringContaining('runtime_derivative_scope'),[lease,'source']);
  expect(f.encode).toHaveBeenCalledWith({bytes:input,contentType:'image/png',version:'img-480-v1'},{signal});
  await expect(f.run({lease,contentType:'image/png'},input,lease,signal)).rejects.toThrow();expect(f.encode).toHaveBeenCalledTimes(1);
 });
 it.each([{bytes:99},{mime:'image/jpeg'},{login:'postgres'},{bucket:'other'},{lease:'other'}])('nega escopo divergente %j',async change=>{
  const f=encoderFixture(change);await expect(f.run({lease,contentType:'image/png'},input,lease)).rejects.toThrow();expect(f.encode).not.toHaveBeenCalled();
 });
 it('nega lease errada, arquivo de outra evidência e lease obsoleta antes de decodificar',async()=>{
  const f=encoderFixture();await expect(f.run({lease,contentType:'image/png'},input,'other')).rejects.toThrow();expect(f.query).not.toHaveBeenCalled();
  f.readSource.mockResolvedValue(Buffer.alloc(input.length,8));await expect(f.run({lease,contentType:'image/png'},input,lease)).rejects.toThrow();expect(f.encode).not.toHaveBeenCalled();
  const g=encoderFixture();g.query.mockRejectedValue(new Error('stale'));await expect(g.run({lease,contentType:'image/png'},input,lease)).rejects.toThrow();expect(g.encode).not.toHaveBeenCalled();
 });
 it.each([{bytes:Buffer.alloc(1024*1024+1)},{width:481},{mime:'image/gif'},{bytes:Buffer.alloc(0)}])('nega saída inválida do decoder',async change=>{
  const f=encoderFixture();f.encode.mockResolvedValue({bytes:Buffer.alloc(10),mime:'image/png',width:48,height:32,...change});
  await expect(f.run({lease,contentType:'image/png'},input,lease)).rejects.toThrow();
 });
 it('propaga falha/timeout do encoder e abort sem fallback',async()=>{
  const f=encoderFixture();f.encode.mockRejectedValue(new Error('unavailable or timed out'));
  await expect(f.run({lease,contentType:'image/png'},input,lease)).rejects.toThrow('unavailable');expect(f.encode).toHaveBeenCalledTimes(1);
  const g=encoderFixture(),controller=new AbortController();controller.abort();
  await expect(g.run({lease,contentType:'image/png'},input,lease,controller.signal)).rejects.toThrow();expect(g.encode).not.toHaveBeenCalled();
 });
});
