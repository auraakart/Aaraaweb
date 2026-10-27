import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { PrismaService, TENANT_CONTEXT_SETTING } from './prisma.service';

describe('PrismaService tenant context readiness', () => {
  it('retains transaction isolation and timeout options while setting local context', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = Object.create(PrismaService.prototype) as PrismaService;
    const transaction = vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx));
    Object.assign(service, { $transaction: transaction });
    const options = { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 };
    await service.withTenantContext('11111111-1111-4111-8111-111111111111', async client => client, options);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), options);
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
  });

  it('does not execute domain work when establishing tenant context fails', async () => {
    const tx = { $queryRaw: vi.fn().mockRejectedValue(new Error('context unavailable')) };
    const service = Object.create(PrismaService.prototype) as PrismaService;
    Object.assign(service, { $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) });
    const operation = vi.fn();
    await expect(service.withTenantContext('11111111-1111-4111-8111-111111111111', operation))
      .rejects.toThrow('context unavailable');
    expect(operation).not.toHaveBeenCalled();
  });
  it('sets a transaction-local society context before tenant work', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ set_config: '11111111-1111-4111-8111-111111111111' }]);
    const tx = { $queryRaw: queryRaw };
    const service = Object.create(PrismaService.prototype) as PrismaService;
    (service as unknown as { $transaction: (callback: (client: unknown) => Promise<unknown>) => Promise<unknown> }).$transaction =
      vi.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(tx));

    const operation = vi.fn().mockResolvedValue('ok');
    await expect(service.withTenantContext(
      '11111111-1111-4111-8111-111111111111',
      operation as never,
    )).resolves.toBe('ok');

    expect(operation).toHaveBeenCalledWith(tx);
    expect(queryRaw).toHaveBeenCalledOnce();
    const sql = queryRaw.mock.calls[0][0] as { strings?: readonly string[]; values?: readonly unknown[] };
    expect((sql.strings ?? []).join('?')).toContain('SELECT set_config');
    expect((sql.values ?? [])).toEqual([
      TENANT_CONTEXT_SETTING,
      '11111111-1111-4111-8111-111111111111',
    ]);
    expect((sql.strings ?? []).join('?')).toContain('true');
  });

  it('rejects malformed society context before opening a transaction', async () => {
    const service = Object.create(PrismaService.prototype) as PrismaService;
    const transaction = vi.fn();
    (service as unknown as { $transaction: typeof transaction }).$transaction = transaction;

    await expect(service.withTenantContext('not-a-society-id', vi.fn() as never))
      .rejects.toThrow('A valid society UUID is required');
    expect(transaction).not.toHaveBeenCalled();
  });
});
