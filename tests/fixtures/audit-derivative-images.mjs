import sharp from 'sharp';

export function texturedJpeg(width, height, quality) {
  const pixels = Buffer.alloc(width * height);
  let state = 1234567;
  for (let index = 0; index < pixels.length; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    pixels[index] = state >>> 24;
  }
  return sharp(pixels, { raw: { width, height, channels: 1 } }).jpeg({ quality }).toBuffer();
}

export function withSefTrailer(jpeg) {
  const first = Buffer.alloc(38, 0x45);
  const second = Buffer.alloc(129, 0x53);
  const directory = Buffer.alloc(36);
  directory.write('SEFH');
  directory.writeUInt32LE(101, 4);
  directory.writeUInt32LE(2, 8);
  directory.writeUInt32LE(first.length + second.length, 16);
  directory.writeUInt32LE(first.length, 20);
  directory.writeUInt32LE(second.length, 28);
  directory.writeUInt32LE(second.length, 32);
  const footer = Buffer.alloc(8);
  footer.writeUInt32LE(directory.length);
  footer.write('SEFT', 4);
  return Buffer.concat([jpeg, first, second, directory, footer]);
}
