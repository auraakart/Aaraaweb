import { BadRequestException } from '@nestjs/common';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { validateSocietyLogoPng } from './society-logo-validation';

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const n = Buffer.alloc(4), c = Buffer.alloc(4);
  n.writeUInt32BE(data.length);
  const value = Buffer.concat([Buffer.from(type), data]);
  c.writeUInt32BE(crc32(value));
  return Buffer.concat([n, value, c]);
}
function png(width = 64, height = 64, extras: Buffer[] = []) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr), ...extras,
    chunk('IDAT', deflateSync(Buffer.alloc(height * (width * 4 + 1)))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('V5.3.12 society logo PNG safety gate', () => {
  it('accepts a static RGBA PNG and produces a canonical SHA-256', () => {
    const approved = validateSocietyLogoPng(png());
    expect(approved).toMatchObject({ width: 64, height: 64 });
    expect(approved.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    Buffer.from('<svg><script>alert(1)</script></svg>'),
    png(63,64), png(1025,64),
    png(64,64,[chunk('tEXt',Buffer.from('untrusted metadata'))]),
    Buffer.concat([png(),Buffer.from('malicious trailing bytes')]),
    png().subarray(0,55),
    (() => { const p=png(); p[p.length-5]^=1; return p; })(),
    (() => { const p=png(); p[25]=1; return p; })(),
  ])('fails closed on unsafe, malformed, or oversized logo %#', (bytes) => {
    expect(() => validateSocietyLogoPng(bytes)).toThrow(BadRequestException);
  });
});
