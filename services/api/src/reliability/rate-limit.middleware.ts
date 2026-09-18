import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthStateStore } from '../auth/auth-state.store';
import { ReliabilityMetricsService } from '../observability/reliability-metrics.service';

type HeaderValue = string | string[] | undefined;

type RateLimitRequest = {
  method: string;
  originalUrl?: string;
  url?: string;
  headers: Record<string, HeaderValue>;
  socket?: { remoteAddress?: string | null };
};

type RateLimitResponse = {
  statusCode: number;
  setHeader(name: string, value: string | number): unknown;
  end(body?: string): unknown;
};

type Next = () => void;

export type RateLimitPolicy = {
  name: 'otp-request' | 'otp-verify' | 'auth-refresh' | 'payment-webhook' | 'api';
  limit: number;
  windowSeconds: number;
};

function pathOf(request: RateLimitRequest) {
  return (request.originalUrl || request.url || '/').split('?')[0] || '/';
}

export function resolveRateLimitPolicy(method: string, path: string): RateLimitPolicy | null {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === 'OPTIONS') return null;
  if (path === '/api/v1/health' || path.startsWith('/api/v1/health/')) return null;
  if (normalizedMethod === 'POST' && path === '/api/v1/auth/otp/request') {
    return { name: 'otp-request', limit: 5, windowSeconds: 300 };
  }
  if (normalizedMethod === 'POST' && path === '/api/v1/auth/otp/verify') {
    return { name: 'otp-verify', limit: 10, windowSeconds: 300 };
  }
  if (normalizedMethod === 'POST' && path === '/api/v1/auth/refresh') {
    return { name: 'auth-refresh', limit: 30, windowSeconds: 60 };
  }
  if (normalizedMethod === 'POST' && path.startsWith('/api/v1/billing/payment-webhooks/')) {
    return { name: 'payment-webhook', limit: 600, windowSeconds: 60 };
  }
  if (path.startsWith('/api/v1/')) {
    return { name: 'api', limit: 300, windowSeconds: 60 };
  }
  return null;
}

function firstHeader(value: HeaderValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveRateLimitClient(request: RateLimitRequest, trustProxyHeaders = ['1', 'true', 'yes'].includes((process.env.TRUST_PROXY_HEADERS ?? '').trim().toLowerCase())) {
  if (trustProxyHeaders) {
    const forwarded = firstHeader(request.headers['x-forwarded-for'])?.split(',')[0]?.trim();
    if (forwarded && forwarded.length <= 128) return forwarded;
    const real = firstHeader(request.headers['x-real-ip'])?.trim();
    if (real && real.length <= 128) return real;
  }
  return request.socket?.remoteAddress?.trim() || 'unknown';
}

function clientHash(client: string) {
  return createHash('sha256').update(client).digest('hex').slice(0, 32);
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);

  constructor(private readonly authState: AuthStateStore, private readonly metrics?: ReliabilityMetricsService) {}

  async use(request: RateLimitRequest, response: RateLimitResponse, next: Next) {
    const policy = resolveRateLimitPolicy(request.method, pathOf(request));
    if (!policy) {
      next();
      return;
    }

    const client = resolveRateLimitClient(request);
    const key = `rate-limit:${policy.name}:${clientHash(client)}`;

    try {
      const count = await this.authState.increment(key, policy.windowSeconds);
      const remaining = Math.max(0, policy.limit - count);
      response.setHeader('RateLimit-Limit', policy.limit);
      response.setHeader('RateLimit-Remaining', remaining);
      response.setHeader('RateLimit-Reset', policy.windowSeconds);

      if (count > policy.limit) {
        this.metrics?.recordRateLimited(policy.name);
        response.statusCode = 429;
        response.setHeader('Retry-After', policy.windowSeconds);
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({
          statusCode: 429,
          message: 'Too many requests. Retry after the indicated interval.',
        }));
        return;
      }

      next();
    } catch (error) {
      this.metrics?.recordLimiterDegradation();
      this.logger.warn(`Rate limiter degraded for policy ${policy.name}: ${error instanceof Error ? error.message : 'unknown error'}`);
      next();
    }
  }
}
