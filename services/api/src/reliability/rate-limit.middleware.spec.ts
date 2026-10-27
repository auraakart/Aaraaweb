import { describe, expect, it, vi } from 'vitest';
import { RateLimitMiddleware, resolveRateLimitClient, resolveRateLimitPolicy } from './rate-limit.middleware';

describe('rate limit policy', () => {
  it('exempts health and CORS preflight traffic', () => {
    expect(resolveRateLimitPolicy('GET', '/api/v1/health/ready')).toBeNull();
    expect(resolveRateLimitPolicy('OPTIONS', '/api/v1/auth/otp/request')).toBeNull();
  });

  it('uses stricter OTP buckets and a broad API bucket', () => {
    expect(resolveRateLimitPolicy('POST', '/api/v1/auth/otp/request')).toEqual({ name: 'otp-request', limit: 5, windowSeconds: 300 });
    expect(resolveRateLimitPolicy('POST', '/api/v1/auth/otp/verify')).toEqual({ name: 'otp-verify', limit: 10, windowSeconds: 300 });
    expect(resolveRateLimitPolicy('POST', '/api/v1/billing/payment-webhooks/gateway-adapter')).toEqual({ name: 'payment-webhook', limit: 600, windowSeconds: 60 });
    expect(resolveRateLimitPolicy('GET', '/api/v1/residents/me')).toEqual({ name: 'api', limit: 300, windowSeconds: 60 });
  });

  it('does not trust forwarded client headers unless explicitly enabled', () => {
    const request = {
      method: 'GET',
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.2' },
      socket: { remoteAddress: '10.0.0.8' },
    };
    expect(resolveRateLimitClient(request, false)).toBe('10.0.0.8');
    expect(resolveRateLimitClient(request, true)).toBe('203.0.113.10');
  });

  it.each([
    ['/api/v1/auth/otp/request', 'otp-request'],
    ['/api/v1/auth/otp/verify', 'otp-verify'],
    ['/api/v1/auth/partner/otp/verify', 'otp-verify'],
    ['/api/v1/auth/partner/host/otp/verify', 'otp-verify'],
    ['/api/v1/auth/refresh', 'auth-refresh'],
    ['/api/v1/billing/payment-webhooks/gateway-adapter', 'payment-webhook'],
  ])('uses the same protection for Express aliases of %s', (path, name) => {
    for (const alias of [path, `${path}/`, path.toUpperCase(), `${path.toUpperCase()}/?retry=1`]) {
      expect(resolveRateLimitPolicy('POST', alias)?.name).toBe(name);
    }
  });

  it('retains generic API limits and does not classify near-matches as auth routes', () => {
    expect(resolveRateLimitPolicy('GET', '/API/V1/residents/me/')?.name).toBe('api');
    expect(resolveRateLimitPolicy('POST', '/api/v1/auth/otp/verify-extra')?.name).toBe('api');
    expect(resolveRateLimitPolicy('GET', '/API/V1/HEALTH/READY/')).toBeNull();
    expect(resolveRateLimitPolicy('POST', '/other/auth/otp/verify')).toBeNull();
  });
});

describe('RateLimitMiddleware', () => {
  it('shares the verification bucket between platform and partner route aliases', async () => {
    const store = { increment: vi.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(11) };
    const middleware = new RateLimitMiddleware(store as never);
    const response = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();
    for (const originalUrl of ['/api/v1/auth/otp/verify', '/API/V1/AUTH/PARTNER/HOST/OTP/VERIFY/']) {
      await middleware.use({ method: 'POST', originalUrl, headers: {}, socket: { remoteAddress: '10.0.0.9' } }, response, next);
    }
    expect(store.increment.mock.calls[0]).toEqual(store.increment.mock.calls[1]);
    expect(response.statusCode).toBe(429);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 429 without calling the downstream handler after the bucket limit', async () => {
    const store = { increment: vi.fn().mockResolvedValue(6) };
    const middleware = new RateLimitMiddleware(store as never);
    const response = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();

    await middleware.use({
      method: 'POST',
      originalUrl: '/api/v1/auth/otp/request',
      headers: {},
      socket: { remoteAddress: '10.0.0.9' },
    }, response, next);

    expect(response.statusCode).toBe(429);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', 300);
    expect(response.end).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });

  it('fails secure for authentication endpoints when the limiter store is unavailable', async () => {
    const store = { increment: vi.fn().mockRejectedValue(new Error('redis unavailable')) };
    const middleware = new RateLimitMiddleware(store as never);
    vi.spyOn((middleware as unknown as { logger: { warn: (message: string) => void } }).logger, 'warn').mockImplementation(() => undefined);
    const response = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();

    await middleware.use({
      method: 'POST',
      originalUrl: '/api/v1/auth/otp/verify',
      headers: {},
      socket: { remoteAddress: '10.0.0.9' },
    }, response, next);

    expect(response.statusCode).toBe(503);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', 30);
    expect(response.end).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });

  it('fails open if the limiter store is temporarily unavailable', async () => {
    const store = { increment: vi.fn().mockRejectedValue(new Error('redis unavailable')) };
    const middleware = new RateLimitMiddleware(store as never);
    vi.spyOn((middleware as unknown as { logger: { warn: (message: string) => void } }).logger, 'warn').mockImplementation(() => undefined);
    const response = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();

    await middleware.use({
      method: 'GET',
      originalUrl: '/api/v1/notices',
      headers: {},
      socket: { remoteAddress: '10.0.0.9' },
    }, response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(response.end).not.toHaveBeenCalled();
  });
});
