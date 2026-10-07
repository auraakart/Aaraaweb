import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PushDeliveryOutboxService } from './push-delivery-outbox.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

withDatabase('Push delivery lease ownership on migrated PostgreSQL', () => {
  const prisma = new PrismaService();
  const societyId = randomUUID();
  const userId = randomUUID();
  const outbox = new PushDeliveryOutboxService(prisma);

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.user.create({ data: { id: userId, phone: `push-lease-${userId}` } });
    await prisma.society.create({ data: { id: societyId, name: 'Lease fixture', code: `lease-${societyId}` } });
  });

  afterAll(async () => {
    try {
      await prisma.society.delete({ where: { id: societyId } });
      await prisma.user.delete({ where: { id: userId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  function enqueue() {
    return outbox.enqueue({
      targetScope: 'RESIDENT', societyId, userId, eventType: 'PARCEL_RECEIVED',
      dedupeKey: `lease-${randomUUID()}`, payload: { societyId, userId, type: 'PARCEL_RECEIVED' },
    });
  }

  async function row(id: string) {
    const rows = await prisma.$queryRaw<Array<{ status: string; attemptCount: number; lastError: string | null; nextAttemptAt: Date | null }>>(Prisma.sql`
      SELECT "status","attemptCount","lastError","nextAttemptAt" FROM "PushDeliveryOutbox"
      WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid
    `);
    return rows[0];
  }

  it.each(['success', 'failure'])('prevents stale transport %s from completing a newer claim', async outcome => {
    const queued = await enqueue();
    const firstStarted = barrier();
    const secondStarted = barrier();
    const finishFirst = barrier();
    const finishSecond = barrier();
    let second: ReturnType<typeof outbox.attempt> | undefined;
    const first = outbox.attempt(queued.id, async work => {
      firstStarted.release();
      expect(work.attemptCount).toBe(1);
      await finishFirst.promise;
      if (outcome === 'failure') throw new Error('stale provider failure');
    });
    try {
      await firstStarted.promise;
      await prisma.$executeRaw(Prisma.sql`
        UPDATE "PushDeliveryOutbox" SET "lastAttemptAt"=CURRENT_TIMESTAMP-INTERVAL '11 minutes'
        WHERE "id"=${queued.id}::uuid AND "societyId"=${societyId}::uuid
      `);
      second = outbox.attempt(queued.id, async work => {
        secondStarted.release();
        expect(work.attemptCount).toBe(2);
        await finishSecond.promise;
      });
      await secondStarted.promise;
      finishFirst.release();
      await expect(first).resolves.toEqual({ dispatched: 0, deferred: 0, failed: 0, skipped: 1 });
      expect(await row(queued.id)).toMatchObject({ status: 'IN_FLIGHT', attemptCount: 2, lastError: null, nextAttemptAt: null });
      finishSecond.release();
      await expect(second).resolves.toEqual({ dispatched: 1, deferred: 0, failed: 0, skipped: 0 });
      expect(await row(queued.id)).toMatchObject({ status: 'DISPATCHED', attemptCount: 2, lastError: null });
    } finally {
      finishFirst.release();
      finishSecond.release();
      await Promise.allSettled([first, ...(second ? [second] : [])]);
    }
  }, 20_000);

  it('moves a stale final-attempt crash to failed without issuing another delivery', async () => {
    const queued = await enqueue();
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "PushDeliveryOutbox" SET "status"='IN_FLIGHT',"attemptCount"=8,
        "lastAttemptAt"=CURRENT_TIMESTAMP-INTERVAL '11 minutes'
      WHERE "id"=${queued.id}::uuid AND "societyId"=${societyId}::uuid
    `);
    const deliver = vi.fn();
    await expect(outbox.attempt(queued.id, deliver)).resolves.toMatchObject({ skipped: 1 });
    expect(deliver).not.toHaveBeenCalled();
    expect(await row(queued.id)).toMatchObject({ status: 'FAILED', attemptCount: 8, nextAttemptAt: null,
      lastError: 'Final push delivery lease expired; transport outcome unknown' });
  });

  it('retains a live final attempt and does not expire unrelated work during a direct claim', async () => {
    const queued = await enqueue();
    const untouched = await enqueue();
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "PushDeliveryOutbox" SET "status"='IN_FLIGHT',"attemptCount"=8,
        "lastAttemptAt"=CASE WHEN "id"=${queued.id}::uuid THEN CURRENT_TIMESTAMP ELSE CURRENT_TIMESTAMP-INTERVAL '11 minutes' END
      WHERE "id" IN (${queued.id}::uuid,${untouched.id}::uuid) AND "societyId"=${societyId}::uuid
    `);
    const deliver = vi.fn();
    await outbox.attempt(queued.id, deliver);
    expect(deliver).not.toHaveBeenCalled();
    expect(await row(queued.id)).toMatchObject({ status: 'IN_FLIGHT', attemptCount: 8, lastError: null });
    expect(await row(untouched.id)).toMatchObject({ status: 'IN_FLIGHT', attemptCount: 8, lastError: null });
  });
});
