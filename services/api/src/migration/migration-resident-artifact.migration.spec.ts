import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = () => readFileSync(
  join(__dirname, '../../prisma/migrations/20260918090000_v4_migration_resident_artifacts/migration.sql'),
  'utf8',
);

describe('V4 resident migration artifact evidence', () => {
  it('tracks created versus reused resident artifacts with durable row ownership', () => {
    const migration = sql();
    expect(migration).toContain('MigrationBatchArtifact');
    expect(migration).toContain('"createdByMigration" BOOLEAN NOT NULL');
    expect(migration).toContain('MigrationBatchArtifact_row_type_target_key');
    expect(migration).toContain('MigrationBatchArtifact_target_idx');
    expect(migration).toContain("'UNIT_OCCUPANCY'");
    expect(migration).toContain("'HOUSEHOLD'");
  });
});
