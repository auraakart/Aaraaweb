import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = () => readFileSync(
  join(__dirname, '../../prisma/migrations/20260918110000_v4_amenity_booking_idempotency/migration.sql'),
  'utf8',
);

describe('V4 amenity booking idempotency schema', () => {
  it('keeps idempotency tenant-user scoped and optional for legacy clients', () => {
    const migration = sql();
    expect(migration).toContain('ADD COLUMN "idempotencyKey" VARCHAR(100)');
    expect(migration).toContain('AmenityBooking_society_user_idempotency_key');
    expect(migration).toContain('("societyId","userId","idempotencyKey")');
    expect(migration).toContain('WHERE "idempotencyKey" IS NOT NULL');
  });
});
