// Subprocesso sem credenciais. Entrada binária via stdin; não abre caminhos fornecidos pelo arquivo.
import sharp from 'sharp';
import { DERIVATIVE_MAX_ORIGINAL_BYTES, DERIVATIVE_MAX_OUTPUT_BYTES } from './audit-derivative-protocol.mjs';
sharp.cache(false);
sharp.concurrency(1);
try {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > DERIVATIVE_MAX_ORIGINAL_BYTES) throw new Error('size');
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks);
  const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
  const png = input.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const mime = jpeg ? 'image/jpeg' : png ? 'image/png' : '';
  if (!mime || mime !== process.argv[2]) throw new Error('format');
  if (jpeg && !input.subarray(-2).equals(Buffer.from([255,217]))) throw new Error('truncated');
  if (png) {
    let offset = 8; let ended = false;
    while (offset + 12 <= input.length) {
      const length = input.readUInt32BE(offset);
      const type = input.toString('ascii', offset + 4, offset + 8);
      if (offset + length + 12 > input.length || ['acTL','fcTL','fdAT'].includes(type)) throw new Error('png');
      offset += length + 12;
      if (type === 'IEND') { ended = length === 0 && offset === input.length; break; }
    }
    if (!ended) throw new Error('truncated');
  }
  const options = { failOn: 'warning', limitInputPixels: 16_000_000, sequentialRead: true,
    unlimited: false, animated: false };
  const metadata = await sharp(input, options).metadata();
  if (!['jpeg','png'].includes(metadata.format) || (metadata.pages ?? 1) !== 1 ||
      metadata.width > 8192 || metadata.height > 8192) {
    process.exitCode = 4;
    throw new Error('dimensions');
  }
  // rotate() aplica EXIF; saída padrão do Sharp descarta EXIF/XMP/ICC/GPS.
  // Tentativas limitadas; sem ampliar nem reduzir além de 320 px para forçar ganho.
  // PNG continua lossless e JPEG preserva 4:4:4, com qualidade mínima 80.
  let result;
  const sizes = png
    ? [...new Set([480,384,320].map(side => Math.min(side,Math.max(metadata.width,metadata.height))))].map(side => [side,0])
    : [[480,86],[480,82],[384,82],[320,80]];
  for(const [side,quality] of sizes){
    let pipeline=sharp(input,options).rotate().resize({width:side,height:side,fit:'inside',withoutEnlargement:true});
    pipeline=png?pipeline.png({compressionLevel:9}):pipeline.jpeg({quality,chromaSubsampling:'4:4:4'});
    const candidate=await pipeline.toBuffer({resolveWithObject:true});
    if(candidate.data.length<input.length&&candidate.data.length<=DERIVATIVE_MAX_OUTPUT_BYTES){result=candidate;break;}
  }
  if(!result){process.exitCode=3;}else{
    process.stdout.write(JSON.stringify({mime,width:result.info.width,height:result.info.height,bytes:result.data.toString('base64')}));
  }
} catch (error) {
  // O erro nativo nunca sai do subprocesso. Código 4 indica o limite físico.
  if (!process.exitCode) process.exitCode = error.message === 'Input image exceeds pixel limit' ? 4 : 1;
}
