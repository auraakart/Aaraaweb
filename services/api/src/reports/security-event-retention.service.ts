import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 365;
const MIN_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 3650;
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = 10;

@Injectable()
export class SecurityEventRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SecurityEventRetentionService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if ((process.env.SECURITY_EVENT_RETENTION_AUTO_PURGE ?? 'false').toLowerCase() !== 'true') {
      this.logger.log('Security event auto-purge disabled');
      return;
    }
    this.retentionDays();
    const raw = Number(process.env.SECURITY_EVENT_RETENTION_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
    const intervalMs = Math.max(Number.isFinite(raw) ? raw : DEFAULT_INTERVAL_MS, 60 * 60 * 1000);
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.timer.unref();
    void this.runOnce();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(now = new Date()) {
    if (this.running) return { deleted: 0, skipped: true };
    this.running = true;
    try {
      const cutoff = new Date(now.getTime() - this.retentionDays() * DAY_MS);
      let deleted = 0;
      for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
        const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
          DELETE FROM "SecurityEvent"
          WHERE "id" IN (
            SELECT "id"
            FROM "SecurityEvent"
            WHERE "occurredAt" < ${cutoff}
            ORDER BY "occurredAt" ASC, "id" ASC
            LIMIT ${BATCH_SIZE}
          )
          RETURNING "id"
        `;
        deleted += rows.length;
        if (rows.length < BATCH_SIZE) break;
      }
      this.logger.log(`Security event retention completed: deleted=${deleted}`);
      return { deleted, skipped: false, cutoff: cutoff.toISOString() };
    } finally {
      this.running = false;
    }
  }

  private retentionDays() {
    const raw = Number(process.env.SECURITY_EVENT_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
    if (!Number.isInteger(raw) || raw < MIN_RETENTION_DAYS || raw > MAX_RETENTION_DAYS) {
      throw new Error(`SECURITY_EVENT_RETENTION_DAYS must be an integer between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}`);
    }
    return raw;
  }
}
