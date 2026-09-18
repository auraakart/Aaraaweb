import { describe, expect, it, vi } from 'vitest';
import { PushDeliveryOutboxService, pushDeliveryRetryDelayMinutes } from './push-delivery-outbox.service';

describe('PushDeliveryOutboxService', () => {
  it('uses bounded exponential retry backoff', () => {
    expect(pushDeliveryRetryDelayMinutes(1)).toBe(1);
    expect(pushDeliveryRetryDelayMinutes(2)).toBe(2);
    expect(pushDeliveryRetryDelayMinutes(7)).toBe(60);
    expect(pushDeliveryRetryDelayMinutes(20)).toBe(60);
  });

  it('enqueues with a target-scoped dedupe key', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111', status: 'PENDING' }]);
    const service = new PushDeliveryOutboxService({ $queryRaw: queryRaw } as never);
    await expect(service.enqueue({
      targetScope: 'RESIDENT',
      societyId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      eventType: 'PARCEL_RECEIVED',
      dedupeKey: 'parcel:1:user:3',
      payload: { parcelId: '1' },
    })).resolves.toEqual(expect.objectContaining({ status: 'PENDING' }));
    const sql = (queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain('ON CONFLICT ("targetScope","dedupeKey")');
  });

  it('marks a claimed delivery dispatched after transport success', async () => {
    const work = {
      id: '11111111-1111-4111-8111-111111111111',
      targetScope: 'CONSUMER' as const,
      societyId: null,
      userId: '33333333-3333-4333-8333-333333333333',
      eventType: 'CONSUMER_SERVICE_BOOKING_STATUS',
      dedupeKey: 'booking:1:CONFIRMED:user:3',
      payload: { bookingId: '1' },
      status: 'IN_FLIGHT' as const,
      attemptCount: 1,
    };
    const queryRaw = vi.fn().mockResolvedValue([work]);
    const executeRaw = vi.fn().mockResolvedValue(1);
    const service = new PushDeliveryOutboxService({ $queryRaw: queryRaw, $executeRaw: executeRaw } as never);
    const deliver = vi.fn().mockResolvedValue(undefined);

    await expect(service.attempt(work.id, deliver)).resolves.toMatchObject({ dispatched: 1, deferred: 0 });
    expect(deliver).toHaveBeenCalledWith(work);
    const sql = (executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain("'DISPATCHED'");
  });

  it('returns transient failures to pending retry instead of losing them', async () => {
    const work = {
      id: '11111111-1111-4111-8111-111111111111',
      targetScope: 'RESIDENT' as const,
      societyId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      eventType: 'ACCESS_APPROVAL_REQUESTED',
      dedupeKey: 'access:1:user:3',
      payload: { requestId: '1' },
      status: 'IN_FLIGHT' as const,
      attemptCount: 2,
    };
    const queryRaw = vi.fn().mockResolvedValue([work]);
    const executeRaw = vi.fn().mockResolvedValue(1);
    const service = new PushDeliveryOutboxService({ $queryRaw: queryRaw, $executeRaw: executeRaw } as never);

    await expect(service.attempt(work.id, async () => { throw new Error('fcm unavailable'); }))
      .resolves.toMatchObject({ dispatched: 0, deferred: 1, failed: 0 });
    const sql = (executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain('"nextAttemptAt"');
  });

  it('claims due work with SKIP LOCKED for cluster-safe retries', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const prisma = { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new PushDeliveryOutboxService(prisma as never);

    await expect(service.drainDue(vi.fn())).resolves.toEqual({ dispatched: 0, deferred: 0, failed: 0, claimed: 0 });
    const sql = (tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
  });
});
