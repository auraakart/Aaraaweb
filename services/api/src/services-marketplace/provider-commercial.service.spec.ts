import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProviderCommercialService } from './provider-commercial.service';

describe('ProviderCommercialService', () => {
  function create() {
    const prisma = {
      serviceProvider: { findUnique: vi.fn() },
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
    } as any;
    return { prisma, service: new ProviderCommercialService(prisma) };
  }

  it('rejects paid subscription tiers without a valid time window', async () => {
    const { prisma, service } = create();
    prisma.serviceProvider.findUnique.mockResolvedValue({ id: '11111111-1111-1111-1111-111111111111' });

    await expect(service.set('11111111-1111-1111-1111-111111111111', {
      subscriptionTier: 'PREMIUM',
      placementType: 'NONE',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects featured placement without a complete time window', async () => {
    const { prisma, service } = create();
    prisma.serviceProvider.findUnique.mockResolvedValue({ id: '11111111-1111-1111-1111-111111111111' });

    await expect(service.set('11111111-1111-1111-1111-111111111111', {
      subscriptionTier: 'BASIC',
      placementType: 'FEATURED',
      placementStartsAt: '2026-09-12T00:00:00.000Z',
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('keeps controls unavailable for unknown providers', async () => {
    const { prisma, service } = create();
    prisma.serviceProvider.findUnique.mockResolvedValue(null);

    await expect(service.get('11111111-1111-1111-1111-111111111111')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('persists valid subscription and sponsored windows independently', async () => {
    const { prisma, service } = create();
    prisma.serviceProvider.findUnique.mockResolvedValue({ id: '11111111-1111-1111-1111-111111111111' });
    prisma.$executeRaw.mockResolvedValue(1);
    prisma.$queryRaw.mockResolvedValue([{
      providerId: '11111111-1111-1111-1111-111111111111',
      subscriptionTier: 'GROWTH',
      placementType: 'SPONSORED',
      active: true,
      subscriptionCurrent: true,
      placementCurrent: true,
    }]);

    const result = await service.set('11111111-1111-1111-1111-111111111111', {
      subscriptionTier: 'GROWTH',
      subscriptionStartsAt: '2026-09-11T00:00:00.000Z',
      subscriptionEndsAt: '2026-10-11T00:00:00.000Z',
      placementType: 'SPONSORED',
      placementStartsAt: '2026-09-12T00:00:00.000Z',
      placementEndsAt: '2026-09-19T00:00:00.000Z',
      active: true,
    });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(result.placementType).toBe('SPONSORED');
  });
});
