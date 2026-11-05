import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PushDeliveryOutboxService } from './push-delivery-outbox.service';

const societyA = '11111111-1111-4111-8111-111111111111';
const societyB = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';

function harness() {
  const scopedSql = vi.fn(async (sql: unknown) => {
    void sql;
    return [{ id: 'resident-1', status: 'PENDING' }];
  });
  const rootSql = vi.fn(async (sql: unknown) => {
    void sql;
    return [{ id: 'consumer-1', status: 'PENDING' }];
  });
  const withTenantContext = vi.fn(async (
    societyId: string,
    operation: (client: { $queryRaw: typeof scopedSql }) => Promise<unknown>,
  ) => {
    void societyId;
    return operation({ $queryRaw: scopedSql });
  });
  return { scopedSql, rootSql, withTenantContext, prisma: { $queryRaw: rootSql, withTenantContext } };
}

function resident(societyId: string) {
  return {
    targetScope: 'RESIDENT' as const, societyId, userId,
    eventType: 'PARCEL_RECEIVED',
    dedupeKey: 'parcel:' + societyId + ':user:' + userId,
    payload: { type: 'PARCEL_RECEIVED', societyId, userId },
  };
}

function consumer() {
  return {
    targetScope: 'CONSUMER' as const, societyId: null, userId,
    eventType: 'CONSUMER_SERVICE_BOOKING_STATUS',
    dedupeKey: 'booking:1:user:' + userId,
    payload: { userId },
  };
}

describe('V5.14.16 mixed-scope outbox enqueue tenant isolation', () => {
  it('executes sequential resident enqueues only in their selected society contexts', async () => {
    const { scopedSql, rootSql, withTenantContext, prisma } = harness();
    const service = new PushDeliveryOutboxService(prisma as never);
    await expect(service.enqueue(resident(societyA))).resolves.toMatchObject({ id: 'resident-1' });
    await expect(service.enqueue(resident(societyB))).resolves.toMatchObject({ id: 'resident-1' });
    expect(withTenantContext.mock.calls.map(([id]) => id)).toEqual([societyA, societyB]);
    expect(scopedSql).toHaveBeenCalledTimes(2);
    expect(scopedSql.mock.calls.map(([sql]) => (sql as { values: unknown[] }).values[1]))
      .toEqual([societyA, societyB]);
    expect(rootSql).not.toHaveBeenCalled();
  });

  it('preserves global consumer enqueue without opening a society transaction', async () => {
    const { rootSql, scopedSql, withTenantContext, prisma } = harness();
    const service = new PushDeliveryOutboxService(prisma as never);
    await expect(service.enqueue(consumer())).resolves.toMatchObject({ id: 'consumer-1' });
    expect(rootSql).toHaveBeenCalledOnce();
    expect((rootSql.mock.calls[0][0] as { values: unknown[] }).values[1]).toBeNull();
    expect(scopedSql).not.toHaveBeenCalled();
    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it('preserves an existing caller-supplied resident transaction with no nested scope', async () => {
    const { rootSql, withTenantContext, prisma } = harness();
    const transactionalSql = vi.fn(async (sql: unknown) => {
      void sql;
      return [{ id: 'transaction-1', status: 'PENDING' }];
    });
    const service = new PushDeliveryOutboxService(prisma as never);
    await expect(service.enqueue(resident(societyA), { $queryRaw: transactionalSql } as never))
      .resolves.toMatchObject({ id: 'transaction-1' });
    expect(transactionalSql).toHaveBeenCalledOnce();
    expect(rootSql).not.toHaveBeenCalled();
    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it('rejects resident work without society metadata before any SQL', async () => {
    const { rootSql, scopedSql, withTenantContext, prisma } = harness();
    const service = new PushDeliveryOutboxService(prisma as never);
    await expect(service.enqueue({ ...resident(societyA), societyId: null }))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.enqueue({ ...resident(societyA), societyId: '' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(rootSql).not.toHaveBeenCalled();
    expect(scopedSql).not.toHaveBeenCalled();
    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it('rejects consumer work with a non-null society before any SQL', async () => {
    const { rootSql, scopedSql, withTenantContext, prisma } = harness();
    const service = new PushDeliveryOutboxService(prisma as never);
    await expect(service.enqueue({ ...consumer(), societyId: societyB }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(rootSql).not.toHaveBeenCalled();
    expect(scopedSql).not.toHaveBeenCalled();
    expect(withTenantContext).not.toHaveBeenCalled();
  });

  it('rejects unknown target scopes before creating a database record', async () => {
    const { rootSql, scopedSql, withTenantContext, prisma } = harness();
    const service = new PushDeliveryOutboxService(prisma as never);
    await expect(service.enqueue({ ...consumer(), targetScope: 'OTHER' } as never))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(rootSql).not.toHaveBeenCalled();
    expect(scopedSql).not.toHaveBeenCalled();
    expect(withTenantContext).not.toHaveBeenCalled();
  });
});
