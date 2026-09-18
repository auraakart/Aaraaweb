import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = () => readFileSync(
  join(__dirname, '../../prisma/migrations/20260918073000_v4_migration_structural_commit/migration.sql'),
  'utf8',
);

describe('V4 structural migration commit evidence', () => {
  it('stores actor and target evidence for commit and rollback', () => {
    const migration = sql();
    expect(migration).toContain('"committedByUserId"');
    expect(migration).toContain('"rolledBackByUserId"');
    expect(migration).toContain('"targetType"');
    expect(migration).toContain('"targetId"');
    expect(migration).toContain('MigrationBatchRow_target_idx');
  });
});
