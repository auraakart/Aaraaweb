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

  it('4.2.7 refuses a foreign booking before disclosing technician candidates', async () => {
    const { prisma, locations, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.getBookingTechnicianCandidates('owner', 'foreign'))
      .rejects.toThrow('Service booking not found');
    const q = prisma.$queryRaw.mock.calls[0][0] as { strings: string[]; values: unknown[] };
    expect(q.values).toEqual(['foreign', 'owner']);
    expect(q.strings.join(' ')).toContain('b."userId"');
    expect(locations.resolveLocation).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('4.2.7 denies revoked location access and already assigned bookings', async () => {
    const { prisma, locations, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'booking', homeId: null,
      societyUnitId: 'unit', status: 'REQUESTED', hasActiveAssignment: false }]);
    locations.resolveLocation.mockRejectedValueOnce(new Error('Occupancy revoked'));
    await expect(service.getBookingTechnicianCandidates('owner', 'booking'))
      .rejects.toThrow('Occupancy revoked');
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'booking',
      homeId: '11111111-1111-4111-8111-111111111111', societyUnitId: null,
      status: 'CONFIRMED', hasActiveAssignment: true }]);
    await expect(service.getBookingTechnicianCandidates('owner', 'booking'))
      .rejects.toThrow('Technician preference is closed');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('4.2.7 scopes historical arrival candidates to the same owner, provider, offering and home', async () => {
    const { prisma, locations, service } = setup();
    const homeId = '11111111-1111-4111-8111-111111111111';
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'booking', homeId, societyUnitId: null,
      offeringId: 'offering', providerId: 'provider', status: 'REQUESTED', hasActiveAssignment: false,
    }]).mockResolvedValueOnce([{
      agentId: 'agent', displayName: 'Ravi', completedVisits: 2,
      lastArrivedAt: new Date('2026-10-11T10:00:00Z'),
    }]);
    const response = await service.getBookingTechnicianCandidates('owner', 'booking');
    expect(locations.resolveLocation).toHaveBeenCalledWith('owner', 'HOME', homeId);
    expect(response).toMatchObject({ historicalEvidenceOnly: true,
      availabilityConfirmed: false, technicianAssignmentGuaranteed: false,
      candidates: [{ agentId: 'agent', completedVisits: 2 }] });
    const q = prisma.$queryRaw.mock.calls[1][0] as { strings: string[]; values: unknown[] };
    const sql = q.strings.join(' ');
    for (const fragment of ['historical."userId"', 'historical."providerId"',
      'historical."offeringId"', 'historical."homeId"', 'historical."societyUnitId"',
      'a."arrivedAt" IS NOT NULL', 'ag."active" = true',
      "'VERIFIED'::\"ProviderVerificationStatus\"",
      "'COMPLETED'::\"ServiceBookingStatus\"", 'LIMIT 20']) {
      expect(sql).toContain(fragment);
    }
    expect(sql).not.toContain('ag."phone"');
    expect(sql).not.toContain('"addressSnapshot"');
    expect(q.values).toEqual(['owner', 'offering', 'provider', homeId, homeId, null, null]);
  });

  it('4.2.7 returns an explicit empty candidate list', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{
      id: 'booking', homeId: '11111111-1111-4111-8111-111111111111',
      societyUnitId: null, offeringId: 'offering', providerId: 'provider',
      status: 'CONFIRMED', hasActiveAssignment: false,
    }]).mockResolvedValueOnce([]);
    const response = await service.getBookingTechnicianCandidates('owner', 'booking');
    expect(response.candidates).toEqual([]);
    expect(response.technicianAssignmentGuaranteed).toBe(false);
  });

  it('4.2.8 denies foreign booking request status before resolving location', async () => {
    const { prisma, locations, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.getBookingTechnicianRequestStatus('resident', 'foreign'))
      .rejects.toThrow('Service booking not found');
    expect(locations.resolveLocation).not.toHaveBeenCalled();
    const q = prisma.$queryRaw.mock.calls[0][0] as { strings: string[]; values: unknown[] };
    expect(q.values).toEqual(['foreign', 'resident']);
    expect(q.strings.join(' ')).toContain('b."userId"');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('4.2.8 denies request status after unit occupancy is revoked', async () => {
    const { prisma, locations, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{
      id: 'booking', homeId: null, societyUnitId: 'old-unit',
      bookingStatus: 'CONFIRMED', requestedAgentId: 'agent',
    }]);
    locations.resolveLocation.mockRejectedValueOnce(new Error('Occupancy expired'));
    await expect(service.getBookingTechnicianRequestStatus('former-tenant', 'booking'))
      .rejects.toThrow('Occupancy expired');
    expect(locations.resolveLocation).toHaveBeenCalledWith('former-tenant', 'SOCIETY_UNIT', 'old-unit');
  });

  it.each([
    ['none', 'REQUESTED', null, null, 'NO_REQUEST', true],
    ['pending', 'CONFIRMED', 'agent-a', null, 'AWAITING_ASSIGNMENT', true],
    ['matched', 'CONFIRMED', 'agent-a', 'agent-a', 'REQUESTED_TECHNICIAN_ASSIGNED', false],
    ['different', 'IN_PROGRESS', 'agent-a', 'agent-b', 'OTHER_TECHNICIAN_ASSIGNED', false],
    ['released', 'CONFIRMED', 'agent-a', null, 'AWAITING_ASSIGNMENT', true],
    ['cancelled', 'CANCELLED', 'agent-a', null, 'REQUEST_CLOSED', false],
    ['completed', 'COMPLETED', 'agent-a', null, 'REQUEST_CLOSED', false],
    ['completed-with-assignment', 'COMPLETED', 'agent-a', 'agent-a', 'REQUESTED_TECHNICIAN_ASSIGNED', false],
  ])('4.2.8 reconciles %s without claiming preference-driven assignment', async (
    _case, bookingStatus, requestedAgentId, assignedAgentId, expected, canChangeRequest,
  ) => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{
      id: 'booking', homeId: '11111111-1111-4111-8111-111111111111',
      societyUnitId: null, bookingStatus, requestedAgentId, assignedAgentId,
      requestedTechnicianName: requestedAgentId ? 'Ravi' : null,
      assignedTechnicianName: assignedAgentId ? 'Technician B' : null,
      dispatchStatus: assignedAgentId ? 'ASSIGNED' : null,
    }]);
    const status = await service.getBookingTechnicianRequestStatus('resident', 'booking');
    expect(status).toMatchObject({
      requestStatus: expected, canChangeRequest,
      availabilityGuaranteed: false, assignmentByRequestProven: false,
      statusSnapshotOnly: true,
    });
    const sql = sqlText(prisma.$queryRaw.mock.calls[0][0]);
    expect(sql).toContain('LEFT JOIN LATERAL');
    expect(sql).toContain("'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'");
    expect(sql).not.toContain('ag."phone"');
    expect(sql).not.toContain('"addressSnapshot"');
    expect(sql).not.toContain('a."phone"');
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it('4.2.6 rejects a foreign booking preference read without resolving the location', async () => {
    const { prisma, locations, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.getBookingTechnicianPreference('user', 'foreign-booking'))
      .rejects.toThrow('Service booking not found');
    expect(locations.resolveLocation).not.toHaveBeenCalled();
    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: string[]; values: unknown[] };
    expect(query.strings.join(' ')).toContain('b."userId"');
    expect(query.values).toEqual(['foreign-booking', 'user']);
  });

  it('4.2.6 denies mutation after assignment while holding the booking lock', async () => {
    const { prisma, locations, service } = setup();
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([{
      id: 'booking', status: 'CONFIRMED', hasActiveAssignment: true,
    }]), $executeRaw: vi.fn() };
    (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction =
      vi.fn((fn: (client: typeof tx) => unknown) => fn(tx));
    await expect(service.setBookingTechnicianPreference('owner', 'booking', '11111111-1111-4111-8111-111111111111'))
      .rejects.toThrow('Technician request is closed');
    expect(tx.$queryRaw.mock.calls[0][0].strings.join(' ')).toContain('FOR UPDATE OF b');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(locations.resolveLocation).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('4.2.6 denies a technician without own completed visit evidence', async () => {
    const { prisma, locations, service } = setup();
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          id: 'booking', offeringId: 'offering', providerId: 'provider',
          homeId: '11111111-1111-4111-8111-111111111111', societyUnitId: null,
          status: 'REQUESTED', hasActiveAssignment: false,
        }])
        .mockResolvedValueOnce([]),
      $executeRaw: vi.fn(),
    };
    (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction =
      vi.fn((fn: (client: typeof tx) => unknown) => fn(tx));
    await expect(service.setBookingTechnicianPreference(
      'owner', 'booking', '22222222-2222-4222-8222-222222222222',
    )).rejects.toThrow('Technician must have attended your completed visit');
    expect(locations.resolveLocation).toHaveBeenCalledWith(
      'owner', 'HOME', '11111111-1111-4111-8111-111111111111',
    );
    const sql = sqlText(tx.$queryRaw.mock.calls[1][0]);
    for (const fragment of [
      'historical."userId"', 'historical."offeringId"', 'historical."providerId"',
      'historical."homeId"', 'historical."societyUnitId"',
      'a."arrivedAt" IS NOT NULL', 'ag."active" = true',
    ]) expect(sql).toContain(fragment);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('4.2.6 persists an explicitly requested technician with no availability or payment side effects', async () => {
    const { prisma, service } = setup();
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          id: 'booking', offeringId: 'offering', providerId: 'provider',
          homeId: '11111111-1111-4111-8111-111111111111', societyUnitId: null,
          status: 'CONFIRMED', hasActiveAssignment: false,
        }])
        .mockResolvedValueOnce([{ agentId: '22222222-2222-4222-8222-222222222222', displayName: 'Ravi' }])
        .mockResolvedValueOnce([]),
      $executeRaw: vi.fn(),
    };
    (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction =
      vi.fn((fn: (client: typeof tx) => unknown) => fn(tx));
    const result = await service.setBookingTechnicianPreference(
      'owner', 'booking', '22222222-2222-4222-8222-222222222222',
    );
    expect(result).toMatchObject({
      agentId: '22222222-2222-4222-8222-222222222222',
      requestOnly: true, availabilityConfirmed: false, assignmentGuaranteed: false,
    });
    const sql = sqlText(tx.$executeRaw.mock.calls[0][0]);
    expect(sql).toContain('ON CONFLICT ("bookingId")');
    expect(sql).toContain('"ConsumerServiceTechnicianPreference"');
    expect(sql).not.toContain('"ConsumerServiceAssignment"');
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it('4.2.6 refuses mutation when the booking location is no longer accessible', async () => {
    const { prisma, locations, service } = setup();
    const tx = { $queryRaw: vi.fn().mockResolvedValueOnce([{
      id: 'booking', homeId: null, societyUnitId: 'unit-1',
      status: 'REQUESTED', hasActiveAssignment: false,
    }]), $executeRaw: vi.fn() };
    (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction =
      vi.fn((fn: (client: typeof tx) => unknown) => fn(tx));
    locations.resolveLocation.mockRejectedValueOnce(new Error('Occupancy revoked'));
    await expect(service.setBookingTechnicianPreference('former-resident', 'booking', null))
      .rejects.toThrow('Occupancy revoked');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('4.2.6 reads the resident request without sharing agent contact details', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([{
      id: 'booking',
      homeId: '11111111-1111-4111-8111-111111111111', societyUnitId: null,
      agentId: '22222222-2222-4222-8222-222222222222',
      displayName: 'Ravi', technicianRecordActive: true,
    }]);
    const result = await service.getBookingTechnicianPreference('owner', 'booking');
    expect(result).toEqual({
      bookingId: 'booking',
      agentId: '22222222-2222-4222-8222-222222222222',
      displayName: 'Ravi', technicianRecordActive: true,
      requestOnly: true, availabilityConfirmed: false, assignmentGuaranteed: false,
    });
    const sql = sqlText(prisma.$queryRaw.mock.calls[0][0]);
    expect(sql).not.toContain('ag."phone"');
    expect(sql).not.toContain('"addressSnapshot"');
  });

  it('4.2.6 allows clearing an unassigned preference without validating technician history', async () => {
    const { prisma, service } = setup();
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{
        id: 'booking', homeId: '11111111-1111-4111-8111-111111111111',
        societyUnitId: null, status: 'REQUESTED', hasActiveAssignment: false,
      }]),
      $executeRaw: vi.fn(),
    };
    (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction =
      vi.fn((fn: (client: typeof tx) => unknown) => fn(tx));
    const result = await service.setBookingTechnicianPreference('owner', 'booking', null);
    expect(result.agentId).toBeNull();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(sqlText(tx.$executeRaw.mock.calls[0][0])).toContain('"userId"');
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
