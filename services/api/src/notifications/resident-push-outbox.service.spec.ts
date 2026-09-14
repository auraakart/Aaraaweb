import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import type { ReliableResidentPushService } from './reliable-resident-push.service';
import { ResidentPushOutboxService } from './resident-push-outbox.service';

const event = {
  type: 'PARCEL_RECEIVED' as const,
  societyId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  unitId: '33333333-3333-3333-3333-333333333333',
  parcelId: '44444444-4444-4444-4444-444444444444',
  title: 'Parcel received',
  body: 'A parcel is waiting.',
  createdAt: new Date().toISOString(),
};

describe('ResidentPushOutboxService', () => {
  it('enqueues resident push events with an idempotent society-scoped dedupe key', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ id: 'outbox-1' }]) };
    const push = {} as ReliableResidentPushService;
    const service = new ResidentPushOutboxService(prisma as unknown as PrismaService, push);

    await expect(service.enqueue(event)).resolves.toEqual({ queued: true, duplicate: false });
    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('ON CONFLICT ("societyId","dedupeKey") DO NOTHING');
    expect(query.values).toContain(`PARCEL_RECEIVED:${event.parcelId}:${event.userId}`);
  });

  it('retries only registrations that failed transiently instead of resending to successful devices', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{
        id: '55555555-5555-5555-5555-555555555555',
        societyId: event.societyId,
        userId: event.userId,
        payload: event,
        targetRegistrationIds: null,
        attempts: 1,
        maxAttempts: 5,
      }]),
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const push = {
      sendResidentOutboxEvent: vi.fn().mockResolvedValue({ sent: 1, retryRegistrationIds: ['reg-transient'] }),
    };
    const service = new ResidentPushOutboxService(
      prisma as unknown as PrismaService,
      push as unknown as ReliableResidentPushService,
    );

    await expect(service.drainOnce(1)).resolves.toEqual({ claimed: 1, skipped: false });
    expect(push.sendResidentOutboxEvent).toHaveBeenCalledWith(event, undefined);
    const retryQuery = prisma.$executeRaw.mock.calls[1][0] as { strings: readonly string[]; values: unknown[] };
    expect(retryQuery.strings.join(' ')).toContain('"status"=\'PENDING\'');
    expect(retryQuery.values).toContain(JSON.stringify(['reg-transient']));
  });

  it('claims work with SKIP LOCKED for safe multi-replica processing', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      $executeRaw: vi.fn().mockResolvedValue(0),
    };
    const service = new ResidentPushOutboxService(
      prisma as unknown as PrismaService,
      {} as ReliableResidentPushService,
    );

    await service.drainOnce(10);
    const claimQuery = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    expect(claimQuery.strings.join(' ')).toContain('FOR UPDATE SKIP LOCKED');
  });
});
