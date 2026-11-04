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
      metadata.width > 8192 || metadata.height > 8192) throw new Error('dimensions');
  // rotate() aplica EXIF; saída padrão do Sharp descarta EXIF/XMP/ICC/GPS.
  let pipeline = sharp(input, options).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true });
  // PNG permanece lossless, inclusive textos, etiquetas e alpha; JPEG evita chroma subsampling.
  pipeline = png ? pipeline.png({ compressionLevel: 9 }) : pipeline.jpeg({ quality: 86, chromaSubsampling: '4:4:4' });
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  if (data.length > DERIVATIVE_MAX_OUTPUT_BYTES) throw new Error('output');
  process.stdout.write(JSON.stringify({ mime, width: info.width, height: info.height, bytes: data.toString('base64') }));
} catch {
  // Erros do decoder não expõem bytes/metadata/caminhos.
  process.exitCode = 1;
}
