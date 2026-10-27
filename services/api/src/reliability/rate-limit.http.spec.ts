import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ExpressAdapter } from '@nestjs/platform-express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimitMiddleware } from './rate-limit.middleware';

describe('rate limits through the deployed Express routing adapter', () => {
  let server: Server | undefined;
  afterEach(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
      server = undefined;
    }
  });

  async function start(increment: () => Promise<number>) {
    const adapter = new ExpressAdapter();
    const middleware = new RateLimitMiddleware({ increment } as never);
    adapter.use(middleware.use.bind(middleware));
    const handler = vi.fn((_request: unknown, response: unknown) => adapter.reply(response, { ok: true }, 200));
    for (const path of ['otp/request', 'otp/verify', 'partner/otp/verify', 'partner/host/otp/verify', 'refresh']) {
      adapter.post(`/api/v1/auth/${path}`, handler);
    }
    server = createServer(adapter.getInstance());
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, handler };
  }

  it('routes lowercase, mixed-case and trailing-slash aliases into one OTP quota', async () => {
    const increment = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3).mockResolvedValueOnce(11);
    const { origin, handler } = await start(increment);
    const paths = ['/api/v1/auth/otp/verify', '/API/V1/AUTH/OTP/VERIFY/',
      '/api/v1/auth/partner/otp/verify/', '/API/V1/AUTH/PARTNER/HOST/OTP/VERIFY/?retry=1'];
    const statuses: number[] = [];
    for (const path of paths) {
      const response = await fetch(origin + path, { method: 'POST' });
      statuses.push(response.status);
      await response.text();
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(handler).toHaveBeenCalledTimes(3);
    expect(new Set(increment.mock.calls.map(call => call[0])).size).toBe(1);
  });

  it('rejects valid authentication route aliases when rate state is unavailable', async () => {
    const increment = vi.fn().mockRejectedValue(new Error('test state unavailable'));
    const { origin, handler } = await start(increment);
    for (const path of ['/API/V1/AUTH/OTP/REQUEST/', '/api/v1/auth/partner/otp/verify/',
      '/API/V1/AUTH/PARTNER/HOST/OTP/VERIFY', '/API/V1/AUTH/REFRESH/']) {
      const response = await fetch(origin + path, { method: 'POST' });
      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBe('30');
      await response.text();
    }
    expect(handler).not.toHaveBeenCalled();
  });
});
