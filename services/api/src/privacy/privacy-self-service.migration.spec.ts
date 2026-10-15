import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = () => readFileSync(
  join(__dirname, '../../prisma/migrations/20260918131500_v45_privacy_self_service/migration.sql'),
  'utf8',
);

describe('V4.5 privacy self-service schema', () => {
  it('supports society and independent-home requests with retry identity', () => {
    const migration = sql();
    expect(migration).toContain('ALTER COLUMN "societyId" DROP NOT NULL');
    expect(migration).toContain('ADD COLUMN "requestKey" VARCHAR(100)');
    expect(migration).toContain('PrivacyRequestCase_subject_request_key');
    expect(migration).toContain('("subjectUserId","requestKey")');
    expect(migration).toContain('PrivacyRequestEvent_case_created_idx');
  });
});
