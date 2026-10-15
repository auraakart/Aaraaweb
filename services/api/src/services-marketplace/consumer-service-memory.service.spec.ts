import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerServiceLocationService } from './consumer-service-location.service';
import { ConsumerServiceMemoryService } from './consumer-service-memory.service';

function sqlText(call: unknown): string {
  return ((call as { strings?: readonly string[] }).strings ?? []).join('?');
}

describe('ConsumerServiceMemoryService', () => {
  const setup = () => {
    const prismaMock = { $queryRaw: vi.fn() };
    const locationsMock = {
      resolveLocation: vi.fn().mockResolvedValue({
        homeId: '11111111-1111-4111-8111-111111111111',
        societyUnitId: null,
        postalCode: '600115',
      }),
    };
    const prisma = prismaMock as unknown as PrismaService;
    const locations = locationsMock as unknown as ConsumerServiceLocationService;
    return {
      prisma: prismaMock,
      locations: locationsMock,
      service: new ConsumerServiceMemoryService(prisma, locations),
    };
  };

  it('upserts a favourite only after provider verification check', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: '22222222-2222-4222-8222-222222222222' }])
      .mockResolvedValueOnce([{ providerId: '22222222-2222-4222-8222-222222222222', active: true }]);

    const result = await service.setFavorite(
      '33333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222',
      true,
    );

    expect(result?.active).toBe(true);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('derives recent providers from the current user completed bookings only', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        providerId: '22222222-2222-4222-8222-222222222222',
        businessName: 'Care Services',
        lastCompletedAt: new Date('2026-09-10T10:00:00.000Z'),
        completedBookings: 2,
      },
    ]);

    const result = await service.listRecentProviders('33333333-3333-4333-8333-333333333333');

    expect(result).toHaveLength(1);
    const query = sqlText(prisma.$queryRaw.mock.calls[0][0]);
    expect(query).toContain('"ConsumerServiceBooking"');
    expect(query).toContain('"ServiceProvider"');
    expect(query).toContain('b."userId"');
    expect(query).toContain("'COMPLETED'::\"ServiceBookingStatus\"");
    expect(query).toContain("'VERIFIED'::\"ProviderVerificationStatus\"");
    expect(query).toContain('LIMIT 8');
  });

  it('4.2.5 refuses foreign recurring plans before resolving location or technician history', async () => {
    const { prisma, locations, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.getRecurringTechnicianContinuity('current-user', 'foreign-plan'))
      .rejects.toThrow('Recurring service plan not found');
    expect(locations.resolveLocation).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const planQuery = prisma.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(planQuery.values).toEqual(['foreign-plan', 'current-user']);
  });

  it('4.2.5 rechecks current location and fails closed if access was revoked', async () => {
    const { prisma, locations, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{
      id: 'plan', offeringId: 'offering', locationType: 'SOCIETY_UNIT',
      locationId: 'unit-1', status: 'PAUSED',
    }]);
    locations.resolveLocation.mockRejectedValueOnce(new Error('Current unit access denied'));
    await expect(service.getRecurringTechnicianContinuity('former-tenant', 'plan'))
      .rejects.toThrow('Current unit access denied');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('4.2.5 rejects unsupported plan locations and mismatched resolved unit', async () => {
    const { prisma, locations, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{
      id: 'plan', offeringId: 'offering', locationType: 'OTHER', locationId: 'location', status: 'ACTIVE',
    }]);
    await expect(service.getRecurringTechnicianContinuity('user', 'plan'))
      .rejects.toThrow('Unsupported recurring service location');
    expect(locations.resolveLocation).not.toHaveBeenCalled();

    prisma.$queryRaw.mockResolvedValueOnce([{
      id: 'plan', offeringId: 'offering', locationType: 'SOCIETY_UNIT', locationId: 'unit-1', status: 'ACTIVE',
    }]);
    locations.resolveLocation.mockResolvedValueOnce({ homeId: null, societyUnitId: 'unit-2' });
    await expect(service.getRecurringTechnicianContinuity('user', 'plan'))
      .rejects.toThrow('Recurring service location not available');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('4.2.5 returns historical technician evidence without claiming a dispatch or availability', async () => {
    const { prisma, locations, service } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{
        id: 'plan', offeringId: 'offer', locationType: 'HOME',
        locationId: '11111111-1111-4111-8111-111111111111', status: 'PAUSED',
      }])
      .mockResolvedValueOnce([{
        agentId: 'agent', displayName: 'Technician A',
        lastArrivedAt: new Date('2026-10-05T10:00:00.000Z'), completedVisits: 2,
      }]);
    const result = await service.getRecurringTechnicianContinuity('owner', 'plan');
    expect(locations.resolveLocation).toHaveBeenCalledWith(
      'owner', 'HOME', '11111111-1111-4111-8111-111111111111',
    );
    expect(result).toMatchObject({
      planStatus: 'PAUSED', historicalEvidenceOnly: true,
      technicianAvailabilityConfirmed: false, technicianAssignmentGuaranteed: false,
      bookingCreated: false, automaticDispatch: false,
    });
    expect(result.candidates).toHaveLength(1);
    const sql = sqlText(prisma.$queryRaw.mock.calls[1][0]);
    for (const expected of [
      'b."userId"', 'b."offeringId"', 'b."homeId"', 'b."societyUnitId"',
      'a."arrivedAt" IS NOT NULL', 'ag."active" = true',
      "'COMPLETED'::\"ServiceBookingStatus\"",
      "'VERIFIED'::\"ProviderVerificationStatus\"",
      'LIMIT 3',
    ]) expect(sql).toContain(expected);
    expect(sql).not.toContain('ag."phone"');
    expect(sql).not.toContain('b."addressSnapshot"');
    expect((prisma.$queryRaw.mock.calls[1][0] as { values: unknown[] }).values).toEqual([
      'owner', 'offer', 'HOME', '11111111-1111-4111-8111-111111111111',
      'HOME', '11111111-1111-4111-8111-111111111111',
    ]);
  });

  it('4.2.5 has an explicit empty historical state with no implied technician recommendation', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{
        id: 'plan', offeringId: 'offer', locationType: 'HOME',
        locationId: '11111111-1111-4111-8111-111111111111', status: 'ACTIVE',
      }])
      .mockResolvedValueOnce([]);
    const result = await service.getRecurringTechnicianContinuity('owner', 'plan');
    expect(result.candidates).toEqual([]);
    expect(result.technicianAssignmentGuaranteed).toBe(false);
  });

  it('derives location-scoped history after authorization resolution', async () => {
    const { prisma, locations, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        id: 'booking-1',
        offeringName: 'AC service',
        providerName: 'Care Services',
        ratingStars: 5,
        ratingComment: 'Very good service',
        canRebook: true,
      },
    ]);

    const result = await service.listHistory(
      '33333333-3333-4333-8333-333333333333',
      'HOME',
      '11111111-1111-4111-8111-111111111111',
    );

    expect(locations.resolveLocation).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      'HOME',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result).toHaveLength(1);
    const query = sqlText(prisma.$queryRaw.mock.calls[0][0]);
    expect(query).toContain('"ConsumerServiceRating"');
    expect(query).toContain('"ratingStars"');
    expect(query).toContain('"ratingComment"');
    expect(query).toContain('"ConsumerServiceBookingEvent"');
    expect(query).toContain("'COMPLETED'::\"ServiceBookingStatus\"");
  });
});
