import { describe, expect, it, vi } from 'vitest';
import { ServiceBookingRatingService } from './service-booking-rating.service';

function setup() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    serviceBooking: { findFirst: vi.fn() },
    serviceRating: { findUnique: vi.fn(), create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn().mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx)),
  };
  return {
    tx,
    prisma,
    service: new ServiceBookingRatingService(prisma as never),
  };
}

describe('ServiceBookingRatingService', () => {
  it('creates one rating for a completed resident-owned booking under the booking lock', async () => {
    const { tx, prisma, service } = setup();
    tx.serviceBooking.findFirst.mockResolvedValue({ id: 'booking-1', providerId: 'provider-1', status: 'COMPLETED' });
    tx.serviceRating.findUnique.mockResolvedValue(null);
    tx.serviceRating.create.mockResolvedValue({ id: 'rating-1', bookingId: 'booking-1', score: 5 });

    const result = await service.rateMine('society-1', 'resident-1', 'booking-1', 5, ' Great service ');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.serviceBooking.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'booking-1', societyId: 'society-1', residentUserId: 'resident-1' },
    }));
    expect(tx.serviceRating.create).toHaveBeenCalledWith({
      data: {
        societyId: 'society-1', bookingId: 'booking-1', providerId: 'provider-1',
        residentUserId: 'resident-1', score: 5, comment: 'Great service',
      },
    });
    expect(result).toMatchObject({ id: 'rating-1' });
  });

  it('returns the existing rating on a repeated submission instead of creating a duplicate', async () => {
    const { tx, service } = setup();
    tx.serviceBooking.findFirst.mockResolvedValue({ id: 'booking-1', providerId: 'provider-1', status: 'COMPLETED' });
    tx.serviceRating.findUnique.mockResolvedValue({ id: 'rating-1', bookingId: 'booking-1', score: 4 });

    await expect(service.rateMine('society-1', 'resident-1', 'booking-1', 5)).resolves.toMatchObject({ id: 'rating-1', score: 4 });
    expect(tx.serviceRating.create).not.toHaveBeenCalled();
  });

  it('rejects rating before completion and overlong comments', async () => {
    const { tx, service } = setup();
    tx.serviceBooking.findFirst.mockResolvedValue({ id: 'booking-1', providerId: 'provider-1', status: 'CONFIRMED' });
    await expect(service.rateMine('society-1', 'resident-1', 'booking-1', 5)).rejects.toThrow('Only completed services can be rated');
    await expect(service.rateMine('society-1', 'resident-1', 'booking-1', 5, 'x'.repeat(1001))).rejects.toThrow('1000 characters');
  });
});
