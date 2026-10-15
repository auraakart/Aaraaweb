import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CommunityServices3Service } from './community-services-3.service';

function setup() {
  const tx = {
    $queryRaw: vi.fn(),
  };
  const prisma = {
    serviceOffering: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const operators = { resolveProvider: vi.fn() };
  const locations = {
    resolveLocation: vi.fn(),
    listServiceableOfferings: vi.fn(),
  };
  const service = new CommunityServices3Service(prisma as never, operators as never, locations as never);
  return { service, prisma, operators, locations, tx };
}

describe('CommunityServices3Service', () => {
  it('fails closed when a provider reads a service promise for another provider offering', async () => {
    const { service, prisma, operators } = setup();
    operators.resolveProvider.mockResolvedValue({ providerId: 'provider-1' });
    prisma.serviceOffering.findFirst.mockResolvedValue(null);

    await expect(service.getMyOfferingExperiencePolicy('user-1', 'offering-2'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not create a recurring preference for a cadence the provider did not enable', async () => {
    const { service, prisma, locations } = setup();
    locations.resolveLocation.mockResolvedValue({
      type: 'HOME',
      id: 'home-1',
      homeId: 'home-1',
      societyUnitId: null,
      societyId: null,
      label: 'Home',
      postalCode: '600001',
    });
    locations.listServiceableOfferings.mockResolvedValue([{ id: 'offering-1' }]);
    prisma.$queryRaw.mockResolvedValue([{ recurrenceCadences: ['MONTHLY'] }]);

    await expect(service.createRecurringPlan('user-1', {
      offeringId: 'offering-1',
      locationType: 'HOME',
      locationId: 'home-1',
      cadence: 'WEEKLY',
    })).rejects.toThrow('Provider has not enabled this recurring cadence');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a community resident price above the normal service price', async () => {
    const { service, prisma } = setup();
    prisma.serviceOffering.findFirst.mockResolvedValue({ id: 'offering-1', pricePaise: 50000 });

    await expect(service.createCommunityDeal('society-1', 'admin-1', {
      offeringId: 'offering-1',
      title: 'AC Service Day',
      serviceDate: new Date(Date.now() + 172800000),
      joinEndsAt: new Date(Date.now() + 86400000),
      thresholdHomes: 5,
      residentPricePaise: 55000,
    })).rejects.toThrow('Community resident price must be between zero and the normal service price');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('serializes withdrawal against a locked campaign and refuses the mutation', async () => {
    const { service, locations, tx } = setup();
    locations.resolveLocation.mockResolvedValue({
      type: 'SOCIETY_UNIT',
      id: 'unit-1',
      homeId: null,
      societyUnitId: 'unit-1',
      societyId: 'society-1',
      label: 'A-101',
      postalCode: '600001',
    });
    tx.$queryRaw.mockResolvedValueOnce([{ societyId: 'society-1', status: 'LOCKED' }]);

    await expect(service.withdrawCommunityDeal('user-1', 'campaign-1', 'SOCIETY_UNIT', 'unit-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });


  it('does not query campaign data for a home outside an accessible society unit', async () => {
    const { service, prisma, locations } = setup();
    locations.resolveLocation.mockResolvedValue({
      type: 'HOME', id: 'home-1', societyId: null, societyUnitId: null,
    });
    await expect(service.getCommunityDealParticipation('user-1', 'campaign-1', 'HOME', 'home-1'))
      .rejects.toThrow('requires an accessible society unit');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('enforces society membership before reading campaign participation', async () => {
    const { service, prisma, locations } = setup();
    locations.resolveLocation.mockResolvedValue({
      type: 'SOCIETY_UNIT', societyId: 'society-1', societyUnitId: 'unit-1',
    });
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.getCommunityDealParticipation('user-1', 'foreign-campaign', 'SOCIETY_UNIT', 'unit-1'))
      .rejects.toBeInstanceOf(NotFoundException);
    const q = prisma.$queryRaw.mock.calls[0][0] as { strings: string[]; values: unknown[] };
    expect(q.strings.join(' ')).toContain('c."societyId"');
    expect(q.strings.join(' ')).toContain('own."unitId"');
    expect(q.values).toEqual(['unit-1', 'foreign-campaign', 'society-1']);
  });

  it('reports joined threshold without claiming a booked or chargeable service', async () => {
    const { service, prisma, locations } = setup();
    locations.resolveLocation.mockResolvedValue({
      type: 'SOCIETY_UNIT', societyId: 'society-1', societyUnitId: 'unit-1',
    });
    prisma.$queryRaw.mockResolvedValueOnce([{
      campaignId: 'campaign-1', status: 'LOCKED',
      serviceDate: new Date('2030-02-01'), joinEndsAt: new Date('2030-01-20'),
      thresholdHomes: 5, maxHomes: 20, residentPricePaise: 50000,
      joinedHomes: 7, participationStatus: 'JOINED',
    }]);
    const outcome = await service.getCommunityDealParticipation('user-1', 'campaign-1', 'SOCIETY_UNIT', 'unit-1');
    expect(outcome).toEqual(expect.objectContaining({
      thresholdMet: true, joinedByThisHome: true,
      participationStatus: 'JOINED', interestOnly: true,
      bookingConfirmed: false, paymentAuthorized: false,
      serviceGuaranteed: false, confirmationRequired: true,
    }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('distinguishes withdrawn or unjoined households from actual bookings', async () => {
    const { service, prisma, locations } = setup();
    locations.resolveLocation.mockResolvedValue({
      type: 'SOCIETY_UNIT', societyId: 'society-1', societyUnitId: 'unit-1',
    });
    prisma.$queryRaw.mockResolvedValueOnce([{
      campaignId: 'campaign-1', status: 'OPEN',
      serviceDate: new Date('2030-02-01'), joinEndsAt: new Date('2030-01-20'),
      thresholdHomes: 5, maxHomes: null, residentPricePaise: 50000,
      joinedHomes: 2, participationStatus: 'WITHDRAWN',
    }]);
    const outcome = await service.getCommunityDealParticipation('user-1','campaign-1','SOCIETY_UNIT','unit-1');
    expect(outcome.thresholdMet).toBe(false);
    expect(outcome.joinedByThisHome).toBe(false);
    expect(outcome.participationStatus).toBe('WITHDRAWN');
    expect(outcome.bookingConfirmed).toBe(false);
  });

  it('4.2.4 refuses to lock below the JOINED household threshold after locking the campaign', async () => {
    const { service, tx } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ status: 'OPEN', thresholdHomes: 3, serviceDate: new Date('2035-01-20') }])
      .mockResolvedValueOnce([{ joinedHomes: 2 }]);

    await expect(service.setCommunityDealStatus('society-1', 'campaign-1', 'LOCKED'))
      .rejects.toThrow('household threshold has not been met');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2); // no UPDATE
    const lock = tx.$queryRaw.mock.calls[0][0] as { strings: string[]; values: unknown[] };
    expect(lock.strings.join(' ')).toContain('FOR UPDATE');
    expect(lock.values).toEqual(['campaign-1', 'society-1']);
    const count = tx.$queryRaw.mock.calls[1][0] as { strings: string[]; values: unknown[] };
    expect(count.strings.join(' ')).toContain('i."societyId"');
    expect(count.strings.join(' ')).toContain('i."status" = \'JOINED\'');
    expect(count.values).toEqual(['campaign-1', 'society-1']);
  });

  it('4.2.4 locks a threshold-qualified campaign without booking, charging or sending invitations', async () => {
    const { service, tx, prisma } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ status: 'OPEN', thresholdHomes: 3, serviceDate: new Date('2035-01-20') }])
      .mockResolvedValueOnce([{ joinedHomes: 3 }])
      .mockResolvedValueOnce([{ id: 'campaign-1', status: 'LOCKED' }]);

    await expect(service.setCommunityDealStatus('society-1', 'campaign-1', 'LOCKED'))
      .resolves.toMatchObject({ status: 'LOCKED' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect((tx.$queryRaw.mock.calls[2][0] as { strings: string[] }).strings.join(' '))
      .toContain('UPDATE "CommunityServiceCampaign"');
    expect(prisma.serviceOffering.findFirst).not.toHaveBeenCalled();
  });

  it('4.2.4 rejects locking a past-service-date deal before counting interest', async () => {
    const { service, tx } = setup();
    tx.$queryRaw.mockResolvedValueOnce([
      { status: 'OPEN', thresholdHomes: 3, serviceDate: new Date('2020-01-20') },
    ]);
    await expect(service.setCommunityDealStatus('society-1', 'campaign-1', 'LOCKED'))
      .rejects.toThrow('service date has passed');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('4.2.4 preserves permitted cancellation without requiring the JOINED threshold', async () => {
    const { service, tx } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ status: 'OPEN', thresholdHomes: 10, serviceDate: new Date('2035-01-20') }])
      .mockResolvedValueOnce([{ id: 'campaign-1', status: 'CANCELLED' }]);
    await expect(service.setCommunityDealStatus('society-1', 'campaign-1', 'CANCELLED'))
      .resolves.toMatchObject({ status: 'CANCELLED' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('does not allow a terminal or locked campaign to be reopened', async () => {
    const { service, prisma } = setup();

    await expect(service.setCommunityDealStatus('society-1', 'campaign-1', 'OPEN'))
      .rejects.toThrow('Community service deals cannot be reopened');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
