import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OBJECT_STORAGE, ObjectStoragePort } from '../services-marketplace/object-storage.port';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_INTERVAL_MS = 5 * 60_000;
const CLEANUP_LOCK_KEY = 762_349_211;
const BATCH_SIZE = 50;

type CleanupWork = {
  id: string;
  storageKey: string;
  attemptCount: number;
};

export function storageCleanupRetryDelayMinutes(attemptCount: number) {
  return Math.min(24 * 60, Math.max(5, 5 * 2 ** Math.max(0, attemptCount - 1)));
}

@Injectable()
export class ObjectStorageCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ObjectStorageCleanupService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runOnce(), DEFAULT_INTERVAL_MS);
    this.timer.unref?.();
    void this.runOnce();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce() {
    if (this.running) return { skipped: true, reason: 'local-run-active' as const };
    this.running = true;
    try {
      const work = await this.prisma.$transaction(async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>(Prisma.sql`
          SELECT pg_try_advisory_xact_lock(${CLEANUP_LOCK_KEY}) AS locked
        `);
        if (!lock?.locked) return null;

        return tx.$queryRaw<CleanupWork[]>(Prisma.sql`
          WITH candidates AS (
            SELECT m."id", m."storageKey"
            FROM "ServiceProviderMedia" m
            WHERE m."status" IN ('REMOVED'::"ProviderMediaStatus", 'REJECTED'::"ProviderMediaStatus")
              AND m."storageDeletedAt" IS NULL
              AND (m."storageDeleteNextAttemptAt" IS NULL OR m."storageDeleteNextAttemptAt" <= CURRENT_TIMESTAMP)
            ORDER BY m."updatedAt" ASC
            LIMIT ${BATCH_SIZE}
            FOR UPDATE OF m SKIP LOCKED
          )
          UPDATE "ServiceProviderMedia" m
          SET "storageDeleteAttemptCount" = m."storageDeleteAttemptCount" + 1,
              "storageDeleteNextAttemptAt" = CURRENT_TIMESTAMP + INTERVAL '10 minutes',
              "updatedAt" = CURRENT_TIMESTAMP
          FROM candidates c
          WHERE m."id" = c."id"
          RETURNING m."id", m."storageKey", m."storageDeleteAttemptCount" AS "attemptCount"
        `);
      });

      if (work === null) return { skipped: true, reason: 'cluster-lock-held' as const };

      let deleted = 0;
      let failed = 0;
      for (const item of work) {
        try {
          await this.storage.deleteObject(item.storageKey);
          await this.prisma.$executeRaw(Prisma.sql`
            UPDATE "ServiceProviderMedia"
            SET "storageDeletedAt" = CURRENT_TIMESTAMP,
                "storageDeleteNextAttemptAt" = NULL,
                "storageDeleteLastError" = NULL,
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${item.id}::uuid AND "storageDeletedAt" IS NULL
          `);
          deleted += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown object-storage cleanup error';
          const delay = storageCleanupRetryDelayMinutes(item.attemptCount);
          await this.prisma.$executeRaw(Prisma.sql`
            UPDATE "ServiceProviderMedia"
            SET "storageDeleteNextAttemptAt" = CURRENT_TIMESTAMP + make_interval(mins => ${delay}),
                "storageDeleteLastError" = ${message},
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${item.id}::uuid AND "storageDeletedAt" IS NULL
          `);
          failed += 1;
        }
      }

      if (deleted > 0) this.logger.log(`Object-storage cleanup deleted ${deleted} provider media object(s)`);
      if (failed > 0) this.logger.warn(`Object-storage cleanup deferred ${failed} provider media object(s)`);
      return { skipped: false, deleted, failed };
    } catch (error) {
      this.logger.error('Object-storage cleanup sweep failed', error instanceof Error ? error.stack : String(error));
      return { skipped: true, reason: 'error' as const };
    } finally {
      this.running = false;
    }
  }
}
