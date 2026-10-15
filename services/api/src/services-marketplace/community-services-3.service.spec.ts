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

  it('does not allow a terminal or locked campaign to be reopened', async () => {
    const { service, prisma } = setup();

    await expect(service.setCommunityDealStatus('society-1', 'campaign-1', 'OPEN'))
      .rejects.toThrow('Community service deals cannot be reopened');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
