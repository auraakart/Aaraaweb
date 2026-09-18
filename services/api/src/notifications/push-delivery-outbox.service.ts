import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PushDeliveryTarget = 'RESIDENT' | 'CONSUMER';
export type PushDeliveryStatus = 'PENDING' | 'IN_FLIGHT' | 'DISPATCHED' | 'FAILED';

export type PushOutboxEnvelope = {
  id: string;
  targetScope: PushDeliveryTarget;
  societyId: string | null;
  userId: string;
  eventType: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  status: PushDeliveryStatus;
  attemptCount: number;
};

const PUSH_BATCH_SIZE = 100;
const PUSH_MAX_ATTEMPTS = 8;
const PUSH_STALE_MINUTES = 10;

export function pushDeliveryRetryDelayMinutes(attemptCount: number) {
  return Math.min(60, Math.max(1, 2 ** Math.max(0, attemptCount - 1)));
}

@Injectable()
export class PushDeliveryOutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: {
    targetScope: PushDeliveryTarget;
    societyId?: string | null;
    userId: string;
    eventType: string;
    dedupeKey: string;
    payload: Record<string, unknown>;
  }) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string; status: PushDeliveryStatus }>>(Prisma.sql`
      INSERT INTO "PushDeliveryOutbox" (
        "targetScope","societyId","userId","eventType","dedupeKey","payload"
      ) VALUES (
        ${input.targetScope},
        ${input.societyId ?? null}::uuid,
        ${input.userId}::uuid,
        ${input.eventType.trim()},
        ${input.dedupeKey.trim()},
        CAST(${JSON.stringify(input.payload)} AS jsonb)
      )
      ON CONFLICT ("targetScope","dedupeKey") DO UPDATE
      SET "updatedAt"=CURRENT_TIMESTAMP
      RETURNING "id","status"
    `);
    return rows[0];
  }

  async attempt(
    id: string,
    deliver: (work: PushOutboxEnvelope) => Promise<void>,
  ) {
    const work = await this.claimOne(id);
    if (!work) return { dispatched: 0, deferred: 0, failed: 0, skipped: 1 };
    return this.deliver(work, deliver);
  }

  async drainDue(
    deliver: (work: PushOutboxEnvelope) => Promise<void>,
  ) {
    const work = await this.claimDue();
    let dispatched = 0;
    let deferred = 0;
    let failed = 0;
    for (const item of work) {
      const result = await this.deliver(item, deliver);
      dispatched += result.dispatched;
      deferred += result.deferred;
      failed += result.failed;
    }
    return { dispatched, deferred, failed, claimed: work.length };
  }

  private async claimOne(id: string) {
    const rows = await this.prisma.$queryRaw<PushOutboxEnvelope[]>(Prisma.sql`
      UPDATE "PushDeliveryOutbox"
      SET "status"='IN_FLIGHT',
          "attemptCount"="attemptCount"+1,
          "lastAttemptAt"=CURRENT_TIMESTAMP,
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid
        AND "attemptCount" < ${PUSH_MAX_ATTEMPTS}
        AND (
          ("status"='PENDING' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= CURRENT_TIMESTAMP))
          OR
          ("status"='IN_FLIGHT' AND "lastAttemptAt" <= CURRENT_TIMESTAMP - make_interval(mins => ${PUSH_STALE_MINUTES}))
        )
      RETURNING "id","targetScope","societyId","userId","eventType","dedupeKey","payload","status","attemptCount"
    `);
    return rows[0];
  }

  private claimDue() {
    return this.prisma.$transaction(async (tx) => tx.$queryRaw<PushOutboxEnvelope[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "PushDeliveryOutbox"
        WHERE "attemptCount" < ${PUSH_MAX_ATTEMPTS}
          AND (
            ("status"='PENDING' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= CURRENT_TIMESTAMP))
            OR
            ("status"='IN_FLIGHT' AND "lastAttemptAt" <= CURRENT_TIMESTAMP - make_interval(mins => ${PUSH_STALE_MINUTES}))
          )
        ORDER BY COALESCE("nextAttemptAt","createdAt"),"createdAt"
        LIMIT ${PUSH_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "PushDeliveryOutbox" p
      SET "status"='IN_FLIGHT',
          "attemptCount"=p."attemptCount"+1,
          "lastAttemptAt"=CURRENT_TIMESTAMP,
          "updatedAt"=CURRENT_TIMESTAMP
      FROM candidates c
      WHERE p."id"=c."id"
      RETURNING p."id",p."targetScope",p."societyId",p."userId",p."eventType",p."dedupeKey",p."payload",p."status",p."attemptCount"
    `));
  }

  private async deliver(
    work: PushOutboxEnvelope,
    deliver: (work: PushOutboxEnvelope) => Promise<void>,
  ) {
    try {
      await deliver(work);
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "PushDeliveryOutbox"
        SET "status"='DISPATCHED',"dispatchedAt"=CURRENT_TIMESTAMP,
            "nextAttemptAt"=NULL,"lastError"=NULL,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${work.id}::uuid AND "status"='IN_FLIGHT'
      `);
      return { dispatched: 1, deferred: 0, failed: 0, skipped: 0 };
    } catch (error) {
      const exhausted = work.attemptCount >= PUSH_MAX_ATTEMPTS;
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown push delivery error';
      const retryDelay = pushDeliveryRetryDelayMinutes(work.attemptCount);
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "PushDeliveryOutbox"
        SET "status"=${exhausted ? 'FAILED' : 'PENDING'},
            "nextAttemptAt"=${exhausted ? null : new Date(Date.now() + retryDelay * 60_000)},
            "lastError"=${message},
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${work.id}::uuid AND "status"='IN_FLIGHT'
      `);
      return { dispatched: 0, deferred: exhausted ? 0 : 1, failed: exhausted ? 1 : 0, skipped: 0 };
    }
  }
}
