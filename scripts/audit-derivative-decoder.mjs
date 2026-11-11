// Subprocesso sem credenciais. Entrada binária via stdin; não abre caminhos fornecidos pelo arquivo.
import sharp from 'sharp';
import { DERIVATIVE_MAX_ORIGINAL_BYTES, DERIVATIVE_MAX_OUTPUT_BYTES } from './audit-derivative-protocol.mjs';
sharp.cache(false);
sharp.concurrency(1);
const MAX_SEF_TRAILER_BYTES = 64 * 1024;
const JPEG_EOI = 0xd9;
const MPF_IDENTIFIER = Buffer.from('MPF\0');
const GAIN_MAP_IDENTIFIER = Buffer.from('urn:iso:std:iso:ts:21496:-1\0');
const MPF_VERSION = Buffer.from('0100');
const SEF_GAIN_MAP_VERSION = 107;
const MAX_GAIN_MAP_PIXELS = 1024 * 1024;
const invalidImage = () => Object.assign(new Error('invalid image'), { exitCode: 5 });

// Percorre marcadores JPEG e dados de scan sem interpretar pixels nem segmentos APP.
function jpegStructure(input) {
  if (input[0] !== 0xff || input[1] !== 0xd8) throw invalidImage();
  let offset = 2;
  let scan = false;
  let sawScan = false;
  let mpf, iso;
  while (offset < input.length) {
    if (scan) offset = input.indexOf(0xff, offset);
    if (offset < 0 || input[offset] !== 0xff) break;
    while (input[offset] === 0xff) offset++;
    const marker = input[offset++];
    if (marker === 0x01 || (scan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7)))) continue;
    if (marker === JPEG_EOI && sawScan) return { end: offset, mpf, iso };
    if (!marker || marker === 0xd8 || marker === JPEG_EOI || offset + 2 > input.length) break;
    const size = input.readUInt16BE(offset);
    if (size < 2 || offset + size > input.length) break;
    if (marker === 0xe2 && !sawScan) {
      const payload = input.subarray(offset + 2, offset + size);
      if (payload.subarray(0, MPF_IDENTIFIER.length).equals(MPF_IDENTIFIER)) {
        mpf = mpf === undefined ? { offset: offset + 2 + MPF_IDENTIFIER.length, tiff: payload.subarray(MPF_IDENTIFIER.length) } : null;
      }
      if (payload.subarray(0, GAIN_MAP_IDENTIFIER.length).equals(GAIN_MAP_IDENTIFIER)) {
        iso = iso === undefined ? payload.subarray(GAIN_MAP_IDENTIFIER.length) : null;
      }
    }
    offset += size;
    scan = marker === 0xda || (scan && marker === 0xdc);
    sawScan ||= scan;
  }
  throw invalidImage();
}

function mpfTag(tiff, offset, tag, type, count) {
  return tiff.readUInt16LE(offset) === tag &&
    tiff.readUInt16LE(offset + 2) === type && tiff.readUInt32LE(offset + 4) === count;
}

function mpfHeader(mpf, length, count) {
  const tiff = mpf?.tiff;
  return tiff?.length === length && tiff.readUInt32LE(0) === 0x002a4949 &&
    tiff.readUInt32LE(4) === 8 && tiff.readUInt16LE(8) === count &&
    mpfTag(tiff, 10, 0xb000, 7, 4) && tiff.subarray(18, 22).equals(MPF_VERSION) &&
    tiff.readUInt32LE(10 + count * 12) === 0;
}

// Perfil Galaxy observado: um índice MPF 0100 little-endian com dois JPEGs,
// seguido do atributo MPF do mapa auxiliar. Nenhum offset sai do APP2.
function samsungGainMap(input, primary, sefStart) {
  const { end, mpf, iso } = primary;
  if (!mpfHeader(mpf, 82, 3) || iso?.length !== 4 || iso.readUInt32BE(0) !== 0) throw invalidImage();
  const { offset, tiff } = mpf;
  const entries = 50;
  if (!mpfTag(tiff, 22, 0xb001, 4, 1) || tiff.readUInt32LE(30) !== 2 ||
      !mpfTag(tiff, 34, 0xb002, 7, 32) || tiff.readUInt32LE(42) !== entries) throw invalidImage();
  const main = tiff.subarray(entries, entries + 16);
  const auxiliary = tiff.subarray(entries + 16);
  if (main.readUInt32LE(0) !== 0x030000 || main.readUInt32LE(4) !== end ||
      main.readUInt32LE(8) !== 0 || main.readUInt32LE(12) !== 0 ||
      auxiliary.readUInt32LE(0) !== 0 || auxiliary.readUInt32LE(4) !== sefStart - end ||
      offset + auxiliary.readUInt32LE(8) !== end || auxiliary.readUInt32LE(12) !== 0) throw invalidImage();
  const bytes = input.subarray(end, sefStart);
  const map = jpegStructure(bytes);
  // ISO 21496-1 v0, um canal, primárias da imagem base e frações independentes.
  if (map.end !== bytes.length || !mpfHeader(map.mpf, 26, 1) ||
      map.iso?.length !== 61 || map.iso.readUInt32BE(0) !== 0 || map.iso[4] !== 0x40 ||
      [9,17,25,33,41,49,57].some(position => map.iso.readUInt32BE(position) === 0)) throw invalidImage();
  return bytes;
}

function jpegPayload(input) {
  const primary = jpegStructure(input);
  const { end } = primary;
  if (end === input.length) return { input };
  // Todo o sufixo precisa caber no limite SEF existente, inclusive o JPEG auxiliar.
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
  const sefStart = blocks[0].start;
  let next = sefStart;
  for (const block of blocks) {
    if (block.start !== next) throw invalidImage();
    next = block.end;
  }
  if (next !== directory || (sefStart !== end && input.readUInt32LE(directory + 4) !== SEF_GAIN_MAP_VERSION)) throw invalidImage();
  const gainMap = sefStart === end ? undefined : samsungGainMap(input, primary, sefStart);
  return { input: input.subarray(0, end), gainMap };
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
  const { input, gainMap } = jpeg ? jpegPayload(original) : { input: original };
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
  if (gainMap) {
    // Valida a decodificação do mapa monocromático dentro do mesmo subprocesso.
    // Seus pixels nunca são usados para gerar ou compor a miniatura.
    const decoder = sharp(gainMap, { ...options, limitInputPixels: MAX_GAIN_MAP_PIXELS });
    const map = await decoder.metadata();
    if (map.format !== 'jpeg' || map.channels !== 1 || (map.pages ?? 1) !== 1 ||
        map.width > 8192 || map.height > 8192) throw invalidImage();
    await decoder.raw().toBuffer();
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
