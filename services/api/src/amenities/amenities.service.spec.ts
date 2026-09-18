import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
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

  it('returns the existing booking for an exact idempotent retry', async () => {
    queryRaw.mockResolvedValueOnce([{ allowed: true }]);
    const start = new Date('2099-01-01T10:00:00.000Z');
    const end = new Date('2099-01-01T11:00:00.000Z');
    const existing = { id: '55555555-5555-4555-8555-555555555555', amenityId: '33333333-3333-4333-8333-333333333333', unitId: '44444444-4444-4444-8444-444444444444', startsAt: start, endsAt: end };
    const replay = { ...existing, status: 'CONFIRMED', idempotencyKey: 'amenity-retry-1' };
    const txQueryRaw = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([replay]);
    transaction.mockImplementationOnce(async (callback: (tx: { $queryRaw: typeof txQueryRaw }) => Promise<unknown>) => callback({ $queryRaw: txQueryRaw }));

    await expect(service.createBooking(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      existing.amenityId,
      { unitId: existing.unitId, startsAt: start.toISOString(), endsAt: end.toISOString(), idempotencyKey: 'amenity-retry-1' },
    )).resolves.toEqual(replay);
    expect(txQueryRaw).toHaveBeenCalledTimes(3);
  });

  it('rejects reuse of an idempotency key for another booking payload', async () => {
    queryRaw.mockResolvedValueOnce([{ allowed: true }]);
    const txQueryRaw = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: '55555555-5555-4555-8555-555555555555',
        amenityId: '99999999-9999-4999-8999-999999999999',
        unitId: '44444444-4444-4444-8444-444444444444',
        startsAt: new Date('2099-01-01T10:00:00.000Z'),
        endsAt: new Date('2099-01-01T11:00:00.000Z'),
      }]);
    transaction.mockImplementationOnce(async (callback: (tx: { $queryRaw: typeof txQueryRaw }) => Promise<unknown>) => callback({ $queryRaw: txQueryRaw }));

    await expect(service.createBooking(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      { unitId: '44444444-4444-4444-8444-444444444444', startsAt: '2099-01-01T10:00:00.000Z', endsAt: '2099-01-01T11:00:00.000Z', idempotencyKey: 'amenity-retry-1' },
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows an amenity manager to revoke an active booking with audit evidence', async () => {
    const revoked = { id: '55555555-5555-4555-8555-555555555555', status: 'CANCELLED', reviewNote: 'Revoked: Maintenance closure' };
    const txQueryRaw = vi.fn().mockResolvedValueOnce([{ id: revoked.id }]).mockResolvedValueOnce([revoked]);
    transaction.mockImplementationOnce(async (callback: (tx: { $queryRaw: typeof txQueryRaw }) => Promise<unknown>) => callback({ $queryRaw: txQueryRaw }));

    await expect(service.revoke(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      revoked.id,
      'Maintenance closure',
    )).resolves.toEqual(revoked);
    const sql = (txQueryRaw.mock.calls[0][0] as readonly string[]).join(' ');
    expect(sql).toContain('"status"=\'CANCELLED\'');
    expect(sql).toContain('"reviewedByUserId"=');
  });

  it('enforces minimum booking lead time', async () => {
    queryRaw.mockResolvedValueOnce([{ allowed: true }]);
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const txQueryRaw = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: '33333333-3333-4333-8333-333333333333', societyId: '11111111-1111-4111-8111-111111111111', code: 'COURT', name: 'Court',
        description: null, location: null, schedule: {}, bookingRules: { minAdvanceMinutes: 120 }, feePaise: 0, currency: 'INR',
        requiresApproval: false, slotMinutes: 60, maxConcurrentBookings: 1, active: true,
      }]);
    transaction.mockImplementationOnce(async (callback: (tx: { $queryRaw: typeof txQueryRaw }) => Promise<unknown>) => callback({ $queryRaw: txQueryRaw }));

    await expect(service.createBooking(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      { unitId: '44444444-4444-4444-8444-444444444444', startsAt: start.toISOString(), endsAt: end.toISOString() },
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces per-unit future booking limits', async () => {
    queryRaw.mockResolvedValueOnce([{ allowed: true }]);
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const txQueryRaw = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: '33333333-3333-4333-8333-333333333333', societyId: '11111111-1111-4111-8111-111111111111', code: 'HALL', name: 'Hall',
        description: null, location: null, schedule: {}, bookingRules: { maxFutureBookingsPerUnit: 1 }, feePaise: 0, currency: 'INR',
        requiresApproval: false, slotMinutes: 60, maxConcurrentBookings: 1, active: true,
      }])
      .mockResolvedValueOnce([{ count: 1 }]);
    transaction.mockImplementationOnce(async (callback: (tx: { $queryRaw: typeof txQueryRaw }) => Promise<unknown>) => callback({ $queryRaw: txQueryRaw }));

    await expect(service.createBooking(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      { unitId: '44444444-4444-4444-8444-444444444444', startsAt: start.toISOString(), endsAt: end.toISOString() },
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces cancellation cutoffs', async () => {
    const start = new Date(Date.now() + 30 * 60 * 1000);
    const txQueryRaw = vi.fn().mockResolvedValueOnce([{ startsAt: start, bookingRules: { cancellationCutoffMinutes: 60 } }]);
    transaction.mockImplementationOnce(async (callback: (tx: { $queryRaw: typeof txQueryRaw }) => Promise<unknown>) => callback({ $queryRaw: txQueryRaw }));

    await expect(service.cancelMine(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '55555555-5555-4555-8555-555555555555',
    )).rejects.toBeInstanceOf(ConflictException);
    expect(txQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects structural amenity changes while future active bookings exist', async () => {
    const existing = {
      id: '33333333-3333-4333-8333-333333333333',
      societyId: '11111111-1111-4111-8111-111111111111',
      code: 'POOL',
      name: 'Pool',
      description: null,
      location: null,
      schedule: {},
      bookingRules: {},
      feePaise: 0,
      currency: 'INR',
      requiresApproval: false,
      slotMinutes: 60,
      maxConcurrentBookings: 1,
      active: true,
    };
    const txQueryRaw = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([{ count: 1 }]);
    transaction.mockImplementationOnce(async (callback: (tx: { $queryRaw: typeof txQueryRaw }) => Promise<unknown>) => callback({ $queryRaw: txQueryRaw }));

    await expect(service.updateAmenity(
      existing.societyId,
      existing.id,
      {
        name: 'Pool',
        feePaise: 0,
        requiresApproval: false,
        slotMinutes: 90,
        maxConcurrentBookings: 1,
        active: true,
      },
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows non-structural amenity edits without disturbing future bookings', async () => {
    const existing = {
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
    };
    const updated = { ...existing, name: 'Fitness Centre', feePaise: 10000, active: false };
    const txQueryRaw = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([updated]);
    transaction.mockImplementationOnce(async (callback: (tx: { $queryRaw: typeof txQueryRaw }) => Promise<unknown>) => callback({ $queryRaw: txQueryRaw }));

    await expect(service.updateAmenity(
      existing.societyId,
      existing.id,
      {
        name: 'Fitness Centre',
        feePaise: 10000,
        requiresApproval: false,
        slotMinutes: 60,
        maxConcurrentBookings: 2,
        active: false,
      },
    )).resolves.toEqual(updated);

    expect(txQueryRaw).toHaveBeenCalledTimes(3);
  });
});
