// Gera arquivos inteiramente sintéticos; não acessa a aplicação nem faz uploads.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
const [countArg, directory] = process.argv.slice(2);
if (!["10", "30", "100"].includes(countArg) || !directory) throw new Error("Uso: node scripts/generate-audit-evidence-fixtures.mjs 10|30|100 /tmp/audit-synthetic");
const output = resolve(directory);
await mkdir(output, { recursive: true });
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const label = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([label, data])));
  return Buffer.concat([length, label, data, crc]);
}
const width = 960, height = 640, manifest = [];
for (let index = 0; index < Number(countArg); index++) {
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  let seed = 104729 + index;
  for (let y = 0; y < height; y++) {
    const offset = y * (width * 3 + 1);
    for (let x = 1; x <= width * 3; x++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; pixels[offset + x] = seed >>> 24; }
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
  const name = `synthetic-${String(index + 1).padStart(3,"0")}.png`;
  // Nunca sobrescreve um arquivo preexistente.
  await writeFile(join(output, name), png, { flag: "wx", mode: 0o600 });
  manifest.push({ name, bytes: png.length, sha256: createHash("sha256").update(png).digest("hex"), criterion: Math.floor(index / 10) + 1 });
}
await writeFile(join(output,"manifest.json"), JSON.stringify({ width, height, images: manifest }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
console.log("Fixtures PNG sintéticas e manifesto gerados; nenhum upload realizado.");
