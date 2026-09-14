import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = () => readFileSync(
  join(__dirname, '../../prisma/migrations/20260914204000_v2_notification_outbox/migration.sql'),
  'utf8',
);

describe('Resident push outbox migration', () => {
  it('deduplicates resident push work per society', () => {
    const sql = migration();
    expect(sql).toContain('ResidentPushOutbox_society_dedupe_key');
    expect(sql).toContain('(\"societyId\", \"dedupeKey\")');
  });

  it('supports ready, processing and dead-letter states with bounded attempts', () => {
    const sql = migration();
    expect(sql).toContain("'PENDING','PROCESSING','DELIVERED','DEAD'");
    expect(sql).toContain('"maxAttempts" BETWEEN 1 AND 20');
    expect(sql).toContain('ResidentPushOutbox_ready_idx');
    expect(sql).toContain('ResidentPushOutbox_processing_idx');
  });
});
