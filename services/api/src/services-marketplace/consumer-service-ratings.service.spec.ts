import { describe, expect, it, vi } from 'vitest';
import { ConsumerServiceRatingsService } from './consumer-service-ratings.service';

function setup() {
  const tx = { $queryRaw: vi.fn() };
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (fn: (arg: typeof tx) => unknown) => fn(tx)),
  };
  return {
    prisma,
    tx,
    service: new ConsumerServiceRatingsService(prisma as unknown as ConstructorParameters<typeof ConsumerServiceRatingsService>[0]),
  };
}

describe('ConsumerServiceRatingsService', () => {
  it('allows the booking owner to rate a completed booking once', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 'b', userId: 'u', providerId: 'p', offeringId: 'o', status: 'COMPLETED' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'r', bookingId: 'b', stars: 5 }]);

    const result = await service.createMine(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      5,
      'Great service',
    );

    expect(result).toMatchObject({ id: 'r', stars: 5 });
  });

  it('rejects ratings before completion', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'b', userId: 'u', providerId: 'p', offeringId: 'o', status: 'IN_PROGRESS' }]);

    await expect(service.createMine(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      4,
    )).rejects.toThrow('Only completed services can be rated');
  });

  it('rejects ratings outside the 1 to 5 range', async () => {
    const { service } = setup();
    await expect(service.createMine('u', 'b', 6)).rejects.toThrow('Rating must be an integer from 1 to 5');
  });

  it('returns an existing rating idempotently', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 'b', userId: 'u', providerId: 'p', offeringId: 'o', status: 'COMPLETED' }])
      .mockResolvedValueOnce([{ id: 'existing', bookingId: 'b', stars: 4 }]);

    const result = await service.createMine(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      4,
    );

    expect(result).toMatchObject({ id: 'existing', stars: 4 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('does not expose a rating for a booking owned by someone else', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.getMine(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    )).rejects.toThrow('Consumer booking not found');
  });
});
