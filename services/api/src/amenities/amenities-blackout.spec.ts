import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = () => readFileSync(
  join(__dirname, '../../prisma/migrations/20260914200000_v2_amenity_blackouts/migration.sql'),
  'utf8',
);

describe('Amenity maintenance blackouts', () => {
  it('validates blackout structure and timestamps', () => {
    const sql = migration();
    expect(sql).toContain('schedule.blackouts must be an array');
    expect(sql).toContain('blackout windows require start and end');
    expect(sql).toContain('valid ISO-8601 timestamps');
    expect(sql).toContain('blackout start must be before end');
  });

  it('rejects bookings that overlap a configured blackout', () => {
    const sql = migration();
    expect(sql).toContain('AmenityBooking_blackout_guard');
    expect(sql).toContain('NEW."startsAt" < (blackout ->> \'end\')::timestamptz');
    expect(sql).toContain('NEW."endsAt" > (blackout ->> \'start\')::timestamptz');
    expect(sql).toContain('maintenance blackout');
  });

  it('allows blackout policy changes only when they do not invalidate future bookings', () => {
    const sql = migration();
    expect(sql).toContain('(OLD."schedule" -> \'blackouts\') IS DISTINCT FROM (NEW."schedule" -> \'blackouts\')');
    expect(sql).toContain('blackout conflicts with an existing future booking');
    expect(sql).toContain('(OLD."schedule" -> \'weekly\') IS DISTINCT FROM (NEW."schedule" -> \'weekly\')');
  });
});
