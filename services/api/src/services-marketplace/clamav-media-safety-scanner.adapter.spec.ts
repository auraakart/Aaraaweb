import { ServiceUnavailableException } from '@nestjs/common';
import { AddressInfo, createServer, Server } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClamAvMediaSafetyScanner,
  createMediaSafetyScannerFromEnv,
} from './clamav-media-safety-scanner.adapter';
import { UnconfiguredMediaSafetyScanner } from './media-safety-scanner.port';
import { ObjectStoragePort } from './object-storage.port';

const envKeys = [
  'MEDIA_SAFETY_SCANNER_DRIVER',
  'CLAMAV_HOST',
  'CLAMAV_PORT',
  'CLAMAV_TIMEOUT_MS',
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

function storageWith(bytes: Uint8Array | null): ObjectStoragePort {
  return {
    createUploadIntent: vi.fn(),
    headObject: vi.fn(),
    getObjectBytes: vi.fn().mockResolvedValue(bytes),
    deleteObject: vi.fn(),
  } as unknown as ObjectStoragePort;
}

async function startFakeClamd(response: string) {
  const command = Buffer.from('zINSTREAM\0', 'utf8');
  let receivedPayload = Buffer.alloc(0);
  const server: Server = createServer((socket) => {
    let buffered = Buffer.alloc(0);
    socket.on('data', (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.length < command.length || !buffered.subarray(0, command.length).equals(command)) return;

      let offset = command.length;
      const payloadParts: Buffer[] = [];
      while (buffered.length >= offset + 4) {
        const length = buffered.readUInt32BE(offset);
        offset += 4;
        if (length === 0) {
          receivedPayload = Buffer.concat(payloadParts);
          socket.end(Buffer.from(`${response}\0`, 'utf8'));
          return;
        }
        if (buffered.length < offset + length) return;
        payloadParts.push(buffered.subarray(offset, offset + length));
        offset += length;
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  return {
    port: address.port,
    payload: () => receivedPayload,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('ClamAvMediaSafetyScanner', () => {
  beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('stays fail-closed when no scanner driver is configured', () => {
    expect(createMediaSafetyScannerFromEnv(storageWith(new Uint8Array([1])))).toBeInstanceOf(
      UnconfiguredMediaSafetyScanner,
    );
  });

  it('streams object bytes to clamd and returns CLEAN for an OK response', async () => {
    const fake = await startFakeClamd('stream: OK');
    try {
      const storage = storageWith(new Uint8Array([1, 2, 3, 4]));
      const scanner = new ClamAvMediaSafetyScanner(storage, {
        host: '127.0.0.1',
        port: fake.port,
        timeoutMs: 2_000,
      });

      await expect(
        scanner.scanObject({
          storageKey: 'providers/p1/media/photo.png',
          contentType: 'image/png',
          contentLengthBytes: 4,
        }),
      ).resolves.toEqual({ status: 'CLEAN', engine: 'clamav', reference: null });
      expect(fake.payload()).toEqual(Buffer.from([1, 2, 3, 4]));
      expect(storage.getObjectBytes).toHaveBeenCalledWith('providers/p1/media/photo.png', 5 * 1024 * 1024);
    } finally {
      await fake.close();
    }
  });

  it('returns INFECTED with a bounded signature reference when clamd reports FOUND', async () => {
    const fake = await startFakeClamd('stream: Eicar-Signature FOUND');
    try {
      const scanner = new ClamAvMediaSafetyScanner(storageWith(new Uint8Array([9, 8, 7])), {
        host: '127.0.0.1',
        port: fake.port,
        timeoutMs: 2_000,
      });

      await expect(
        scanner.scanObject({
          storageKey: 'providers/p1/media/photo.webp',
          contentType: 'image/webp',
          contentLengthBytes: 3,
        }),
      ).resolves.toEqual({ status: 'INFECTED', engine: 'clamav', reference: 'Eicar-Signature' });
    } finally {
      await fake.close();
    }
  });

  it('fails closed when the object disappears or changes before scanning', async () => {
    const missing = new ClamAvMediaSafetyScanner(storageWith(null), {
      host: '127.0.0.1',
      port: 3310,
      timeoutMs: 1_000,
    });
    await expect(
      missing.scanObject({ storageKey: 'missing', contentType: 'image/png', contentLengthBytes: 3 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    const changed = new ClamAvMediaSafetyScanner(storageWith(new Uint8Array([1, 2])), {
      host: '127.0.0.1',
      port: 3310,
      timeoutMs: 1_000,
    });
    await expect(
      changed.scanObject({ storageKey: 'changed', contentType: 'image/png', contentLengthBytes: 3 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
