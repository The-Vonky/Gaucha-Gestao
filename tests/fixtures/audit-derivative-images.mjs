import sharp from 'sharp';

function texture(width, height) {
  const pixels = Buffer.alloc(width * height);
  let state = 1234567;
  for (let index = 0; index < pixels.length; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    pixels[index] = state >>> 24;
  }
  return sharp(pixels, { raw: { width, height, channels: 1 } });
}

export function texturedJpeg(width, height, quality) {
  return texture(width, height).jpeg({ quality }).toBuffer();
}

export function withSefTrailer(jpeg, { version = 101, sizes = [38, 129] } = {}) {
  const directory = Buffer.alloc(12 + sizes.length * 12);
  directory.write('SEFH');
  directory.writeUInt32LE(version, 4);
  directory.writeUInt32LE(sizes.length, 8);
  let offset = sizes.reduce((total, size) => total + size, 0);
  const blocks = sizes.map((size, index) => {
    directory.writeUInt32LE(offset, 16 + index * 12);
    directory.writeUInt32LE(size, 20 + index * 12);
    offset -= size;
    return Buffer.alloc(size, 0x45 + index);
  });
  const footer = Buffer.alloc(8);
  footer.writeUInt32LE(directory.length);
  footer.write('SEFT', 4);
  return Buffer.concat([jpeg, ...blocks, directory, footer]);
}

const ISO_ID = Buffer.from('urn:iso:std:iso:ts:21496:-1\0');
const MPF_ID = Buffer.from('MPF\0');

function app2(identifier, contents) {
  const marker = Buffer.from([0xff, 0xe2, 0, 0]);
  marker.writeUInt16BE(identifier.length + contents.length + 2, 2);
  return Buffer.concat([marker, identifier, contents]);
}

function tag(tiff, position, name, type, count, value) {
  tiff.writeUInt16LE(name, position);
  tiff.writeUInt16LE(type, position + 2);
  tiff.writeUInt32LE(count, position + 4);
  tiff.writeUInt32LE(value, position + 8);
}

function mpf(count, size) {
  const tiff = Buffer.alloc(size);
  tiff.writeUInt32LE(0x002a4949, 0);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(count, 8);
  tag(tiff, 10, 0xb000, 7, 4, 0);
  tiff.write('0100', 18);
  return tiff;
}

export function withSamsungGainMap(primary, map) {
  const primaryIso = app2(ISO_ID, Buffer.alloc(4));
  const metadata = Buffer.alloc(61);
  metadata[4] = 0x40;
  for (const offset of [9,17,25,33,41,49,57]) metadata.writeUInt32BE(1, offset);
  metadata.writeUInt32BE(1, 13); // headroom alternativo
  metadata.writeInt32BE(1, 29); // ganho máximo
  metadata.writeUInt32BE(1, 37); // gama
  const secondary = Buffer.concat([
    map.subarray(0, 2), app2(ISO_ID, metadata), app2(MPF_ID, mpf(1, 26)), map.subarray(2),
  ]);

  const index = mpf(3, 82);
  tag(index, 22, 0xb001, 4, 1, 2);
  tag(index, 34, 0xb002, 7, 32, 50);
  const tiffOffset = 2 + primaryIso.length + 4 + MPF_ID.length;
  const primarySize = primary.length + primaryIso.length + 4 + MPF_ID.length + index.length;
  index.writeUInt32LE(0x030000, 50);
  index.writeUInt32LE(primarySize, 54);
  index.writeUInt32LE(secondary.length, 70);
  index.writeUInt32LE(primarySize - tiffOffset, 74);
  return withSefTrailer(Buffer.concat([
    primary.subarray(0, 2), primaryIso, app2(MPF_ID, index), primary.subarray(2), secondary,
  ]), { version: 107, sizes: [35, 19, 27, 23, 33] });
}

export async function samsungJpegFixture() {
  const primary = await texture(4000, 2252).withMetadata({ orientation: 6 }).jpeg({ quality: 42 }).toBuffer();
  const map = await texture(120, 68).resize(1000, 564, { fit: 'fill' }).toColourspace('b-w').jpeg({ quality: 24 }).toBuffer();
  return { primary, map, bytes: withSamsungGainMap(primary, map) };
}
