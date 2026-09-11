import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = resolve(process.cwd(), '../../scripts/production-preflight.sh');
const baseline: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'production',
  APP_VERSION: 'test-preflight',
  GIT_SHA: '0123456789abcdef',
  DATABASE_URL: 'postgresql://user:pass@db.example.internal:5432/aaraagate',
  REDIS_URL: 'rediss://redis.example.internal:6379',
  CORS_ALLOWED_ORIGINS: 'https://admin.example.com',
  OTP_DELIVERY_PROVIDER: 'msg91',
  MSG91_AUTH_KEY: 'test-auth-key',
  MSG91_OTP_TEMPLATE_ID: 'test-template',
  FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    project_id: 'test-project',
    client_email: 'test@example.invalid',
    private_key: 'test-private-key',
  }),
  PAYMENT_WEBHOOK_SECRET: 'test-payment-webhook-secret',
  NEXT_PUBLIC_AARAGATE_API_BASE_URL: 'https://api.example.com',
};

function run(extra: Record<string, string | undefined> = {}) {
  const env: NodeJS.ProcessEnv = { ...baseline, ...extra };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return spawnSync('bash', [script], { env, encoding: 'utf8' });
}

describe('production object-storage preflight', () => {
  it('passes with storage intentionally disabled and fail-closed', () => {
    const result = run({ OBJECT_STORAGE_DRIVER: undefined });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('provider-media storage remains fail-closed');
  });

  it('passes with complete HTTPS S3-compatible configuration', () => {
    const result = run({
      OBJECT_STORAGE_DRIVER: 's3',
      OBJECT_STORAGE_S3_ENDPOINT: 'https://storage.example.com',
      OBJECT_STORAGE_S3_BUCKET: 'provider-media',
      OBJECT_STORAGE_S3_REGION: 'auto',
      OBJECT_STORAGE_S3_ACCESS_KEY_ID: 'test-access-key',
      OBJECT_STORAGE_S3_SECRET_ACCESS_KEY: 'test-secret-key',
      OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://media.example.com',
      OBJECT_STORAGE_S3_PRESIGN_TTL_SECONDS: '300',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('S3-compatible provider-media storage');
    expect(result.stdout).not.toContain('test-secret-key');
  });

  it('fails when S3 configuration is incomplete without leaking secret values', () => {
    const result = run({
      OBJECT_STORAGE_DRIVER: 's3',
      OBJECT_STORAGE_S3_ENDPOINT: 'https://storage.example.com',
      OBJECT_STORAGE_S3_BUCKET: 'provider-media',
      OBJECT_STORAGE_S3_REGION: 'auto',
      OBJECT_STORAGE_S3_ACCESS_KEY_ID: 'test-access-key',
      OBJECT_STORAGE_S3_SECRET_ACCESS_KEY: undefined,
      OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://media.example.com',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('OBJECT_STORAGE_S3_SECRET_ACCESS_KEY is required');
    expect(result.stderr).not.toContain('test-access-key');
  });

  it('rejects insecure production storage endpoints', () => {
    const result = run({
      OBJECT_STORAGE_DRIVER: 's3',
      OBJECT_STORAGE_S3_ENDPOINT: 'http://storage.example.com',
      OBJECT_STORAGE_S3_BUCKET: 'provider-media',
      OBJECT_STORAGE_S3_REGION: 'auto',
      OBJECT_STORAGE_S3_ACCESS_KEY_ID: 'test-access-key',
      OBJECT_STORAGE_S3_SECRET_ACCESS_KEY: 'test-secret-key',
      OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://media.example.com',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('OBJECT_STORAGE_S3_ENDPOINT must use HTTPS in production');
  });
});
