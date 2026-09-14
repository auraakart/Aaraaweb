import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = () => readFileSync(
  join(__dirname, '../../prisma/migrations/20260914220000_v2_amenity_weekly_schedule/migration.sql'),
  'utf8',
);

describe('Amenity weekly operating schedule', () => {
  it('validates the optional weekly schedule contract without breaking legacy schedules', () => {
    const sql = migration();
    expect(sql).toContain("schedule.weekly must be an object");
    expect(sql).toContain("('mon','tue','wed','thu','fri','sat','sun')");
    expect(sql).toContain('HH:MM 24-hour format');
    expect(sql).toContain("NOT (NEW.\"schedule\" ? 'weekly')");
  });

  it('enforces booking windows in India local time', () => {
    const sql = migration();
    expect(sql).toContain("AT TIME ZONE 'Asia/Kolkata'");
    expect(sql).toContain('AmenityBooking_weekly_schedule_guard');
    expect(sql).toContain('outside configured operating hours');
    expect(sql).toContain('closed for the requested India-local day');
  });

  it('prevents schedule changes that would invalidate future active bookings', () => {
    const sql = migration();
    expect(sql).toContain("b.\"status\" IN ('PENDING','CONFIRMED')");
    expect(sql).toContain('b."endsAt" > CURRENT_TIMESTAMP');
    expect(sql).toContain('weekly schedule cannot change while future active bookings exist');
  });
});
