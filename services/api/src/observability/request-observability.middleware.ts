import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function resolveRequestId(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate && REQUEST_ID_PATTERN.test(candidate)) return candidate;
  return randomUUID();
}

function routePath(request: Request) {
  return (request.originalUrl || request.url || '/').split('?')[0] || '/';
}

@Injectable()
export class RequestObservabilityMiddleware implements NestMiddleware {
  private readonly logger = new Logger('RequestObservability');

  use(request: Request, response: Response, next: NextFunction) {
    const requestId = resolveRequestId(request.headers['x-request-id']);
    const startedAt = process.hrtime.bigint();

    request.headers['x-request-id'] = requestId;
    response.setHeader('X-Request-Id', requestId);

    response.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.logger.log(JSON.stringify({
        event: 'http_request',
        service: 'aaraagate-api',
        environment: process.env.NODE_ENV ?? 'development',
        version: process.env.APP_VERSION ?? 'dev',
        commit: process.env.GIT_SHA ?? 'unknown',
        requestId,
        method: request.method,
        path: routePath(request),
        statusCode: response.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      }));
    });

    next();
  }
}
