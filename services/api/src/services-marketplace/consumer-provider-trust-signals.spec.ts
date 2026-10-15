import { describe, expect, it, vi } from 'vitest';
import {
  ConsumerServiceRatingsService,
  deriveEarnedProviderQualityTier,
} from './consumer-service-ratings.service';

describe('consumer provider trust signals', () => {
  it('derives earned tiers only when evidence thresholds are satisfied', () => {
    expect(deriveEarnedProviderQualityTier(0, 0, null)).toBe('STANDARD');
    expect(deriveEarnedProviderQualityTier(15, 5, 4.19)).toBe('STANDARD');
    expect(deriveEarnedProviderQualityTier(15, 5, 4.2)).toBe('TRUSTED');
    expect(deriveEarnedProviderQualityTier(50, 20, 4.59)).toBe('TRUSTED');
    expect(deriveEarnedProviderQualityTier(50, 20, 4.6)).toBe('PREMIUM');
  });

  it('normalizes verified-provider rating and completion aggregates for API clients', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([
        {
          providerId: '11111111-1111-1111-1111-111111111111',
          ratingCount: 12n,
          averageStars: '4.83',
          completedJobs: 47n,
        },
        {
          providerId: '22222222-2222-2222-2222-222222222222',
          ratingCount: 20n,
          averageStars: '4.70',
          completedJobs: 52n,
        },
        {
          providerId: '33333333-3333-3333-3333-333333333333',
          ratingCount: 0n,
          averageStars: null,
          completedJobs: 0n,
        },
      ]),
    };
    const service = new ConsumerServiceRatingsService(
      prisma as unknown as ConstructorParameters<typeof ConsumerServiceRatingsService>[0],
    );

    await expect(service.providerTrustSummaries()).resolves.toEqual([
      {
        providerId: '11111111-1111-1111-1111-111111111111',
        ratingCount: 12,
        averageStars: 4.83,
        completedJobs: 47,
        earnedQualityTier: 'TRUSTED',
      },
      {
        providerId: '22222222-2222-2222-2222-222222222222',
        ratingCount: 20,
        averageStars: 4.7,
        completedJobs: 52,
        earnedQualityTier: 'PREMIUM',
      },
      {
        providerId: '33333333-3333-3333-3333-333333333333',
        ratingCount: 0,
        averageStars: null,
        completedJobs: 0,
        earnedQualityTier: 'STANDARD',
      },
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
