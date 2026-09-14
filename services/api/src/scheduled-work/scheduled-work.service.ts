import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;
const MIN_SWEEP_INTERVAL_MS = 15_000;
const MAX_SWEEP_INTERVAL_MS = 3_600_000;
const HELP_DESK_SWEEP_LOCK_KEY = 762_349_210;

export function resolveScheduledSweepIntervalMs(raw = process.env.SCHEDULED_SWEEP_INTERVAL_MS) {
  if (!raw) return DEFAULT_SWEEP_INTERVAL_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_SWEEP_INTERVAL_MS;
  return Math.min(MAX_SWEEP_INTERVAL_MS, Math.max(MIN_SWEEP_INTERVAL_MS, Math.trunc(parsed)));
}

export function scheduledSweepsEnabled(raw = process.env.DISABLE_SCHEDULED_SWEEPS) {
  return !['1', 'true', 'yes'].includes((raw ?? '').trim().toLowerCase());
}

@Injectable()
export class ScheduledWorkService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledWorkService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

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
      return await this.prisma.$transaction(async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
          SELECT pg_try_advisory_xact_lock(${HELP_DESK_SWEEP_LOCK_KEY}) AS locked
        `);
        if (!lock?.locked) return { skipped: true, reason: 'cluster-lock-held' };

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

        if (changed.length > 0) this.logger.log(`Scheduled SLA sweep updated ${changed.length} ticket(s)`);
        if (escalated.length > 0) this.logger.log(`Scheduled SLA sweep escalated ${escalated.length} ticket(s)`);
        return { skipped: false, processed: changed.length, escalated: escalated.length };
      });
    } catch (error) {
      this.logger.error('Scheduled SLA sweep failed', error instanceof Error ? error.stack : String(error));
      return { skipped: true, reason: 'error' };
    } finally {
      this.running = false;
    }
  }
}
