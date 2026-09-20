import { afterEach, describe, expect, it } from 'vitest';
import { IntegrationRegistryService } from './integration-registry.service';

const keys = [
  'NODE_ENV',
  'OTP_DELIVERY_PROVIDER',
  'MSG91_AUTH_KEY',
  'MSG91_OTP_TEMPLATE_ID',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'PAYMENT_GATEWAY_RECONCILIATION_ENVIRONMENT',
  'PAYMENT_GATEWAY_RECONCILIATION_PROVIDER',
  'PAYMENT_GATEWAY_RECONCILIATION_SANDBOX_BASE_URL',
  'PAYMENT_GATEWAY_RECONCILIATION_SANDBOX_API_KEY',
  'PAYMENT_GATEWAY_RECONCILIATION_LIVE_BASE_URL',
  'PAYMENT_GATEWAY_RECONCILIATION_LIVE_API_KEY',
  'OBJECT_STORAGE_DRIVER',
  'OBJECT_STORAGE_S3_ENDPOINT',
  'OBJECT_STORAGE_S3_BUCKET',
  'OBJECT_STORAGE_S3_REGION',
  'OBJECT_STORAGE_S3_ACCESS_KEY_ID',
  'OBJECT_STORAGE_S3_SECRET_ACCESS_KEY',
  'OBJECT_STORAGE_PUBLIC_BASE_URL',
  'ACCOUNTING_CONNECTOR_PROVIDER',
  'ACCOUNTING_CONNECTOR_BASE_URL',
] as const;

const original = new Map(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('IntegrationRegistryService', () => {
  it('reports supported families without exposing secret values', () => {
    process.env.NODE_ENV = 'production';
    process.env.OTP_DELIVERY_PROVIDER = 'msg91';
    process.env.MSG91_AUTH_KEY = 'otp-secret';
    process.env.MSG91_OTP_TEMPLATE_ID = 'template-1';
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: 'p', client_email: 'a@b.test', private_key: 'push-secret' });
    process.env.PAYMENT_GATEWAY_RECONCILIATION_ENVIRONMENT = 'live';
    process.env.PAYMENT_GATEWAY_RECONCILIATION_PROVIDER = 'gateway-x';
    process.env.PAYMENT_GATEWAY_RECONCILIATION_LIVE_BASE_URL = 'https://gateway.example';
    process.env.PAYMENT_GATEWAY_RECONCILIATION_LIVE_API_KEY = 'payment-secret';
    process.env.OBJECT_STORAGE_DRIVER = 's3';
    process.env.OBJECT_STORAGE_S3_ENDPOINT = 'https://storage.example';
    process.env.OBJECT_STORAGE_S3_BUCKET = 'bucket';
    process.env.OBJECT_STORAGE_S3_REGION = 'ap-south-1';
    process.env.OBJECT_STORAGE_S3_ACCESS_KEY_ID = 'access';
    process.env.OBJECT_STORAGE_S3_SECRET_ACCESS_KEY = 'storage-secret';
    process.env.OBJECT_STORAGE_PUBLIC_BASE_URL = 'https://cdn.example';
    process.env.ACCOUNTING_CONNECTOR_PROVIDER = 'bridge-x';
    process.env.ACCOUNTING_CONNECTOR_BASE_URL = 'https://accounting.example';

    const result = new IntegrationRegistryService().list('society-1');
    expect(result.map((item) => item.family)).toEqual([
      'OTP',
      'PUSH',
      'PAYMENT_GATEWAY',
      'ACCESS_CONTROL',
      'OBJECT_STORAGE',
      'SMART_METER',
      'ACCOUNTING_CONNECTOR',
    ]);
    expect(result.every((item) => item.health === 'READY')).toBe(true);
    expect(result.every((item) => item.contractVersion === 'aaraagate.integration.v1')).toBe(true);
    expect(result.find((item) => item.family === 'SMART_METER')?.retryDisposition).toBe('IDEMPOTENT_RETRY');
    const serialized = JSON.stringify(result);
    for (const secret of ['otp-secret', 'push-secret', 'payment-secret', 'storage-secret']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('fails readiness closed when production integration configuration is incomplete', () => {
    process.env.NODE_ENV = 'production';
    process.env.OTP_DELIVERY_PROVIDER = 'msg91';
    delete process.env.MSG91_AUTH_KEY;
    delete process.env.MSG91_OTP_TEMPLATE_ID;
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{invalid';
    process.env.PAYMENT_GATEWAY_RECONCILIATION_ENVIRONMENT = 'live';
    delete process.env.PAYMENT_GATEWAY_RECONCILIATION_LIVE_BASE_URL;
    delete process.env.PAYMENT_GATEWAY_RECONCILIATION_LIVE_API_KEY;
    process.env.OBJECT_STORAGE_DRIVER = 's3';
    delete process.env.OBJECT_STORAGE_S3_ENDPOINT;
    delete process.env.ACCOUNTING_CONNECTOR_BASE_URL;

    const byFamily = Object.fromEntries(new IntegrationRegistryService().list('society-1').map((item) => [item.family, item]));
    expect(byFamily.OTP.health).toBe('UNCONFIGURED');
    expect(byFamily.PUSH.health).toBe('DEGRADED');
    expect(byFamily.PAYMENT_GATEWAY.health).toBe('UNCONFIGURED');
    expect(byFamily.OBJECT_STORAGE.health).toBe('DEGRADED');
    expect(byFamily.ACCOUNTING_CONNECTOR.health).toBe('UNCONFIGURED');
    expect(byFamily.ACCESS_CONTROL.configurationScope).toBe('SOCIETY');
  });

  it('keeps payment gateway environment validation explicit', () => {
    process.env.PAYMENT_GATEWAY_RECONCILIATION_ENVIRONMENT = 'unexpected';
    const payment = new IntegrationRegistryService().list('society-1').find((item) => item.family === 'PAYMENT_GATEWAY');
    expect(payment?.configured).toBe(false);
    expect(payment?.health).toBe('DEGRADED');
  });
});
