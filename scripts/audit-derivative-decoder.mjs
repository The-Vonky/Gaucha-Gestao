// Subprocesso sem credenciais. Entrada binária via stdin; não abre caminhos fornecidos pelo arquivo.
import sharp from 'sharp';
import { DERIVATIVE_MAX_ORIGINAL_BYTES, DERIVATIVE_MAX_OUTPUT_BYTES } from './audit-derivative-protocol.mjs';
sharp.cache(false);
sharp.concurrency(1);
const MAX_SEF_TRAILER_BYTES = 64 * 1024;
const JPEG_EOI = 0xd9;
const invalidImage = () => Object.assign(new Error('invalid image'), { exitCode: 5 });

// Percorre marcadores JPEG e dados de scan sem interpretar pixels nem segmentos APP.
function jpegEnd(input) {
  let offset = 2;
  let scan = false;
  let sawScan = false;
  while (offset < input.length) {
    if (scan) offset = input.indexOf(0xff, offset);
    if (offset < 0 || input[offset] !== 0xff) break;
    while (input[offset] === 0xff) offset++;
    const marker = input[offset++];
    if (marker === 0x01 || (scan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7)))) continue;
    if (marker === JPEG_EOI) return sawScan ? offset : 0;
    if (!marker || marker === 0xd8 || offset + 2 > input.length) break;
    const size = input.readUInt16BE(offset);
    if (size < 2 || offset + size > input.length) break;
    offset += size;
    scan = marker === 0xda || (scan && marker === 0xdc);
    sawScan ||= scan;
  }
  return 0;
}

function jpegPayload(input) {
  const end = jpegEnd(input);
  if (!end) throw invalidImage();
  if (end === input.length) return input;
  // Samsung SEF. Somente o diretório completo após um JPEG válido é descartado.
  // Nenhum bloco SEF é aberto ou entregue ao decoder.
  if (input.length - end < 32 || input.length - end > MAX_SEF_TRAILER_BYTES ||
      input.toString('ascii', input.length - 4) !== 'SEFT') throw invalidImage();
  const length = input.readUInt32LE(input.length - 8);
  const directory = input.length - 8 - length;
  if (length < 24 || length > MAX_SEF_TRAILER_BYTES - 8 || directory <= end ||
      input.toString('ascii', directory, directory + 4) !== 'SEFH') throw invalidImage();
  const count = input.readUInt32LE(directory + 8);
  if (length !== 12 + count * 12) throw invalidImage();
  const blocks = [];
  for (let index = 0; index < count; index++) {
    const entry = directory + 12 + index * 12;
    const start = directory - input.readUInt32LE(entry + 4);
    const size = input.readUInt32LE(entry + 8);
    if (start < end || size < 1 ||
        start + size > directory) throw invalidImage();
    blocks.push({ start, end: start + size });
  }
  blocks.sort((a, b) => a.start - b.start);
  let next = end;
  for (const block of blocks) {
    if (block.start !== next) throw invalidImage();
    next = block.end;
  }
  if (next !== directory) throw invalidImage();
  return input.subarray(0, end);
}

try {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > DERIVATIVE_MAX_ORIGINAL_BYTES) throw new Error('size');
    chunks.push(chunk);
  }
  const original = Buffer.concat(chunks);
  const jpeg = original[0] === 0xff && original[1] === 0xd8 && original[2] === 0xff;
  const png = original.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const mime = jpeg ? 'image/jpeg' : png ? 'image/png' : '';
  if (!mime || mime !== process.argv[2]) throw invalidImage();
  const input = jpeg ? jpegPayload(original) : original;
  if (png) {
    let offset = 8; let ended = false;
    while (offset + 12 <= input.length) {
      const length = input.readUInt32BE(offset);
      const type = input.toString('ascii', offset + 4, offset + 8);
      if (offset + length + 12 > input.length || ['acTL','fcTL','fdAT'].includes(type)) throw invalidImage();
      offset += length + 12;
      if (type === 'IEND') { ended = length === 0 && offset === input.length; break; }
    }
    if (!ended) throw invalidImage();
  }
  const options = { failOn: 'warning', limitInputPixels: 16_000_000, sequentialRead: true,
    unlimited: false, animated: false };
  const metadata = await sharp(input, options).metadata();
  if (metadata.format !== (jpeg ? 'jpeg' : 'png') || (metadata.pages ?? 1) !== 1) throw invalidImage();
  if (metadata.width > 8192 || metadata.height > 8192) {
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
  // Só classificações conhecidas saem do subprocesso. Erros nativos ficam no decoder.
  if (!process.exitCode) process.exitCode = error.exitCode ?? (error.message === 'Input image exceeds pixel limit' ? 4 : 1);
}
