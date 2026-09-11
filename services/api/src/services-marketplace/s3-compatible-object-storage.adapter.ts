import { createHash, createHmac } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  ObjectStorageObjectMetadata,
  ObjectStoragePort,
  ObjectStorageUploadIntent,
  UnconfiguredObjectStorageAdapter,
} from './object-storage.port';

type S3CompatibleConfig = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  presignTtlSeconds: number;
};

const encoder = new TextEncoder();
const hex = (value: Uint8Array) => Buffer.from(value).toString('hex');
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: Uint8Array | string, value: string) => createHmac('sha256', key).update(value).digest();
const awsEncode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encodeKey = (key: string) => key.split('/').map(awsEncode).join('/');
const trimSlash = (value: string) => value.replace(/\/+$/, '');

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when OBJECT_STORAGE_DRIVER=s3`);
  return value;
}

export function s3CompatibleConfigFromEnv(): S3CompatibleConfig {
  const endpoint = required('OBJECT_STORAGE_S3_ENDPOINT');
  const endpointUrl = new URL(endpoint);
  if (!['http:', 'https:'].includes(endpointUrl.protocol)) throw new Error('OBJECT_STORAGE_S3_ENDPOINT must use http or https');

  const ttlRaw = process.env.OBJECT_STORAGE_S3_PRESIGN_TTL_SECONDS?.trim();
  const ttl = ttlRaw ? Number(ttlRaw) : 300;
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 900) {
    throw new Error('OBJECT_STORAGE_S3_PRESIGN_TTL_SECONDS must be an integer between 60 and 900');
  }

  return {
    endpoint: trimSlash(endpoint),
    bucket: required('OBJECT_STORAGE_S3_BUCKET'),
    region: required('OBJECT_STORAGE_S3_REGION'),
    accessKeyId: required('OBJECT_STORAGE_S3_ACCESS_KEY_ID'),
    secretAccessKey: required('OBJECT_STORAGE_S3_SECRET_ACCESS_KEY'),
    publicBaseUrl: trimSlash(required('OBJECT_STORAGE_PUBLIC_BASE_URL')),
    presignTtlSeconds: ttl,
  };
}

export function createObjectStorageAdapterFromEnv(): ObjectStoragePort {
  const driver = process.env.OBJECT_STORAGE_DRIVER?.trim().toLowerCase();
  if (!driver) return new UnconfiguredObjectStorageAdapter();
  if (driver !== 's3') throw new Error(`Unsupported OBJECT_STORAGE_DRIVER: ${driver}`);
  return new S3CompatibleObjectStorageAdapter(s3CompatibleConfigFromEnv());
}

export class S3CompatibleObjectStorageAdapter implements ObjectStoragePort {
  constructor(private readonly config: S3CompatibleConfig) {}

  async createUploadIntent(input: {
    storageKey: string;
    contentType: string;
    contentLengthBytes: number;
  }): Promise<ObjectStorageUploadIntent> {
    const expiresAt = new Date(Date.now() + this.config.presignTtlSeconds * 1000).toISOString();
    return {
      storageKey: input.storageKey,
      uploadUrl: this.presign('PUT', input.storageKey, this.config.presignTtlSeconds),
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
      publicUrl: `${this.config.publicBaseUrl}/${encodeKey(input.storageKey)}`,
      expiresAt,
    };
  }

  async headObject(storageKey: string): Promise<ObjectStorageObjectMetadata | null> {
    const response = await fetch(this.presign('HEAD', storageKey, 60), { method: 'HEAD' });
    if (response.status === 404) return null;
    if (!response.ok) throw new ServiceUnavailableException(`Object storage HEAD failed (${response.status})`);
    const length = response.headers.get('content-length');
    return {
      contentType: response.headers.get('content-type'),
      contentLengthBytes: length === null ? null : Number(length),
    };
  }

  async deleteObject(storageKey: string): Promise<void> {
    const response = await fetch(this.presign('DELETE', storageKey, 60), { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      throw new ServiceUnavailableException(`Object storage DELETE failed (${response.status})`);
    }
  }

  private presign(method: 'PUT' | 'HEAD' | 'DELETE', storageKey: string, expiresSeconds: number): string {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = amzDate.slice(0, 8);
    const credentialScope = `${date}/${this.config.region}/s3/aws4_request`;
    const endpoint = new URL(this.config.endpoint);
    const basePath = endpoint.pathname.replace(/\/$/, '');
    const canonicalUri = `${basePath}/${awsEncode(this.config.bucket)}/${encodeKey(storageKey)}`.replace(/^$/, '/');
    const credential = `${this.config.accessKeyId}/${credentialScope}`;
    const query: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresSeconds),
      'X-Amz-SignedHeaders': 'host',
    };
    const canonicalQuery = Object.entries(query)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
      .join('&');
    const host = endpoint.host;
    const canonicalRequest = [method, canonicalUri, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256(canonicalRequest)].join('\n');
    const kDate = hmac(encoder.encode(`AWS4${this.config.secretAccessKey}`), date);
    const kRegion = hmac(kDate, this.config.region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = hex(hmac(kSigning, stringToSign));
    return `${endpoint.origin}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }
}
