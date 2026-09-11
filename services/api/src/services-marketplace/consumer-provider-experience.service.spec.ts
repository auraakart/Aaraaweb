import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerProviderExperienceService } from './consumer-provider-experience.service';
import { ConsumerServiceLocationService } from './consumer-service-location.service';

describe('ConsumerProviderExperienceService', () => {
  const setup = () => {
    const prismaMock = { $queryRaw: vi.fn() };
    const locationsMock = {
      resolveLocation: vi.fn().mockResolvedValue({ postalCode: '600115' }),
    };
    const prisma = prismaMock as unknown as PrismaService;
    const locations = locationsMock as unknown as ConsumerServiceLocationService;
    return {
      prisma: prismaMock,
      locations: locationsMock,
      service: new ConsumerProviderExperienceService(prisma, locations),
    };
  };

  it('returns quality and sponsored placement as separate provider signals', async () => {
    const { prisma, locations, service } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'provider-1', businessName: 'Care Services', description: 'Home care' }])
      .mockResolvedValueOnce([
        { id: 'media-1', kind: 'LOGO', publicUrl: 'https://cdn.example/logo.webp', altText: 'Care Services', sortOrder: 0 },
      ])
      .mockResolvedValueOnce([
        {
          id: 'offer-1',
          offeringId: null,
          title: 'Welcome offer',
          description: null,
          discountType: 'PERCENT',
          discountValue: 1000,
          startsAt: new Date('2026-09-01T00:00:00Z'),
          endsAt: new Date('2026-09-30T00:00:00Z'),
          terms: null,
        },
      ])
      .mockResolvedValueOnce([{ qualityTier: 'PREMIUM' }])
      .mockResolvedValueOnce([{ label: 'Sponsored' }]);

    const result = await service.getForLocation('user-1', 'provider-1', 'HOME', 'home-1');

    expect(locations.resolveLocation).toHaveBeenCalledWith('user-1', 'HOME', 'home-1');
    expect(result.provider.businessName).toBe('Care Services');
    expect(result.provider.qualityTier).toBe('PREMIUM');
    expect(result.media).toHaveLength(1);
    expect(result.offers).toHaveLength(1);
    expect(result.promotion).toEqual({ label: 'Sponsored' });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(5);
  });

  it('defaults quality to standard and keeps promotion absent when none is approved', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: 'provider-1', businessName: 'Care Services', description: null }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.getForLocation('user-1', 'provider-1', 'HOME', 'home-1');

    expect(result.provider.qualityTier).toBe('STANDARD');
    expect(result.promotion).toBeNull();
  });

  it('does not expose media or offers when the provider is not serviceable', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.getForLocation('user-1', 'provider-1', 'HOME', 'home-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
