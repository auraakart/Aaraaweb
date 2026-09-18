import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = () => readFileSync(
  join(__dirname, '../../prisma/migrations/20260918070000_v4_migration_batches/migration.sql'),
  'utf8',
);

describe('V4 migration batch persistence contract', () => {
  it('enforces society-scoped checksum idempotency and immutable row ordering', () => {
    const migration = sql();
    expect(migration).toContain('MigrationBatch_society_checksum_key');
    expect(migration).toContain('MigrationBatchRow_batch_row_key');
    expect(migration).toContain('MigrationBatch_society_fkey');
    expect(migration).toContain('MigrationBatch_actor_fkey');
  });

  it('limits persisted lifecycle states to the documented migration workflow', () => {
    expect(sql()).toContain("('PREVIEWED','READY','COMMITTED','ROLLED_BACK','FAILED')");
  });
});
