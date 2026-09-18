import { describe, expect, it } from 'vitest';
import { safeOperationalError } from './safe-operational-error';

describe('safeOperationalError', () => {
  it('never emits an exception message or stack', () => {
    const error = new Error('Bearer super-secret-token phone=9999999999');
    error.name = 'GatewayError';
    (error as Error & { code?: string }).code = 'PROVIDER_TIMEOUT';

    const value = safeOperationalError(error);

    expect(value).toBe('GatewayError code=PROVIDER_TIMEOUT');
    expect(value).not.toContain('super-secret-token');
    expect(value).not.toContain('9999999999');
    expect(value).not.toContain('Bearer');
  });

  it('drops unsafe provider codes instead of reflecting arbitrary text', () => {
    const value = safeOperationalError({ name: 'ProviderError', code: 'token=secret value' });
    expect(value).toBe('ProviderError');
    expect(value).not.toContain('secret');
  });

  it('uses a stable fallback for non-error values', () => {
    expect(safeOperationalError('raw provider failure with secret')).toBe('UnknownError');
    expect(safeOperationalError(null)).toBe('UnknownError');
  });
});
