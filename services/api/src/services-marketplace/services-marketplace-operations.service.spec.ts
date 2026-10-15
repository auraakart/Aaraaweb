import { describe, expect, it, vi } from 'vitest';
import { ProviderSocietyStatus, ProviderVerificationStatus } from '@prisma/client';
import { ServicesMarketplaceOperationsService } from './services-marketplace-operations.service';

function setup() {
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    serviceBooking: { findFirst: vi.fn() },
    serviceOffering: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    serviceProvider: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    serviceProviderSociety: { findUnique: vi.fn(), update: vi.fn() },
  };
  const societyTrust = { getSignals: vi.fn().mockResolvedValue(new Map()) };
  return { prisma, societyTrust, service: new ServicesMarketplaceOperationsService(prisma as never, societyTrust as never) };
}

describe('ServicesMarketplaceOperationsService', () => {
  it('adds society-scoped trust evidence and offering experience policy to provider payloads', async () => {
    const { prisma, societyTrust, service } = setup();
    societyTrust.getSignals.mockResolvedValue(new Map([['p1', {
      providerId: 'p1',
      societyCompletedJobs: 41,
      societyCancelledJobs: 2,
      societyRatingAverage: 4.8,
      societyRatingCount: 12,
      societyCancellationRate: 0.047,
      societyArrivalSamples: 10,
      societyOnTimeRate: 0.9,
      societyTrusted: true,
    }]]));
    prisma.$queryRaw.mockResolvedValue([{
      offeringId: 'o1',
      quickServiceEligible: true,
      targetArrivalMinutes: 60,
      includedWork: 'Inspection and labour',
      partsPolicy: 'Parts quoted separately',
      extraWorkApprovalRequired: true,
      recurrenceCadences: ['MONTHLY'],
    }]);

    const result = await service.enrichOfferings('s1', [{
      id: 'o1',
      providerId: 'p1',
      provider: { id: 'p1', businessName: 'CoolCare' },
    }]);

    expect(result[0].provider).toMatchObject({
      ratingAverage: 4.8,
      ratingCount: 12,
      completedJobs: 41,
      societyTrusted: true,
    });
    expect(result[0].experiencePolicy).toMatchObject({ quickServiceEligible: true, targetArrivalMinutes: 60 });
    expect(societyTrust.getSignals).toHaveBeenCalledWith('s1', ['p1']);
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
