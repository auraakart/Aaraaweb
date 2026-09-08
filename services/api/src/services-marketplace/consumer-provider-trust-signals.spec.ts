import { describe, expect, it, vi } from 'vitest';
import { ConsumerServiceRatingsService } from './consumer-service-ratings.service';

describe('consumer provider trust signals', () => {
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
      },
      {
        providerId: '22222222-2222-2222-2222-222222222222',
        ratingCount: 0,
        averageStars: null,
        completedJobs: 0,
      },
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
