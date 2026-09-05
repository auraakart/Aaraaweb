import { describe, expect, it, vi } from 'vitest';
import { ProviderSocietyStatus, ProviderVerificationStatus } from '@prisma/client';
import { ServicesMarketplaceOperationsService } from './services-marketplace-operations.service';

function setup() {
  const prisma = {
    serviceRating: { groupBy: vi.fn().mockResolvedValue([]) },
    serviceBooking: { groupBy: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    serviceOffering: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    serviceProvider: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    serviceProviderSociety: { findUnique: vi.fn(), update: vi.fn() },
  };
  return { prisma, service: new ServicesMarketplaceOperationsService(prisma as never) };
}

describe('ServicesMarketplaceOperationsService', () => {
  it('adds society-scoped reputation metrics to provider payloads', async () => {
    const { prisma, service } = setup();
    prisma.serviceRating.groupBy.mockResolvedValue([{ providerId: 'p1', _avg: { score: 4.76 }, _count: { _all: 12 } }]);
    prisma.serviceBooking.groupBy.mockResolvedValue([{ providerId: 'p1', _count: { _all: 41 } }]);

    const result = await service.enrichOfferings('s1', [{ providerId: 'p1', provider: { id: 'p1', businessName: 'CoolCare' } }]);

    expect(result[0].provider).toMatchObject({ ratingAverage: 4.8, ratingCount: 12, completedJobs: 41 });
    expect(prisma.serviceRating.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ societyId: 's1' }) }));
  });

  it('rejects overlapping provider bookings in the same society', async () => {
    const { prisma, service } = setup();
    prisma.serviceOffering.findFirst.mockResolvedValue({ providerId: 'p1' });
    prisma.serviceBooking.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(service.assertProviderAvailable('s1', 'o1', new Date('2026-09-06T10:00:00Z'), new Date('2026-09-06T11:00:00Z')))
      .rejects.toThrow('not available');
    expect(prisma.serviceBooking.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ societyId: 's1', providerId: 'p1' }),
    }));
  });

  it('allows non-overlapping provider bookings', async () => {
    const { prisma, service } = setup();
    prisma.serviceOffering.findFirst.mockResolvedValue({ providerId: 'p1' });
    prisma.serviceBooking.findFirst.mockResolvedValue(null);
    await expect(service.assertProviderAvailable('s1', 'o1', new Date('2026-09-06T10:00:00Z'), new Date('2026-09-06T11:00:00Z'))).resolves.toBeUndefined();
  });

  it('suspends a provider globally and deactivates it', async () => {
    const { prisma, service } = setup();
    prisma.serviceProvider.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.serviceProvider.update.mockResolvedValue({ id: 'p1', verification: 'SUSPENDED', active: false });

    await service.setPlatformVerification('p1', ProviderVerificationStatus.SUSPENDED);

    expect(prisma.serviceProvider.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { verification: ProviderVerificationStatus.SUSPENDED, active: false },
    }));
  });

  it('requires platform verification before society approval', async () => {
    const { prisma, service } = setup();
    prisma.serviceProvider.findFirst.mockResolvedValue(null);
    await expect(service.setSocietyStatus('s1', 'p1', ProviderSocietyStatus.APPROVED)).rejects.toThrow('platform-verified');
  });

  it('suspends a provider only within the selected society', async () => {
    const { prisma, service } = setup();
    prisma.serviceProviderSociety.findUnique.mockResolvedValue({ id: 'link', commissionBps: 1000 });
    prisma.serviceProviderSociety.update.mockResolvedValue({ id: 'link', status: 'SUSPENDED' });

    await service.setSocietyStatus('s1', 'p1', ProviderSocietyStatus.SUSPENDED);

    expect(prisma.serviceProviderSociety.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { societyId_providerId: { societyId: 's1', providerId: 'p1' } },
      data: expect.objectContaining({ status: ProviderSocietyStatus.SUSPENDED }),
    }));
  });
});
