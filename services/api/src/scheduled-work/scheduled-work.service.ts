import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationRealtimeService } from '../notifications/notification-realtime.service';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;
const MIN_SWEEP_INTERVAL_MS = 15_000;
const MAX_SWEEP_INTERVAL_MS = 3_600_000;
const SCHEDULED_SWEEP_LOCK_KEY = 762_349_210;
const NOTICE_DISPATCH_BATCH_SIZE = 100;
const NOTICE_IN_FLIGHT_STALE_MINUTES = 10;

type NoticeDispatchWork = {
  dispatchId: string;
  societyId: string;
  noticeId: string;
  userId: string;
  title: string;
  body: string;
  attemptCount: number;
};

export function resolveScheduledSweepIntervalMs(raw = process.env.SCHEDULED_SWEEP_INTERVAL_MS) {
  if (!raw) return DEFAULT_SWEEP_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_SWEEP_INTERVAL_MS;
  return Math.min(MAX_SWEEP_INTERVAL_MS, Math.max(MIN_SWEEP_INTERVAL_MS, Math.trunc(parsed)));
}

export function scheduledSweepsEnabled(raw = process.env.DISABLE_SCHEDULED_SWEEPS) {
  return !['1', 'true', 'yes'].includes((raw ?? '').trim().toLowerCase());
}

export function noticeDispatchRetryDelayMinutes(attemptCount: number) {
  return Math.min(60, Math.max(1, 2 ** Math.max(0, attemptCount - 1)));
}

@Injectable()
export class ScheduledWorkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledWorkService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime?: NotificationRealtimeService,
  ) {}

  onModuleInit() {
    if (!scheduledSweepsEnabled()) {
      this.logger.log('Scheduled sweeps are disabled');
      return;
    }
    const intervalMs = resolveScheduledSweepIntervalMs();
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.timer.unref?.();
    void this.runOnce();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce() {
    if (this.running) return { skipped: true, reason: 'local-run-active' };
    this.running = true;
    try {
      const sweep = await this.prisma.$transaction(async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
          SELECT pg_try_advisory_xact_lock(${SCHEDULED_SWEEP_LOCK_KEY}) AS locked
        `);
        if (!lock?.locked) {
          return { skipped: true as const, reason: 'cluster-lock-held' as const, noticeDispatches: [] as NoticeDispatchWork[] };
        }

        const changed = await tx.$queryRaw<Array<{ ticketId: string }>>(Prisma.sql`
          WITH candidates AS (
            SELECT
              ht."id",
              ht."societyId",
              ht."slaState" AS "fromState",
              CASE
                WHEN ht."firstResponseDueAt" IS NULL THEN 'UNTRACKED'
                WHEN ht."status" IN ('RESOLVED','CLOSED') AND ht."resolutionDueAt" IS NOT NULL THEN
                  CASE
                    WHEN COALESCE(ht."resolvedAt", ht."closedAt") IS NOT NULL
                      AND COALESCE(ht."resolvedAt", ht."closedAt") <= ht."resolutionDueAt" THEN 'MET'
                    ELSE 'RESOLUTION_BREACHED'
                  END
                WHEN ht."status" NOT IN ('RESOLVED','CLOSED')
                  AND ht."resolutionDueAt" IS NOT NULL
                  AND CURRENT_TIMESTAMP > ht."resolutionDueAt" THEN 'RESOLUTION_BREACHED'
                WHEN ht."firstRespondedAt" IS NULL
                  AND ht."firstResponseDueAt" IS NOT NULL
                  AND CURRENT_TIMESTAMP > ht."firstResponseDueAt" THEN 'RESPONSE_BREACHED'
                ELSE 'ON_TRACK'
              END AS "toState"
            FROM "HelpdeskTicket" ht
            WHERE ht."firstResponseDueAt" IS NOT NULL
          ),
          changed AS (
            UPDATE "HelpdeskTicket" ht
            SET "slaState" = c."toState", "updatedAt" = CURRENT_TIMESTAMP
            FROM candidates c
            WHERE ht."id" = c."id"
              AND ht."societyId" = c."societyId"
              AND c."toState" <> c."fromState"
            RETURNING ht."id" AS "ticketId", ht."societyId", c."fromState", c."toState"
          )
          INSERT INTO "HelpdeskSlaEvent" (
            "societyId", "ticketId", "actorUserId", "actorSource", "eventType", "fromState", "toState", "note"
          )
          SELECT
            c."societyId", c."ticketId", NULL, 'AUTOMATION', 'STATE_CHANGED', c."fromState", c."toState",
            'SLA state evaluated by scheduled automation'
          FROM changed c
          RETURNING "ticketId"
        `);

        const escalated = await tx.$queryRaw<Array<{ ticketId: string }>>(Prisma.sql`
          WITH candidates AS (
            SELECT ht."id", ht."societyId", ht."slaState", p."escalationTargetUserId"
            FROM "HelpdeskTicket" ht
            JOIN "HelpdeskSlaPolicy" p
              ON p."societyId"=ht."societyId"
             AND p."priority"=ht."priority"
             AND p."active"=true
             AND p."automaticEscalationEnabled"=true
             AND p."escalationTargetUserId" IS NOT NULL
            JOIN "SocietyMembership" sm
              ON sm."societyId"=p."societyId"
             AND sm."userId"=p."escalationTargetUserId"
             AND sm."active"=true
            WHERE ht."status" NOT IN ('RESOLVED','CLOSED')
              AND ht."escalationLevel"=0
              AND ht."slaState" IN ('RESPONSE_BREACHED','RESOLUTION_BREACHED')
              AND (
                (ht."slaState"='RESOLUTION_BREACHED' AND ht."resolutionDueAt" IS NOT NULL
                  AND CURRENT_TIMESTAMP >= ht."resolutionDueAt" + make_interval(mins => p."escalationAfterMinutes"))
                OR
                (ht."slaState"='RESPONSE_BREACHED' AND ht."firstResponseDueAt" IS NOT NULL
                  AND CURRENT_TIMESTAMP >= ht."firstResponseDueAt" + make_interval(mins => p."escalationAfterMinutes"))
              )
            FOR UPDATE OF ht SKIP LOCKED
          ),
          escalated AS (
            UPDATE "HelpdeskTicket" ht
            SET "escalationLevel"=1,
                "escalatedToId"=c."escalationTargetUserId",
                "lastEscalatedAt"=CURRENT_TIMESTAMP,
                "updatedAt"=CURRENT_TIMESTAMP
            FROM candidates c
            WHERE ht."id"=c."id" AND ht."societyId"=c."societyId" AND ht."escalationLevel"=0
            RETURNING ht."id" AS "ticketId", ht."societyId", ht."slaState", ht."escalatedToId"
          )
          INSERT INTO "HelpdeskSlaEvent" (
            "societyId","ticketId","actorUserId","actorSource","eventType","fromState","toState",
            "escalationLevel","escalatedToId","note"
          )
          SELECT e."societyId",e."ticketId",NULL,'AUTOMATION','ESCALATED',e."slaState",e."slaState",1,e."escalatedToId",
            'First SLA escalation routed by scheduled automation'
          FROM escalated e
          RETURNING "ticketId"
        `);

        const sosEscalated = await tx.$queryRaw<Array<{ incidentId: string }>>(Prisma.sql`
          WITH candidates AS (
            SELECT si."id", si."societyId", si."status"
            FROM "SosIncident" si
            JOIN "SocietyMembership" sm
              ON sm."societyId"=si."societyId"
             AND sm."userId"=si."assignedResponderUserId"
             AND sm."active"=true
            WHERE si."status"='ACTIVE'
              AND si."assignedResponderUserId" IS NOT NULL
              AND si."acknowledgeDueAt" IS NOT NULL
              AND si."acknowledgeDueAt" <= CURRENT_TIMESTAMP
              AND si."autoEscalatedAt" IS NULL
            FOR UPDATE OF si SKIP LOCKED
          ),
          updated AS (
            UPDATE "SosIncident" si
            SET "autoEscalatedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
            FROM candidates c
            WHERE si."id"=c."id" AND si."societyId"=c."societyId" AND si."autoEscalatedAt" IS NULL
            RETURNING si."id" AS "incidentId",si."societyId",si."status"
          )
          INSERT INTO "SosIncidentEvent" (
            "societyId","incidentId","actorUserId","actorSource","action","fromStatus","toStatus","note"
          )
          SELECT u."societyId",u."incidentId",NULL,'AUTOMATION','ESCALATED',u."status",u."status",
            'SOS acknowledgement deadline exceeded; escalated by scheduled automation'
          FROM updated u
          RETURNING "incidentId"
        `);

        const noticeDispatches = await tx.$queryRaw<NoticeDispatchWork[]>(Prisma.sql`
          WITH candidates AS (
            SELECT nd."id", nd."societyId", nd."noticeId", nd."userId", n."title", n."body"
            FROM "NoticeDispatch" nd
            JOIN "Notice" n
              ON n."id"=nd."noticeId" AND n."societyId"=nd."societyId"
            WHERE n."status"='PUBLISHED'
              AND n."publishedAt" IS NOT NULL
              AND n."publishedAt" <= CURRENT_TIMESTAMP
              AND (n."expiresAt" IS NULL OR n."expiresAt" > CURRENT_TIMESTAMP)
              AND (
                (nd."status"='PENDING' AND (nd."nextAttemptAt" IS NULL OR nd."nextAttemptAt" <= CURRENT_TIMESTAMP))
                OR
                (nd."status"='IN_FLIGHT' AND nd."lastAttemptAt" <= CURRENT_TIMESTAMP - make_interval(mins => ${NOTICE_IN_FLIGHT_STALE_MINUTES}))
              )
            ORDER BY COALESCE(nd."nextAttemptAt", n."publishedAt"), nd."createdAt"
            LIMIT ${NOTICE_DISPATCH_BATCH_SIZE}
            FOR UPDATE OF nd SKIP LOCKED
          )
          UPDATE "NoticeDispatch" nd
          SET "status"='IN_FLIGHT',
              "attemptCount"=nd."attemptCount" + 1,
              "lastAttemptAt"=CURRENT_TIMESTAMP,
              "updatedAt"=CURRENT_TIMESTAMP
          FROM candidates c
          WHERE nd."id"=c."id"
          RETURNING nd."id" AS "dispatchId", nd."societyId", nd."noticeId", nd."userId",
                    c."title", c."body", nd."attemptCount"
        `);

        if (changed.length > 0) this.logger.log(`Scheduled SLA sweep updated ${changed.length} ticket(s)`);
        if (escalated.length > 0) this.logger.log(`Scheduled SLA sweep escalated ${escalated.length} ticket(s)`);
        if (sosEscalated.length > 0) this.logger.log(`Scheduled SOS sweep escalated ${sosEscalated.length} incident(s)`);

        return {
          skipped: false as const,
          processed: changed.length,
          escalated: escalated.length,
          sosEscalated: sosEscalated.length,
          noticeDispatches,
        };
      });

      if (sweep.skipped) return { skipped: true, reason: sweep.reason };

      const dispatchResult = await this.dispatchNotices(sweep.noticeDispatches);
      return {
        skipped: false,
        processed: sweep.processed,
        escalated: sweep.escalated,
        sosEscalated: sweep.sosEscalated,
        noticeDispatched: dispatchResult.dispatched,
        noticeDispatchFailed: dispatchResult.failed,
      };
    } catch (error) {
      this.logger.error('Scheduled operational sweep failed', error instanceof Error ? error.stack : String(error));
      return { skipped: true, reason: 'error' };
    } finally {
      this.running = false;
    }
  }

  private async dispatchNotices(work: NoticeDispatchWork[]) {
    let dispatched = 0;
    let failed = 0;

    for (const item of work) {
      try {
        if (!this.realtime) throw new Error('Notification realtime service is unavailable');
        await this.realtime.dispatchResident({
          type: 'GENERAL_NOTICE_PUBLISHED',
          societyId: item.societyId,
          userId: item.userId,
          noticeId: item.noticeId,
          title: item.title,
          body: item.body,
          createdAt: new Date().toISOString(),
        });
        await this.prisma.$executeRaw(Prisma.sql`
          UPDATE "NoticeDispatch"
          SET "status"='DISPATCHED', "dispatchedAt"=CURRENT_TIMESTAMP, "nextAttemptAt"=NULL,
              "lastError"=NULL, "updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${item.dispatchId}::uuid AND "status"='IN_FLIGHT'
        `);
        dispatched += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown notice dispatch error';
        const retryDelay = noticeDispatchRetryDelayMinutes(item.attemptCount);
        await this.prisma.$executeRaw(Prisma.sql`
          UPDATE "NoticeDispatch"
          SET "status"='PENDING',
              "nextAttemptAt"=CURRENT_TIMESTAMP + make_interval(mins => ${retryDelay}),
              "lastError"=${message},
              "updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${item.dispatchId}::uuid AND "status"='IN_FLIGHT'
        `);
        failed += 1;
      }
    }

    if (dispatched > 0) this.logger.log(`Scheduled notice dispatch sent ${dispatched} recipient notification(s)`);
    if (failed > 0) this.logger.warn(`Scheduled notice dispatch deferred ${failed} recipient notification(s) for retry`);
    return { dispatched, failed };
  }
}
