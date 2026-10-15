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

  it('passes the stable retry idempotency key into the authoritative booking engine', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'booking', userId: 'user', homeId: null, societyUnitId: 'unit-1', offeringId: 'offering', status: ServiceBookingStatus.COMPLETED }]),
    } as unknown as RebookingPrisma;
    const createBooking = vi.fn().mockResolvedValue({ id: 'new-booking' });
    const service = new ConsumerRebookingService(prisma, { createBooking } as unknown as RebookingBookings);

    await service.rebook('user', 'booking', { ...input, idempotencyKey: 'retry-key-1234' });

    expect(createBooking).toHaveBeenCalledWith('user', expect.objectContaining({
      locationType: 'SOCIETY_UNIT',
      locationId: 'unit-1',
      offeringId: 'offering',
      idempotencyKey: 'retry-key-1234',
    }));
  });


  it('denies another users recurring plan without calling the booking engine', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) } as unknown as RebookingPrisma;
    const createBooking = vi.fn();
    const service = new ConsumerRebookingService(prisma, { createBooking } as unknown as RebookingBookings);
    await expect(service.bookFromRecurringPlan('user-a', 'plan-b', input))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(createBooking).not.toHaveBeenCalled();
    const q = (prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0][0] as { strings: string[]; values: unknown[] };
    expect(q.strings.join(' ')).toContain('"userId"');
    expect(q.values).toEqual(['plan-b', 'user-a']);
  });

  it('rejects paused and cancelled preferences without creating a booking', async () => {
    for (const status of ['PAUSED', 'CANCELLED']) {
      const prisma = { $queryRaw: vi.fn().mockResolvedValue([{
        id: 'plan', offeringId: 'offering', locationType: 'HOME', locationId: 'home', status,
      }]) } as unknown as RebookingPrisma;
      const createBooking = vi.fn();
      const service = new ConsumerRebookingService(prisma, { createBooking } as unknown as RebookingBookings);
      await expect(service.bookFromRecurringPlan('user', 'plan', input))
        .rejects.toThrow('must be active');
      expect(createBooking).not.toHaveBeenCalled();
    }
  });

  it('reuses the authoritative booking path, location, and retry key for one home visit', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{
      id: 'plan', offeringId: 'offering', locationType: 'HOME', locationId: 'home', status: 'ACTIVE',
    }]) } as unknown as RebookingPrisma;
    const createBooking = vi.fn().mockResolvedValue({ id: 'new-visit', status: 'REQUESTED' });
    const service = new ConsumerRebookingService(prisma, { createBooking } as unknown as RebookingBookings);
    const result = await service.bookFromRecurringPlan('user', 'plan', {
      ...input, notes: 'Kitchen service', idempotencyKey: 'recurrence-once-001',
    });
    expect(result).toEqual({ id: 'new-visit', status: 'REQUESTED' });
    expect(createBooking).toHaveBeenCalledOnce();
    expect(createBooking).toHaveBeenCalledWith('user', {
      locationType: 'HOME', locationId: 'home', offeringId: 'offering',
      scheduledFrom: input.scheduledFrom, scheduledUntil: input.scheduledUntil,
      notes: 'Kitchen service', idempotencyKey: 'recurrence-once-001',
    });
  });

  it('preserves society-unit scoping and revalidates occupancy in the existing booking engine', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{
      id: 'plan', offeringId: 'offering', locationType: 'SOCIETY_UNIT', locationId: 'unit', status: 'ACTIVE',
    }]) } as unknown as RebookingPrisma;
    const createBooking = vi.fn().mockRejectedValue(new NotFoundException('Unit not available'));
    const service = new ConsumerRebookingService(prisma, { createBooking } as unknown as RebookingBookings);
    await expect(service.bookFromRecurringPlan('user', 'plan', input)).rejects.toThrow('Unit not available');
    expect(createBooking).toHaveBeenCalledWith('user', expect.objectContaining({
      locationType: 'SOCIETY_UNIT', locationId: 'unit', offeringId: 'offering',
    }));
  });

  it('rejects invalid service windows without even retrieving a recurring plan', async () => {
    const prisma = { $queryRaw: vi.fn() } as unknown as RebookingPrisma;
    const createBooking = vi.fn();
    const service = new ConsumerRebookingService(prisma, { createBooking } as unknown as RebookingBookings);
    await expect(service.bookFromRecurringPlan('user', 'plan', {
      scheduledFrom: new Date('invalid'), scheduledUntil: new Date('2030-01-01'),
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });


  it('refuses recurring plan visit reads from another consumer', async () => {
    const query = vi.fn().mockResolvedValueOnce([]);
    const service = new ConsumerRebookingService(
      { $queryRaw: query } as unknown as RebookingPrisma,
      { createBooking: vi.fn() } as unknown as RebookingBookings,
    );
    await expect(service.listMatchingRecurringVisits('other-user', 'plan'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect((query.mock.calls[0][0] as { values: unknown[] }).values).toEqual(['plan', 'other-user']);
  });

  it('scopes actual visits to the same owner, offering and home, even for paused plans', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{id:'plan',offeringId:'offer',locationType:'HOME',locationId:'home',status:'PAUSED'}])
      .mockResolvedValueOnce([{bookingId:'booking',status:ServiceBookingStatus.CONFIRMED,
        scheduledFrom:new Date('2030-01-02'),scheduledUntil:new Date('2030-01-03')}]);
    const service = new ConsumerRebookingService(
      { $queryRaw: query } as unknown as RebookingPrisma,
      { createBooking: vi.fn() } as unknown as RebookingBookings,
    );
    const result = await service.listMatchingRecurringVisits('owner','plan');
    expect(result).toEqual(expect.objectContaining({
      planStatus:'PAUSED',planOriginVerified:false,automaticallyScheduled:false,recordsLimitedTo:25,
    }));
    expect(result.visits).toHaveLength(1);
    const sqlQuery = query.mock.calls[1][0] as { strings:string[];values:unknown[] };
    const sql=sqlQuery.strings.join(' ');
    expect(sql).toContain('b."userId"');
    expect(sql).toContain('b."offeringId"');
    expect(sql).toContain('b."homeId"');
    expect(sql).toContain('b."societyUnitId"');
    expect(sql).toContain('LIMIT 25');
    expect(sql).not.toContain('"addressSnapshot"');
    expect(sqlQuery.values).toEqual(['owner','offer','HOME','home','HOME','home']);
  });

  it('uses the society-unit predicate for the same resident and plan references', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{id:'plan',offeringId:'offer',locationType:'SOCIETY_UNIT',locationId:'unit',status:'ACTIVE'}])
      .mockResolvedValueOnce([]);
    const service = new ConsumerRebookingService(
      { $queryRaw: query } as unknown as RebookingPrisma,
      { createBooking: vi.fn() } as unknown as RebookingBookings,
    );
    const result = await service.listMatchingRecurringVisits('resident','plan');
    expect(result.visits).toEqual([]);
    expect(result.planOriginVerified).toBe(false);
    expect((query.mock.calls[1][0] as { values:unknown[] }).values)
      .toEqual(['resident','offer','SOCIETY_UNIT','unit','SOCIETY_UNIT','unit']);
  });

  it('fails closed on unsupported plan location types', async () => {
    const query=vi.fn().mockResolvedValueOnce([
      {id:'plan',offeringId:'offer',locationType:'EXTERNAL',locationId:'invalid',status:'ACTIVE'},
    ]);
    const service = new ConsumerRebookingService(
      { $queryRaw: query } as unknown as RebookingPrisma,
      { createBooking: vi.fn() } as unknown as RebookingBookings,
    );
    await expect(service.listMatchingRecurringVisits('user','plan'))
      .rejects.toThrow('Unsupported recurring service location');
    expect(query).toHaveBeenCalledTimes(1);
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
