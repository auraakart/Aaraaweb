import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ResidentMessageEvent } from './notification-realtime.service';
import { ReliableResidentPushService } from './reliable-resident-push.service';

type OutboxRow = {
  id: string;
  societyId: string;
  userId: string;
  payload: unknown;
  targetRegistrationIds: unknown;
  attempts: number;
  maxAttempts: number;
};

const RETRY_DELAYS_SECONDS = [30, 120, 600, 1800, 7200] as const;
const STALE_LOCK_MINUTES = 5;
const DEFAULT_POLL_MS = 15_000;
const DEFAULT_BATCH_SIZE = 25;

@Injectable()
export class ResidentPushOutboxService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ResidentPushOutboxService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly push: ReliableResidentPushService) {}

  onApplicationBootstrap() {
    if (process.env.NOTIFICATION_OUTBOX_DISABLED === 'true') {
      this.logger.log('Resident push outbox worker disabled by NOTIFICATION_OUTBOX_DISABLED');
      return;
    }
    const configured = Number(process.env.NOTIFICATION_OUTBOX_POLL_MS ?? DEFAULT_POLL_MS);
    const pollMs = Number.isFinite(configured) ? Math.max(5_000, configured) : DEFAULT_POLL_MS;
    void this.drainOnce();
    this.timer = setInterval(() => void this.drainOnce(), pollMs);
    this.timer.unref?.();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async enqueue(event: ResidentMessageEvent) {
    if (!event.userId) return { queued: false, duplicate: false };
    const dedupeKey = this.dedupeKey(event);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "ResidentPushOutbox" (
        "societyId","userId","eventType","dedupeKey","payload"
      ) VALUES (
        ${event.societyId}::uuid,${event.userId}::uuid,${event.type},${dedupeKey},${JSON.stringify(event)}::jsonb
      )
      ON CONFLICT ("societyId","dedupeKey") DO NOTHING
      RETURNING "id"
    `);
    return { queued: rows.length > 0, duplicate: rows.length === 0 };
  }

  async drainOnce(batchSize = DEFAULT_BATCH_SIZE) {
    if (this.running) return { claimed: 0, skipped: true };
    this.running = true;
    try {
      await this.recoverStaleClaims();
      const rows = await this.claim(Math.max(1, Math.min(100, batchSize)));
      for (const row of rows) await this.deliver(row);
      return { claimed: rows.length, skipped: false };
    } catch (error) {
      this.logger.error(`Resident push outbox sweep failed: ${this.errorMessage(error)}`);
      return { claimed: 0, skipped: false };
    } finally {
      this.running = false;
    }
  }

  private async claim(batchSize: number) {
    return this.prisma.$transaction(async (tx) => tx.$queryRaw<OutboxRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "ResidentPushOutbox"
        WHERE "status"='PENDING' AND "nextAttemptAt"<=CURRENT_TIMESTAMP
        ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "ResidentPushOutbox" outbox
      SET "status"='PROCESSING', "lockedAt"=CURRENT_TIMESTAMP,
          "attempts"=outbox."attempts"+1, "updatedAt"=CURRENT_TIMESTAMP
      FROM candidates
      WHERE outbox."id"=candidates."id"
      RETURNING outbox."id",outbox."societyId",outbox."userId",outbox."payload",
                outbox."targetRegistrationIds",outbox."attempts",outbox."maxAttempts"
    `));
  }

  private async recoverStaleClaims() {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "ResidentPushOutbox"
      SET "status"='PENDING', "lockedAt"=NULL, "nextAttemptAt"=CURRENT_TIMESTAMP,
          "lastErrorCode"='STALE_CLAIM_RECOVERED', "updatedAt"=CURRENT_TIMESTAMP
      WHERE "status"='PROCESSING'
        AND "lockedAt" < CURRENT_TIMESTAMP - make_interval(mins => ${STALE_LOCK_MINUTES})
    `);
  }

  private async deliver(row: OutboxRow) {
    let event: ResidentMessageEvent;
    try {
      event = this.parseEvent(row.payload);
    } catch (error) {
      await this.markDead(row.id, 'INVALID_PAYLOAD', this.errorMessage(error));
      return;
    }

    const targetIds = this.parseTargetIds(row.targetRegistrationIds);
    try {
      const result = await this.push.sendResidentOutboxEvent(event, targetIds);
      if (result.retryRegistrationIds.length === 0) {
        await this.prisma.$executeRaw(Prisma.sql`
          UPDATE "ResidentPushOutbox"
          SET "status"='DELIVERED', "lockedAt"=NULL, "targetRegistrationIds"=NULL,
              "deliveredAt"=CURRENT_TIMESTAMP, "lastErrorCode"=NULL, "lastErrorMessage"=NULL,
              "updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${row.id}::uuid AND "status"='PROCESSING'
        `);
        return;
      }
      await this.retryOrDead(row, result.retryRegistrationIds, 'FCM_TRANSIENT', 'Transient FCM delivery failure');
    } catch (error) {
      await this.retryOrDead(row, targetIds, this.errorCode(error), this.errorMessage(error));
    }
  }

  private async retryOrDead(row: OutboxRow, targetIds: string[] | undefined, code: string, message: string) {
    if (row.attempts >= row.maxAttempts) {
      await this.markDead(row.id, code, message);
      return;
    }
    const delaySeconds = RETRY_DELAYS_SECONDS[Math.min(row.attempts - 1, RETRY_DELAYS_SECONDS.length - 1)];
    const targetJson = targetIds && targetIds.length > 0 ? JSON.stringify(targetIds) : null;
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "ResidentPushOutbox"
      SET "status"='PENDING', "lockedAt"=NULL,
          "targetRegistrationIds"=${targetJson}::jsonb,
          "nextAttemptAt"=CURRENT_TIMESTAMP + make_interval(secs => ${delaySeconds}),
          "lastErrorCode"=${code.slice(0, 120)}, "lastErrorMessage"=${message.slice(0, 1000)},
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${row.id}::uuid AND "status"='PROCESSING'
    `);
  }

  private async markDead(id: string, code: string, message: string) {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "ResidentPushOutbox"
      SET "status"='DEAD', "lockedAt"=NULL,
          "lastErrorCode"=${code.slice(0, 120)}, "lastErrorMessage"=${message.slice(0, 1000)},
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "status"='PROCESSING'
    `);
  }

  private parseTargetIds(value: unknown) {
    if (value === null || value === undefined) return undefined;
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error('Outbox target registration IDs are invalid');
    return value as string[];
  }

  private parseEvent(value: unknown): ResidentMessageEvent {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Outbox event payload is invalid');
    const event = value as Partial<ResidentMessageEvent> & Record<string, unknown>;
    if (typeof event.type !== 'string' || typeof event.societyId !== 'string' || typeof event.userId !== 'string') {
      throw new Error('Outbox event identity is invalid');
    }
    return event as ResidentMessageEvent;
  }

  private dedupeKey(event: ResidentMessageEvent) {
    switch (event.type) {
      case 'ACCESS_APPROVAL_REQUESTED':
      case 'ACCESS_APPROVAL_DECIDED':
      case 'ACCESS_STATUS_CHANGED':
        return `${event.type}:${event.requestId}:${event.status}:${event.userId}`;
      case 'MAINTENANCE_DUE_ISSUED':
        return `${event.type}:${event.invoiceId ?? event.unitId ?? 'unknown'}:${event.userId}`;
      case 'GENERAL_NOTICE_PUBLISHED':
        return `${event.type}:${event.noticeId ?? 'unknown'}:${event.userId}`;
      case 'PARCEL_RECEIVED':
        return `${event.type}:${event.parcelId}:${event.userId}`;
      case 'EMERGENCY_BROADCAST':
        return `${event.type}:${event.broadcastId}:${event.userId}`;
    }
  }

  private errorCode(error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
      return (error as { code: string }).code;
    }
    return 'DELIVERY_ERROR';
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
