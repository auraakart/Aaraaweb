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
});

describe('RateLimitMiddleware', () => {
  it('returns 429 without calling the downstream handler after the bucket limit', async () => {
    const store = { increment: vi.fn().mockResolvedValue(6) };
    const metrics = { recordRateLimited: vi.fn(), recordLimiterDegradation: vi.fn() };
    const middleware = new RateLimitMiddleware(store as never, metrics as never);
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
    expect(metrics.recordRateLimited).toHaveBeenCalledWith('otp-request');
    expect(next).not.toHaveBeenCalled();
  });

  it('fails open if the limiter store is temporarily unavailable', async () => {
    const store = { increment: vi.fn().mockRejectedValue(new Error('redis unavailable')) };
    const metrics = { recordRateLimited: vi.fn(), recordLimiterDegradation: vi.fn() };
    const middleware = new RateLimitMiddleware(store as never, metrics as never);
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
    expect(metrics.recordLimiterDegradation).toHaveBeenCalledOnce();
    expect(response.end).not.toHaveBeenCalled();
  });
});
