import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { RequestObservabilityMiddleware, resolveRequestId } from './request-observability.middleware';

describe('request observability', () => {
  it('accepts a safe caller-provided request id', () => {
    expect(resolveRequestId('req-123.ABC')).toBe('req-123.ABC');
  });

  it('replaces unsafe request ids', () => {
    const id = resolveRequestId('contains spaces and ?');
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('returns the request id and logs only request metadata on finish', () => {
    const middleware = new RequestObservabilityMiddleware();
    const log = vi.spyOn((middleware as unknown as { logger: { log: (message: string) => void } }).logger, 'log').mockImplementation(() => undefined);
    let finish: (() => void) | undefined;
    const request = {
      method: 'GET',
      originalUrl: '/api/v1/residents/me?token=secret-value',
      headers: { authorization: 'Bearer secret', 'x-request-id': 'client-req-1' },
    } as unknown as Request;
    const response = {
      statusCode: 200,
      setHeader: vi.fn(),
      once: vi.fn((event: string, handler: () => void) => {
        if (event === 'finish') finish = handler;
      }),
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    middleware.use(request, response, next);
    finish?.();

    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', 'client-req-1');
    expect(next).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledOnce();
    const payload = JSON.parse(log.mock.calls[0][0]) as Record<string, unknown>;
    expect(payload).toMatchObject({
      event: 'http_request',
      requestId: 'client-req-1',
      method: 'GET',
      path: '/api/v1/residents/me',
      statusCode: 200,
    });
    expect(JSON.stringify(payload)).not.toContain('secret-value');
    expect(JSON.stringify(payload)).not.toContain('Bearer secret');
  });
});
