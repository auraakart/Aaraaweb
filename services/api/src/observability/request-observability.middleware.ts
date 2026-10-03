import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { normalizeTelemetryRoute, TelemetryService } from './telemetry.service';

type HeaderValue = string | string[] | undefined;

type ObservableRequest = {
  method: string;
  originalUrl?: string;
  url?: string;
  headers: Record<string, HeaderValue>;
};

type ObservableResponse = {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  once(event: 'finish', handler: () => void): unknown;
};

type Next = () => void;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function resolveRequestId(value: HeaderValue) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate && REQUEST_ID_PATTERN.test(candidate)) return candidate;
  return randomUUID();
}

function routePath(request: ObservableRequest) {
  return normalizeTelemetryRoute(request.originalUrl || request.url || '/');
}

@Injectable()
export class RequestObservabilityMiddleware implements NestMiddleware {
  private readonly logger = new Logger('RequestObservability');

  constructor(private readonly telemetry: TelemetryService = new TelemetryService()) {}

  use(request: ObservableRequest, response: ObservableResponse, next: Next) {
    const requestId = resolveRequestId(request.headers['x-request-id']);
    const startedAt = process.hrtime.bigint();

    request.headers['x-request-id'] = requestId;
    response.setHeader('X-Request-Id', requestId);

    response.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const path = routePath(request);
      const method = request.method.toUpperCase().slice(0, 16);
      const statusClass = `${Math.max(0, Math.floor(response.statusCode / 100))}xx`;
      this.telemetry.increment('http_requests_total', { method, route: path, statusClass });
      this.telemetry.observe('http_request_duration_ms', durationMs, { method, route: path, statusClass });
      this.logger.log(JSON.stringify({
        event: 'http_request',
        service: 'aaraagate-api',
        environment: process.env.NODE_ENV ?? 'development',
        version: process.env.APP_VERSION ?? 'dev',
        commit: process.env.GIT_SHA ?? 'unknown',
        requestId,
        method,
        path,
        statusCode: response.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      }));
    });

    next();
  }
}
