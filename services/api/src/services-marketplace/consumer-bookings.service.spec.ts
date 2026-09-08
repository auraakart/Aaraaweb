import { describe, expect, it, vi } from 'vitest';
import { ConsumerBookingsService } from './consumer-bookings.service';

function setup() {
  const tx = {
    $queryRaw: vi.fn(),
    serviceOffering: { findFirst: vi.fn() },
  };
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const availability = {
    lockAndAssertBookable: vi.fn().mockResolvedValue(undefined),
  };
  return {
    tx,
    prisma,
    availability,
    service: new ConsumerBookingsService(
      prisma as unknown as ConstructorParameters<typeof ConsumerBookingsService>[0],
      availability as unknown as ConstructorParameters<typeof ConsumerBookingsService>[1],
    ),
  };
}

function sqlValues(call: unknown): unknown[] {
  return (call as { values?: unknown[] }).values ?? [];
}

function sqlText(call: unknown): string {
  return ((call as { strings?: readonly string[] }).strings ?? []).join(' ');
}

const home = {
  id: '22222222-2222-2222-2222-222222222222',
  userId: '11111111-1111-1111-1111-111111111111',
  label: 'Home',
  addressLine1: '12 Lake Road',
  addressLine2: null,
  locality: 'Indiranagar',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560038',
  latitude: null,
  longitude: null,
  active: true,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
};

describe('ConsumerBookingsService', () => {
  it('scopes home listing to the authenticated user', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([]);

    await service.listHomes('11111111-1111-1111-1111-111111111111');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(sqlValues(prisma.$queryRaw.mock.calls[0][0])).toContain('11111111-1111-1111-1111-111111111111');
  });

  it('scopes fulfilment event history to the authenticated consumer and booking', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([]);

    await service.listBookingEvents(
      '11111111-1111-1111-1111-111111111111',
      '66666666-6666-6666-6666-666666666666',
    );

    const values = sqlValues(prisma.$queryRaw.mock.calls[0][0]);
    expect(values).toContain('11111111-1111-1111-1111-111111111111');
    expect(values).toContain('66666666-6666-6666-6666-666666666666');
  });

  it('rejects booking against a home that is not owned by the authenticated user', async () => {
    const { tx, availability, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.createBooking('11111111-1111-1111-1111-111111111111', {
      homeId: '22222222-2222-2222-2222-222222222222',
      offeringId: '33333333-3333-3333-3333-333333333333',
      scheduledFrom: new Date('2030-01-01T10:00:00Z'),
      scheduledUntil: new Date('2030-01-01T11:00:00Z'),
    })).rejects.toThrow('Active home not found');

    expect(tx.serviceOffering.findFirst).not.toHaveBeenCalled();
    expect(availability.lockAndAssertBookable).not.toHaveBeenCalled();
    const values = sqlValues(tx.$queryRaw.mock.calls[0][0]);
    expect(values).toContain('11111111-1111-1111-1111-111111111111');
    expect(values).toContain('22222222-2222-2222-2222-222222222222');
  });

  it('requires verified ownership when a society unit is used as a service location', async () => {
    const { tx, availability, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.createBooking('11111111-1111-1111-1111-111111111111', {
      locationType: 'SOCIETY_UNIT',
      locationId: '22222222-2222-2222-2222-222222222222',
      offeringId: '33333333-3333-3333-3333-333333333333',
      scheduledFrom: new Date('2030-01-01T10:00:00Z'),
      scheduledUntil: new Date('2030-01-01T11:00:00Z'),
    })).rejects.toThrow('Service-ready society unit not found');

    expect(tx.serviceOffering.findFirst).not.toHaveBeenCalled();
    expect(availability.lockAndAssertBookable).not.toHaveBeenCalled();
    expect(sqlText(tx.$queryRaw.mock.calls[0][0])).toContain('ow."verified" = true');
  });

  it('snapshots server catalogue data only after authoritative serviceability validation', async () => {
    const { tx, availability, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([home])
      .mockResolvedValueOnce([{
        id: '44444444-4444-4444-4444-444444444444',
        userId: home.userId,
        homeId: home.id,
        providerId: '55555555-5555-5555-5555-555555555555',
        offeringId: '33333333-3333-3333-3333-333333333333',
        offeringName: 'AC service',
        providerName: 'CoolCare',
        addressSnapshot: { label: 'Home', addressLine1: '12 Lake Road' },
        status: 'REQUESTED',
        servicePricePaise: 75000,
      }]);
    tx.serviceOffering.findFirst.mockResolvedValue({
      id: '33333333-3333-3333-3333-333333333333',
      name: 'AC service',
      providerId: '55555555-5555-5555-5555-555555555555',
      pricePaise: 75000,
      provider: { businessName: 'CoolCare' },
    });

    const scheduledFrom = new Date('2030-01-01T10:00:00Z');
    const scheduledUntil = new Date('2030-01-01T11:00:00Z');
    const result = await service.createBooking(home.userId, {
      homeId: home.id,
      offeringId: '33333333-3333-3333-3333-333333333333',
      scheduledFrom,
      scheduledUntil,
    });

    expect(result.servicePricePaise).toBe(75000);
    expect(tx.serviceOffering.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: '33333333-3333-3333-3333-333333333333',
        active: true,
        provider: { active: true, verification: 'VERIFIED' },
      }),
      select: expect.objectContaining({
        name: true,
        pricePaise: true,
        provider: { select: { businessName: true } },
      }),
    }));
    expect(availability.lockAndAssertBookable).toHaveBeenCalledWith(
      tx,
      '33333333-3333-3333-3333-333333333333',
      '55555555-5555-5555-5555-555555555555',
      '560038',
      scheduledFrom,
      scheduledUntil,
    );

    const values = sqlValues(tx.$queryRaw.mock.calls[1][0]);
    expect(values).toContain(75000);
    expect(values).toContain('AC service');
    expect(values).toContain('CoolCare');
    const snapshot = values.find((value) => typeof value === 'string' && value.includes('12 Lake Road'));
    expect(snapshot).toEqual(expect.stringContaining('560038'));
  });

  it('does not insert when serviceability or capacity validation rejects the requested time', async () => {
    const { tx, availability, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([home]);
    tx.serviceOffering.findFirst.mockResolvedValue({
      id: '33333333-3333-3333-3333-333333333333',
      name: 'AC service',
      providerId: '55555555-5555-5555-5555-555555555555',
      pricePaise: 75000,
      provider: { businessName: 'CoolCare' },
    });
    availability.lockAndAssertBookable.mockRejectedValueOnce(new Error('Selected service time is fully booked'));

    await expect(service.createBooking(home.userId, {
      homeId: home.id,
      offeringId: '33333333-3333-3333-3333-333333333333',
      scheduledFrom: new Date('2030-01-01T10:00:00Z'),
      scheduledUntil: new Date('2030-01-01T11:00:00Z'),
    })).rejects.toThrow('fully booked');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('does not cancel another users booking', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.cancelBooking(
      '11111111-1111-1111-1111-111111111111',
      '66666666-6666-6666-6666-666666666666',
    )).rejects.toThrow('Booking cannot be cancelled');

    const values = sqlValues(tx.$queryRaw.mock.calls[0][0]);
    expect(values).toContain('11111111-1111-1111-1111-111111111111');
    expect(values).toContain('66666666-6666-6666-6666-666666666666');
  });

  it('records consumer cancellation as a fulfilment event', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', status: 'REQUESTED' }])
      .mockResolvedValueOnce([{ id: '66666666-6666-6666-6666-666666666666', status: 'CANCELLED' }])
      .mockResolvedValueOnce([]);

    const result = await service.cancelBooking(
      '11111111-1111-1111-1111-111111111111',
      '66666666-6666-6666-6666-666666666666',
    );

    expect(result.status).toBe('CANCELLED');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
  });
});
