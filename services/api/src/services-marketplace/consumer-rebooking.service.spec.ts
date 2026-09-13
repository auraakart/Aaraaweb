import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ServiceBookingStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ConsumerRebookingService } from './consumer-rebooking.service';

type RebookingPrisma = ConstructorParameters<typeof ConsumerRebookingService>[0];
type RebookingBookings = ConstructorParameters<typeof ConsumerRebookingService>[1];

const input = {
  scheduledFrom: new Date(Date.now() + 3_600_000),
  scheduledUntil: new Date(Date.now() + 7_200_000),
};

describe('ConsumerRebookingService', () => {
  it('rejects bookings that are not owned/completed', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) } as unknown as RebookingPrisma;
    const bookings = { createBooking: vi.fn() } as unknown as RebookingBookings;
    const service = new ConsumerRebookingService(prisma, bookings);
    await expect(service.rebook('user', 'booking', input)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reuses the original home and offering while delegating all current booking validation', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'booking', userId: 'user', homeId: 'home', societyUnitId: null, offeringId: 'offering', status: ServiceBookingStatus.COMPLETED }]),
    } as unknown as RebookingPrisma;
    const createBooking = vi.fn().mockResolvedValue({ id: 'new-booking' });
    const bookings = { createBooking } as unknown as RebookingBookings;
    const service = new ConsumerRebookingService(prisma, bookings);

    await service.rebook('user', 'booking', input);

    expect(createBooking).toHaveBeenCalledWith('user', expect.objectContaining({ homeId: 'home', offeringId: 'offering' }));
  });

  it('rejects rebooking a non-completed booking', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'booking', userId: 'user', homeId: 'home', societyUnitId: null, offeringId: 'offering', status: ServiceBookingStatus.CONFIRMED }]),
    } as unknown as RebookingPrisma;
    const bookings = { createBooking: vi.fn() } as unknown as RebookingBookings;
    const service = new ConsumerRebookingService(prisma, bookings);
    await expect(service.rebook('user', 'booking', input)).rejects.toBeInstanceOf(BadRequestException);
  });
});
