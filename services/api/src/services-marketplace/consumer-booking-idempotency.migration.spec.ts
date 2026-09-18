import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = () => readFileSync(
  join(__dirname, '../../prisma/migrations/20260918111500_v4_consumer_booking_idempotency/migration.sql'),
  'utf8',
);

describe('V4 consumer booking idempotency schema', () => {
  it('scopes retry identity to authenticated consumer and keeps legacy rows compatible', () => {
    const migration = sql();
    expect(migration).toContain('ADD COLUMN "idempotencyKey" VARCHAR(100)');
    expect(migration).toContain('ConsumerServiceBooking_user_idempotency_key');
    expect(migration).toContain('("userId","idempotencyKey")');
    expect(migration).toContain('WHERE "idempotencyKey" IS NOT NULL');
  });
});
