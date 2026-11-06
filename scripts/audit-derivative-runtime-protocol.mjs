// Pipes privados: uint32 BE + JSON curto + corpo binário. Nunca registrar mensagens.
import {DERIVATIVE_MAX_ORIGINAL_BYTES,DERIVATIVE_MAX_OUTPUT_BYTES} from './audit-derivative-protocol.mjs';
export const FRAME_HEADER_BYTES=4096;
const types=new Set(['init','token','token-result','encode','encode-result','result']);
function validate(header){
  if(!header||typeof header!=='object'||Array.isArray(header)||!types.has(header.type)||
    !Number.isSafeInteger(header.bodyBytes)||header.bodyBytes<0)throw new Error('Invalid frame');
  const max=header.type==='encode'?DERIVATIVE_MAX_ORIGINAL_BYTES:header.type==='encode-result'?DERIVATIVE_MAX_OUTPUT_BYTES:0;
  if(header.bodyBytes>max)throw new Error('Frame body exceeds contract');
  if(['token','token-result','encode','encode-result'].includes(header.type)&&(!Number.isSafeInteger(header.id)||header.id<1||header.id>64))throw new Error('Invalid request id');
  if(['token','encode'].includes(header.type)&&!/^[0-9a-f-]{36}$/i.test(header.lease??''))throw new Error('Invalid lease');
  if(header.type==='encode'&&!['image/jpeg','image/png'].includes(header.contentType))throw new Error('Invalid MIME');
}
export class FrameChannel {
  constructor({input,output,onFrame,onError=()=>{},onEnd=()=>{},frameTimeoutMs=5000}){
    this.input=input;this.output=output;this.onFrame=onFrame;this.onError=onError;this.onEnd=onEnd;this.timeoutMs=frameTimeoutMs;
    this.closed=false;this.reset();
    this.data=chunk=>this.consume(chunk);
    this.error=()=>this.fail(new Error('Runtime pipe failed'));
    this.end=()=>{if(this.closed)return;if(this.offset||this.stage!=='prefix')this.fail(new Error('Incomplete frame'));else{this.close();this.onEnd();}};
    input.on('data',this.data);input.on('error',this.error);input.on('end',this.end);output.on('error',this.error);
    input.once('close',()=>{if(!this.closed)this.fail(new Error('Runtime input closed'));input.off('error',this.error);});output.once('close',()=>output.off('error',this.error));
  }
  reset(){clearTimeout(this.timer);this.timer=undefined;this.stage='prefix';this.target=Buffer.alloc(4);this.offset=0;this.header=undefined;}
  fail(error){if(this.closed)return;this.close();this.onError(error);}
  consume(chunk){
    if(this.closed)return;
    try{
      let cursor=0;
      while(cursor<chunk.length&&!this.closed){
        if(!this.timer)this.timer=setTimeout(()=>this.fail(new Error('Frame timeout')),this.timeoutMs);
        const count=Math.min(this.target.length-this.offset,chunk.length-cursor);
        chunk.copy(this.target,this.offset,cursor,cursor+count);this.offset+=count;cursor+=count;
        if(this.offset<this.target.length)continue;
        if(this.stage==='prefix'){
          const size=this.target.readUInt32BE(0);if(size<1||size>FRAME_HEADER_BYTES)throw new Error('Invalid header size');
          this.stage='header';this.target=Buffer.alloc(size);this.offset=0;
        }else if(this.stage==='header'){
          this.header=JSON.parse(this.target.toString('utf8'));validate(this.header);
          if(this.header.bodyBytes){this.stage='body';this.target=Buffer.alloc(this.header.bodyBytes);this.offset=0;}
          else{const header=this.header;this.reset();this.onFrame(header,Buffer.alloc(0));}
        }else{const header=this.header,body=this.target;this.reset();this.onFrame(header,body);}
      }
    }catch(error){this.fail(error);}
  }
  send(message,body=Buffer.alloc(0)){
    try{
      if(this.closed||this.output.destroyed||!Buffer.isBuffer(body))throw new Error('Runtime channel closed');
      const header={...message,bodyBytes:body.length};validate(header);
      const json=Buffer.from(JSON.stringify(header));if(json.length>FRAME_HEADER_BYTES)throw new Error('Header exceeds contract');
      const prefix=Buffer.alloc(4);prefix.writeUInt32BE(json.length);
      // Escritas contíguas antes de aguardar: no máximo um corpo limitado na fila.
      return new Promise((resolve,reject)=>{this.output.write(prefix);this.output.write(json);this.output.write(body,error=>error?reject(error):resolve());});
    }catch(error){return Promise.reject(error);}
  }
  close(){if(this.closed)return;this.closed=true;clearTimeout(this.timer);this.target=undefined;this.header=undefined;this.input.off('data',this.data);this.input.off('end',this.end);}
}
