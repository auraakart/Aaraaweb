import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnconfiguredObjectStorageAdapter } from './object-storage.port';
import {
  createObjectStorageAdapterFromEnv,
  S3CompatibleObjectStorageAdapter,
} from './s3-compatible-object-storage.adapter';

const envKeys = [
  'OBJECT_STORAGE_DRIVER',
  'OBJECT_STORAGE_S3_ENDPOINT',
  'OBJECT_STORAGE_S3_BUCKET',
  'OBJECT_STORAGE_S3_REGION',
  'OBJECT_STORAGE_S3_ACCESS_KEY_ID',
  'OBJECT_STORAGE_S3_SECRET_ACCESS_KEY',
  'OBJECT_STORAGE_PUBLIC_BASE_URL',
  'OBJECT_STORAGE_S3_PRESIGN_TTL_SECONDS',
] as const;

const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

function configure() {
  process.env.OBJECT_STORAGE_DRIVER = 's3';
  process.env.OBJECT_STORAGE_S3_ENDPOINT = 'https://objects.example.test';
  process.env.OBJECT_STORAGE_S3_BUCKET = 'aaraagate-media';
  process.env.OBJECT_STORAGE_S3_REGION = 'auto';
  process.env.OBJECT_STORAGE_S3_ACCESS_KEY_ID = 'test-access';
  process.env.OBJECT_STORAGE_S3_SECRET_ACCESS_KEY = 'test-secret';
  process.env.OBJECT_STORAGE_PUBLIC_BASE_URL = 'https://cdn.example.test';
  process.env.OBJECT_STORAGE_S3_PRESIGN_TTL_SECONDS = '300';
}

describe('S3CompatibleObjectStorageAdapter', () => {
  beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-11T07:15:30.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    for (const key of envKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('keeps storage disabled unless a driver is explicitly configured', () => {
    expect(createObjectStorageAdapterFromEnv()).toBeInstanceOf(UnconfiguredObjectStorageAdapter);
  });

  it('fails fast when the S3 driver configuration is incomplete', () => {
    process.env.OBJECT_STORAGE_DRIVER = 's3';
    expect(() => createObjectStorageAdapterFromEnv()).toThrow(/OBJECT_STORAGE_S3_ENDPOINT/);
  });

  it('creates a signed provider-scoped PUT URL without exposing the secret', async () => {
    configure();
    const adapter = createObjectStorageAdapterFromEnv();
    expect(adapter).toBeInstanceOf(S3CompatibleObjectStorageAdapter);

    const intent = await adapter.createUploadIntent({
      storageKey: 'providers/provider-1/media/photo one.webp',
      contentType: 'image/webp',
      contentLengthBytes: 1234,
    });
    const url = new URL(intent.uploadUrl);

    expect(url.origin).toBe('https://objects.example.test');
    expect(url.pathname).toBe('/aaraagate-media/providers/provider-1/media/photo%20one.webp');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('test-access/20260911/auto/s3/aws4_request');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(intent.uploadUrl).not.toContain('test-secret');
    expect(intent.headers).toEqual({ 'Content-Type': 'image/webp' });
    expect(intent.publicUrl).toBe('https://cdn.example.test/providers/provider-1/media/photo%20one.webp');
    expect(intent.expiresAt).toBe('2026-09-11T07:20:30.000Z');
  });

  it('reads object metadata through a signed HEAD request', async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '4321' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = createObjectStorageAdapterFromEnv();

    await expect(adapter.headObject('providers/p1/media/logo.png')).resolves.toEqual({
      contentType: 'image/png',
      contentLengthBytes: 4321,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('HEAD');
    expect(new URL(url).searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('reads object bytes through signed GET and enforces the scan size cap', async () => {
    configure();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '3' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-length': '999' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const adapter = createObjectStorageAdapterFromEnv();

    await expect(adapter.getObjectBytes('providers/p1/media/logo.png', 10)).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('GET');
    expect(new URL(url).searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);

    await expect(adapter.getObjectBytes('providers/p1/media/large.png', 10)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('treats missing objects as absent and fails closed on storage errors', async () => {
    configure();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = createObjectStorageAdapterFromEnv();

    await expect(adapter.headObject('missing.webp')).resolves.toBeNull();
    await expect(adapter.deleteObject('broken.webp')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
