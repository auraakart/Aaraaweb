import { BadRequestException, Injectable } from '@nestjs/common';
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

type PushEnqueueInput = {
  targetScope: PushDeliveryTarget;
  societyId?: string | null;
  userId: string;
  eventType: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
};

const PUSH_BATCH_SIZE = 100;
const PUSH_MAX_ATTEMPTS = 8;
const PUSH_STALE_MINUTES = 10;

export function pushDeliveryRetryDelayMinutes(attemptCount: number) {
  return Math.min(60, Math.max(1, 2 ** Math.max(0, attemptCount - 1)));
}

// A final crashed attempt cannot be reclaimed without exceeding the retry cap.
// Record its unknown transport outcome instead of leaving it IN_FLIGHT forever.
function expireExhaustedPushSql(id?: string) {
  return Prisma.sql`
    UPDATE "PushDeliveryOutbox"
    SET "status"='FAILED',"nextAttemptAt"=NULL,
        "lastError"='Final push delivery lease expired; transport outcome unknown',
        "updatedAt"=CURRENT_TIMESTAMP
    WHERE "status"='IN_FLIGHT' AND "attemptCount" >= ${PUSH_MAX_ATTEMPTS}
      AND "lastAttemptAt" <= CURRENT_TIMESTAMP - make_interval(mins => ${PUSH_STALE_MINUTES}::int)
      ${id ?  async enqueue(input: PushEnqueueInput, client?: Pick<Prisma.TransactionClient, '$queryRaw'>) {
    if (input.targetScope === 'RESIDENT') {
      if (!input.societyId?.trim()) throw new BadRequestException('Resident push work requires a society');
    } else if (input.targetScope === 'CONSUMER') {
      if (input.societyId != null) throw new BadRequestException('Consumer push work must have no society');
    } else {
      throw new BadRequestException('Unsupported push delivery target');
    }
    if (client) return this.enqueueOnClient(input, client);
    if (input.targetScope === 'RESIDENT') {
      return this.prisma.withTenantContext(input.societyId!, tx => this.enqueueOnClient(input, tx));
    }
    return this.enqueueOnClient(input, this.prisma);
  }

  private async enqueueOnClient(input: PushEnqueueInput, client: Pick<Prisma.TransactionClient, '$queryRaw'>) {
    const rows = await client.$queryRaw<Array<{ id: string; status: PushDeliveryStatus }>>(Prisma.sql`
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
put.payload)} AS jsonb)
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
      WITH expired AS (${expireExhaustedPushSql(id)})
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
          ("status"='IN_FLIGHT' AND "lastAttemptAt" <= CURRENT_TIMESTAMP - make_interval(mins => ${PUSH_STALE_MINUTES}::int))
        )
      RETURNING "id","targetScope","societyId","userId","eventType","dedupeKey","payload","status","attemptCount"
    `);
    return rows[0];
  }

  private claimDue() {
    return this.prisma.$transaction(async (tx) => tx.$queryRaw<PushOutboxEnvelope[]>(Prisma.sql`
      WITH expired AS (${expireExhaustedPushSql()}), candidates AS (
        SELECT "id"
        FROM "PushDeliveryOutbox"
        WHERE "attemptCount" < ${PUSH_MAX_ATTEMPTS}
          AND (
            ("status"='PENDING' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= CURRENT_TIMESTAMP))
            OR
            ("status"='IN_FLIGHT' AND "lastAttemptAt" <= CURRENT_TIMESTAMP - make_interval(mins => ${PUSH_STALE_MINUTES}::int))
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
      const updated = await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "PushDeliveryOutbox"
        SET "status"='DISPATCHED',"dispatchedAt"=CURRENT_TIMESTAMP,
            "nextAttemptAt"=NULL,"lastError"=NULL,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${work.id}::uuid AND "status"='IN_FLIGHT'
          AND "attemptCount"=${work.attemptCount}
      `);
      if (updated === 0) return { dispatched: 0, deferred: 0, failed: 0, skipped: 1 };
      return { dispatched: 1, deferred: 0, failed: 0, skipped: 0 };
    } catch (error) {
      const exhausted = work.attemptCount >= PUSH_MAX_ATTEMPTS;
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown push delivery error';
      const retryDelay = pushDeliveryRetryDelayMinutes(work.attemptCount);
      const updated = await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "PushDeliveryOutbox"
        SET "status"=${exhausted ? 'FAILED' : 'PENDING'},
            "nextAttemptAt"=${exhausted ? null : new Date(Date.now() + retryDelay * 60_000)},
            "lastError"=${message},
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${work.id}::uuid AND "status"='IN_FLIGHT'
          AND "attemptCount"=${work.attemptCount}
      `);
      if (updated === 0) return { dispatched: 0, deferred: 0, failed: 0, skipped: 1 };
      return { dispatched: 0, deferred: exhausted ? 0 : 1, failed: exhausted ? 1 : 0, skipped: 0 };
    }
  }
}
