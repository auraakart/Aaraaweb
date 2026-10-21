import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';

// V5.3.12: accept only bounded static PNG data. Never accept SVG, external
// URLs, animation, comments, ancillary metadata or unbounded decoding.
export const MAX_SOCIETY_LOGO_BYTES = 512 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const reject = (): never => { throw new BadRequestException('Invalid society PNG logo'); };

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function validateSocietyLogoPng(bytes: Uint8Array) {
  return validateStaticPng(bytes);
}

export function validateStaticPng(bytes: Uint8Array, limits = {minDimension:64, maxDimension:1024, maxBytes:MAX_SOCIETY_LOGO_BYTES}) {
  const file = Buffer.from(bytes);
  if (file.length < 57 || file.length > limits.maxBytes ||
      !file.subarray(0, 8).equals(PNG_SIGNATURE)) return reject();

  let pos = 8, width = 0, height = 0, channels = 0;
  let hasHeader = false, hasData = false, hasEnd = false, dataClosed = false;
  const compressed: Buffer[] = [];
  while (pos < file.length) {
    if (file.length - pos < 12) return reject();
    const length = file.readUInt32BE(pos);
    if (length > limits.maxBytes || length > file.length - pos - 12) return reject();
    const type = file.toString('ascii', pos + 4, pos + 8);
    const next = pos + length + 12;
    if (crc32(file.subarray(pos + 4, next - 4)) !== file.readUInt32BE(next - 4)) return reject();
    const chunk = file.subarray(pos + 8, next - 4);
    if (type === 'IHDR') {
      if (hasHeader || pos !== 8 || length !== 13) return reject();
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      channels = chunk[9] === 6 ? 4 : chunk[9] === 2 ? 3 : 0;
      if (width < limits.minDimension || width > limits.maxDimension || height < limits.minDimension || height > limits.maxDimension ||
          chunk[8] !== 8 || !channels || chunk[10] !== 0 ||
          chunk[11] !== 0 || chunk[12] !== 0) return reject();
      hasHeader = true;
    } else if (type === 'IDAT') {
      if (!hasHeader || dataClosed || hasEnd || length === 0) return reject();
      hasData = true;
      compressed.push(chunk);
    } else if (type === 'IEND') {
      if (!hasData || length !== 0 || next !== file.length) return reject();
      hasEnd = true;
    } else {
      return reject();
    }
    if (hasData && type !== 'IDAT') dataClosed = true;
    pos = next;
  }
  if (!hasHeader || !hasData || !hasEnd) return reject();
  const stride = width * channels + 1;
  const expected = stride * height;
  let decoded: Buffer;
  try {
    decoded = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected });
  } catch {
    return reject();
  }
  if (decoded.length !== expected) return reject();
  for (let y = 0; y < height; y++) {
    if (decoded[y * stride] > 4) return reject();
  }
  return { width, height, sha256: createHash('sha256').update(file).digest('hex') };
}
