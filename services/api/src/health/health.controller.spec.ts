import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

function controller(
  query = vi.fn().mockResolvedValue([{ '?column?': 1 }]),
  ping = vi.fn().mockResolvedValue('redis'),
) {
  const prisma = { $queryRawUnsafe: query };
  const authState = { ping };
  return {
    controller: new HealthController(
      prisma as unknown as ConstructorParameters<typeof HealthController>[0],
      authState as unknown as ConstructorParameters<typeof HealthController>[1],
    ),
    query,
    ping,
  };
}

describe('HealthController', () => {
  it('reports liveness without checking external dependencies', () => {
    const { controller: health, query, ping } = controller();
    expect(health.live()).toEqual(expect.objectContaining({ status: 'ok', service: 'aaraagate-api' }));
    expect(query).not.toHaveBeenCalled();
    expect(ping).not.toHaveBeenCalled();
  });

  it('reports readiness only after database and auth-state respond', async () => {
    const { controller: health, query, ping } = controller();
    await expect(health.ready()).resolves.toEqual(expect.objectContaining({
      status: 'ready',
      dependencies: { database: 'ok', authState: 'redis-ok' },
    }));
    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(ping).toHaveBeenCalled();
  });

  it('reports memory auth state outside production when Redis is not configured', async () => {
    const { controller: health } = controller(undefined, vi.fn().mockResolvedValue('memory'));
    await expect(health.ready()).resolves.toEqual(expect.objectContaining({
      dependencies: { database: 'ok', authState: 'memory-ok' },
    }));
  });

  it('fails readiness closed without exposing dependency errors', async () => {
    const query = vi.fn().mockRejectedValue(new Error('secret database connection details'));
    const { controller: health } = controller(query);
    await expect(health.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await health.ready().catch((error: ServiceUnavailableException) => {
      expect(error.getResponse()).toEqual(expect.objectContaining({
        status: 'not-ready',
        dependencies: { database: 'unavailable', authState: 'redis-ok' },
      }));
      expect(JSON.stringify(error.getResponse())).not.toContain('secret database connection details');
    });
  });

  it('fails readiness when auth state is unavailable even if database is healthy', async () => {
    const { controller: health } = controller(undefined, vi.fn().mockRejectedValue(new Error('redis secret')));
    await health.ready().catch((error: ServiceUnavailableException) => {
      expect(error.getResponse()).toEqual(expect.objectContaining({
        status: 'not-ready',
        dependencies: { database: 'ok', authState: 'unavailable' },
      }));
      expect(JSON.stringify(error.getResponse())).not.toContain('redis secret');
    });
  });
});
