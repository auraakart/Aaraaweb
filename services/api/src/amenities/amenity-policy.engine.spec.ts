import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AmenityPolicyEngine } from './amenity-policy.engine';

describe('AmenityPolicyEngine', () => {
  const policy = new AmenityPolicyEngine();

  it('keeps paired deposit and no-show policy fields fail closed', () => {
    expect(() => policy.parseBookingRules({ refundableDepositPaise: 50000 })).toThrow(BadRequestException);
    expect(() => policy.parseBookingRules({ noShowRestrictionCount: 2, noShowLookbackDays: 30 })).toThrow(BadRequestException);
    expect(policy.parseBookingRules({
      refundableDepositPaise: 50000,
      depositPaymentWindowMinutes: 30,
      noShowRestrictionCount: 2,
      noShowLookbackDays: 30,
      noShowBlockDays: 7,
    })).toEqual(expect.objectContaining({
      refundableDepositPaise: 50000,
      depositPaymentWindowMinutes: 30,
      noShowRestrictionCount: 2,
    }));
  });

  it('evaluates India-local operating hours independently of service orchestration', () => {
    const schedule = {
      weekly: {
        mon: [{ start: '06:00', end: '22:00' }],
        tue: [], wed: [], thu: [], fri: [], sat: [], sun: [],
      },
    };
    const mondayMorningUtc = new Date('2026-10-05T01:30:00.000Z');
    const mondayLaterUtc = new Date('2026-10-05T02:30:00.000Z');
    expect(policy.isWeeklyOperatingWindowOpen(schedule, mondayMorningUtc, mondayLaterUtc)).toBe(true);
    expect(() => policy.assertScheduleWindowOpen(
      schedule,
      new Date('2026-10-05T17:00:00.000Z'),
      new Date('2026-10-05T18:00:00.000Z'),
    )).toThrow(ConflictException);
  });

  it('rejects overlapping pricing bands and excessive guest counts', () => {
    expect(() => policy.parseBookingRules({
      pricingBands: [
        { startMinute: 600, endMinute: 720, feePaise: 10000, daysOfWeek: [1] },
        { startMinute: 660, endMinute: 780, feePaise: 12000, daysOfWeek: [1] },
      ],
    })).toThrow(BadRequestException);

    expect(() => policy.validateGuestCount({ maxGuestsPerBooking: 2 }, 3)).toThrow(BadRequestException);
  });
});
