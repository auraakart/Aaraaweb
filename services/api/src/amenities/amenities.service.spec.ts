import { ConflictException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AmenitiesService } from './amenities.service';

describe('AmenitiesService', () => {
  const queryRaw = vi.fn();
  const transaction = vi.fn();
  const prisma = {
    $queryRaw: queryRaw,
    $transaction: transaction,
  } as unknown as PrismaService;

  let service: AmenitiesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AmenitiesService(prisma);
  });

  it('rejects a booking for a unit outside the resident property context', async () => {
    queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.createBooking('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', {
        unitId: '44444444-4444-4444-8444-444444444444',
        startsAt: '2099-01-01T10:00:00.000Z',
        endsAt: '2099-01-01T11:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects an overlapping booking when configured capacity is exhausted', async () => {
    queryRaw.mockResolvedValueOnce([{ allowed: true }]);

    const txQueryRaw = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: '33333333-3333-4333-8333-333333333333',
        societyId: '11111111-1111-4111-8111-111111111111',
        code: 'CLUBHOUSE',
        name: 'Clubhouse',
        description: null,
        location: null,
        schedule: {},
        bookingRules: {},
        feePaise: 50000,
        currency: 'INR',
        requiresApproval: true,
        slotMinutes: 60,
        maxConcurrentBookings: 1,
        active: true,
      }])
      .mockResolvedValueOnce([{ count: 1 }]);

    transaction.mockImplementationOnce(async (callback: (tx: { $queryRaw: typeof txQueryRaw }) => Promise<unknown>) =>
      callback({ $queryRaw: txQueryRaw }),
    );

    await expect(
      service.createBooking('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', {
        unitId: '44444444-4444-4444-8444-444444444444',
        startsAt: '2099-01-01T10:00:00.000Z',
        endsAt: '2099-01-01T11:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('auto-confirms an available booking when approval is not required', async () => {
    queryRaw.mockResolvedValueOnce([{ allowed: true }]);

    const booking = { id: '55555555-5555-4555-8555-555555555555', status: 'CONFIRMED', feePaise: 0 };
    const txQueryRaw = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: '33333333-3333-4333-8333-333333333333',
        societyId: '11111111-1111-4111-8111-111111111111',
        code: 'GYM',
        name: 'Gym',
        description: null,
        location: null,
        schedule: {},
        bookingRules: {},
        feePaise: 0,
        currency: 'INR',
        requiresApproval: false,
        slotMinutes: 60,
        maxConcurrentBookings: 2,
        active: true,
      }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([booking]);

    transaction.mockImplementationOnce(async (callback: (tx: { $queryRaw: typeof txQueryRaw }) => Promise<unknown>) =>
      callback({ $queryRaw: txQueryRaw }),
    );

    await expect(
      service.createBooking('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', {
        unitId: '44444444-4444-4444-8444-444444444444',
        startsAt: '2099-01-01T10:00:00.000Z',
        endsAt: '2099-01-01T11:00:00.000Z',
      }),
    ).resolves.toEqual(booking);
  });
});
