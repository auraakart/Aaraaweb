import { describe, expect, it, vi } from 'vitest';
import { ServiceProviderSocietyTrustService } from './service-provider-society-trust.service';

describe('ServiceProviderSocietyTrustService', () => {
  it('earns Society Trusted only from sufficient local quality evidence', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          providerId: 'provider-1',
          completedJobs: 12,
          cancelledJobs: 1,
          ratingAverage: 4.7,
          ratingCount: 9,
          arrivalSamples: 8,
          onTimeArrivals: 7,
          societyApproved: true,
        },
      ]),
    };
    const service = new ServiceProviderSocietyTrustService(prisma as never);
    const signals = await service.getSignals('society-1', ['provider-1']);
    const signal = signals.get('provider-1');

    expect(signal?.societyTrusted).toBe(true);
    expect(signal?.societyCompletedJobs).toBe(12);
    expect(signal?.societyRatingAverage).toBe(4.7);
    expect(signal?.societyCancellationRate).toBeLessThan(0.15);
    expect(signal?.societyOnTimeRate).toBeGreaterThan(0.8);
  });

  it('removes Society Trusted when current society approval is no longer active', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          providerId: 'provider-3',
          completedJobs: 20,
          cancelledJobs: 0,
          ratingAverage: 4.9,
          ratingCount: 18,
          arrivalSamples: 10,
          onTimeArrivals: 10,
          societyApproved: false,
        },
      ]),
    };
    const service = new ServiceProviderSocietyTrustService(prisma as never);
    const signal = (await service.getSignals('society-1', ['provider-3'])).get('provider-3');
    expect(signal?.societyTrusted).toBe(false);
  });

  it('fails closed for thin local evidence', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          providerId: 'provider-2',
          completedJobs: 2,
          cancelledJobs: 0,
          ratingAverage: 5,
          ratingCount: 2,
          arrivalSamples: 2,
          onTimeArrivals: 2,
          societyApproved: true,
        },
      ]),
    };
    const service = new ServiceProviderSocietyTrustService(prisma as never);
    const signal = (await service.getSignals('society-1', ['provider-2'])).get('provider-2');
    expect(signal?.societyTrusted).toBe(false);
  });

  it('does not query when there are no providers', async () => {
    const prisma = { $queryRaw: vi.fn() };
    const service = new ServiceProviderSocietyTrustService(prisma as never);
    expect((await service.getSignals('society-1', [])).size).toBe(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
