import { ServiceUnavailableException } from '@nestjs/common';
import { createConnection } from 'node:net';
import {
  MediaSafetyScannerPort,
  MediaSafetyScanResult,
  UnconfiguredMediaSafetyScanner,
} from './media-safety-scanner.port';
import { ObjectStoragePort } from './object-storage.port';

const MAX_PROVIDER_MEDIA_BYTES = 5 * 1024 * 1024;
const CLAMD_CHUNK_BYTES = 64 * 1024;

type ClamAvConfig = {
  host: string;
  port: number;
  timeoutMs: number;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when MEDIA_SAFETY_SCANNER_DRIVER=clamav`);
  return value;
}

export function clamAvConfigFromEnv(): ClamAvConfig {
  const portRaw = process.env.CLAMAV_PORT?.trim();
  const port = portRaw ? Number(portRaw) : 3310;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('CLAMAV_PORT must be an integer between 1 and 65535');
  }

  const timeoutRaw = process.env.CLAMAV_TIMEOUT_MS?.trim();
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new Error('CLAMAV_TIMEOUT_MS must be an integer between 1000 and 30000');
  }

  return {
    host: required('CLAMAV_HOST'),
    port,
    timeoutMs,
  };
}

export function createMediaSafetyScannerFromEnv(storage: ObjectStoragePort): MediaSafetyScannerPort {
  const driver = process.env.MEDIA_SAFETY_SCANNER_DRIVER?.trim().toLowerCase();
  if (!driver) return new UnconfiguredMediaSafetyScanner();
  if (driver !== 'clamav') throw new Error(`Unsupported MEDIA_SAFETY_SCANNER_DRIVER: ${driver}`);
  return new ClamAvMediaSafetyScanner(storage, clamAvConfigFromEnv());
}

export class ClamAvMediaSafetyScanner implements MediaSafetyScannerPort {
  constructor(
    private readonly storage: ObjectStoragePort,
    private readonly config: ClamAvConfig,
  ) {}

  async scanObject(input: {
    storageKey: string;
    contentType: string;
    contentLengthBytes: number;
  }): Promise<MediaSafetyScanResult> {
    if (
      !Number.isInteger(input.contentLengthBytes) ||
      input.contentLengthBytes <= 0 ||
      input.contentLengthBytes > MAX_PROVIDER_MEDIA_BYTES
    ) {
      throw new ServiceUnavailableException('Provider media is outside the malware scanner size boundary');
    }

    const bytes = await this.storage.getObjectBytes(input.storageKey, MAX_PROVIDER_MEDIA_BYTES);
    if (!bytes) throw new ServiceUnavailableException('Uploaded provider media disappeared before malware scanning');
    if (bytes.byteLength !== input.contentLengthBytes) {
      throw new ServiceUnavailableException('Uploaded provider media changed before malware scanning');
    }

    return this.scanBytes(bytes);
  }

  private scanBytes(bytes: Uint8Array): Promise<MediaSafetyScanResult> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.config.host, port: this.config.port });
      const responseChunks: Buffer[] = [];
      let settled = false;

      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new ServiceUnavailableException(message));
      };

      const finish = (response: string) => {
        if (settled) return;
        const clean = response.replace(/\0.*$/s, '').trim();
        if (clean === 'stream: OK') {
          settled = true;
          socket.destroy();
          resolve({ status: 'CLEAN', engine: 'clamav', reference: null });
          return;
        }

        const infected = /^stream: (.+) FOUND$/.exec(clean);
        if (infected) {
          settled = true;
          socket.destroy();
          resolve({ status: 'INFECTED', engine: 'clamav', reference: infected[1].slice(0, 240) });
          return;
        }

        fail(`ClamAV returned an unexpected scan response: ${clean.slice(0, 160)}`);
      };

      socket.setTimeout(this.config.timeoutMs, () => fail('ClamAV scan timed out'));
      socket.on('error', () => fail('ClamAV scanner is unavailable'));
      socket.on('data', (chunk: Buffer) => {
        responseChunks.push(chunk);
        const response = Buffer.concat(responseChunks).toString('utf8');
        if (response.includes('\0')) finish(response);
      });
      socket.on('end', () => {
        if (!settled) finish(Buffer.concat(responseChunks).toString('utf8'));
      });

      socket.on('connect', () => {
        socket.write(Buffer.from('zINSTREAM\0', 'utf8'));
        for (let offset = 0; offset < bytes.byteLength; offset += CLAMD_CHUNK_BYTES) {
          const chunk = bytes.subarray(offset, Math.min(offset + CLAMD_CHUNK_BYTES, bytes.byteLength));
          const length = Buffer.allocUnsafe(4);
          length.writeUInt32BE(chunk.byteLength, 0);
          socket.write(length);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
    });
  }
}
