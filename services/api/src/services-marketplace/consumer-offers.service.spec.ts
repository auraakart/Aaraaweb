import { describe, expect, it, vi } from 'vitest';
import { ConsumerOffersService } from './consumer-offers.service';

describe('ConsumerOffersService', () => {
  it('resolves the authenticated location before returning offers', async () => {
    const rows = [{
      id: 'offer-1',
      providerId: 'provider-1',
      providerName: 'CoolCare',
      offeringId: 'offering-1',
      offeringName: 'AC service',
      categoryId: 'category-1',
      categoryName: 'AC & Appliances',
      title: 'Summer service offer',
      description: null,
      discountType: 'PERCENT',
      discountValue: 1000,
      startsAt: new Date('2026-09-01T00:00:00Z'),
      endsAt: new Date('2026-09-30T00:00:00Z'),
      terms: null,
    }];
    const prisma = { $queryRaw: vi.fn().mockResolvedValue(rows) };
    const locations = {
      resolveLocation: vi.fn().mockResolvedValue({ postalCode: '600115' }),
    };
    const service = new ConsumerOffersService(prisma as never, locations as never);

    await expect(service.listForLocation('user-1', 'HOME', 'home-1')).resolves.toEqual(rows);
    expect(locations.resolveLocation).toHaveBeenCalledWith('user-1', 'HOME', 'home-1');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('does not query offers when the requested location is not authorized', async () => {
    const prisma = { $queryRaw: vi.fn() };
    const locations = {
      resolveLocation: vi.fn().mockRejectedValue(new Error('Active home not found')),
    };
    const service = new ConsumerOffersService(prisma as never, locations as never);

    await expect(service.listForLocation('user-1', 'HOME', 'other-home')).rejects.toThrow('Active home not found');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
