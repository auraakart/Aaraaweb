import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerServiceLocationService } from './consumer-service-location.service';
import { ConsumerServiceMemoryService } from './consumer-service-memory.service';

function sqlText(call: unknown): string {
  return ((call as { strings?: readonly string[] }).strings ?? []).join('?');
}

describe('ConsumerServiceMemoryService', () => {
  const setup = () => {
    const prismaMock = { $queryRaw: vi.fn() };
    const locationsMock = {
      resolveLocation: vi.fn().mockResolvedValue({
        homeId: '11111111-1111-4111-8111-111111111111',
        societyUnitId: null,
        postalCode: '600115',
      }),
    };
    const prisma = prismaMock as unknown as PrismaService;
    const locations = locationsMock as unknown as ConsumerServiceLocationService;
    return {
      prisma: prismaMock,
      locations: locationsMock,
      service: new ConsumerServiceMemoryService(prisma, locations),
    };
  };

  it('upserts a favourite only after provider verification check', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: '22222222-2222-4222-8222-222222222222' }])
      .mockResolvedValueOnce([{ providerId: '22222222-2222-4222-8222-222222222222', active: true }]);

    const result = await service.setFavorite(
      '33333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222',
      true,
    );

    expect(result?.active).toBe(true);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('derives location-scoped history after authorization resolution', async () => {
    const { prisma, locations, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        id: 'booking-1',
        offeringName: 'AC service',
        providerName: 'Care Services',
        ratingStars: 5,
        ratingComment: 'Very good service',
        canRebook: true,
      },
    ]);

    const result = await service.listHistory(
      '33333333-3333-4333-8333-333333333333',
      'HOME',
      '11111111-1111-4111-8111-111111111111',
    );

    expect(locations.resolveLocation).toHaveBeenCalledWith(
      '33333333-3333-4333-8333-333333333333',
      'HOME',
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result).toHaveLength(1);
    const query = sqlText(prisma.$queryRaw.mock.calls[0][0]);
    expect(query).toContain('"ConsumerServiceRating"');
    expect(query).toContain('"ratingStars"');
    expect(query).toContain('"ratingComment"');
    expect(query).toContain('"ConsumerServiceBookingEvent"');
    expect(query).toContain("'COMPLETED'::\"ServiceBookingStatus\"");
  });
});
