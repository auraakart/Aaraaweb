import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

function controller(query = vi.fn().mockResolvedValue([{ '?column?': 1 }])) {
  const prisma = {
    $queryRawUnsafe: query,
  };
  return {
    controller: new HealthController(prisma as unknown as ConstructorParameters<typeof HealthController>[0]),
    query,
  };
}

describe('HealthController', () => {
  it('reports liveness without checking external dependencies', () => {
    const { controller: health, query } = controller();

    expect(health.live()).toEqual(expect.objectContaining({ status: 'ok', service: 'aaraagate-api' }));
    expect(query).not.toHaveBeenCalled();
  });

  it('reports readiness only after the database responds', async () => {
    const { controller: health, query } = controller();

    await expect(health.ready()).resolves.toEqual(expect.objectContaining({
      status: 'ready',
      dependencies: { database: 'ok' },
    }));
    expect(query).toHaveBeenCalledWith('SELECT 1');
  });

  it('fails readiness closed without exposing database errors', async () => {
    const query = vi.fn().mockRejectedValue(new Error('secret database connection details'));
    const { controller: health } = controller(query);

    await expect(health.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await health.ready().catch((error: ServiceUnavailableException) => {
      expect(error.getResponse()).toEqual(expect.objectContaining({
        status: 'not-ready',
        dependencies: { database: 'unavailable' },
      }));
      expect(JSON.stringify(error.getResponse())).not.toContain('secret database connection details');
    });
  });
});
