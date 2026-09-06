import { describe, expect, it, vi } from 'vitest';
import { ConsumerBookingsService } from './consumer-bookings.service';

function setup() {
  const prisma = {
    $queryRaw: vi.fn(),
    serviceOffering: { findFirst: vi.fn() },
  };
  return {
    prisma,
    service: new ConsumerBookingsService(
      prisma as unknown as ConstructorParameters<typeof ConsumerBookingsService>[0],
    ),
  };
}

function sqlValues(call: unknown): unknown[] {
  return (call as { values?: unknown[] }).values ?? [];
}

describe('ConsumerBookingsService', () => {
  it('scopes home listing to the authenticated user', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([]);

    await service.listHomes('11111111-1111-1111-1111-111111111111');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(sqlValues(prisma.$queryRaw.mock.calls[0][0])).toContain('11111111-1111-1111-1111-111111111111');
  });

  it('rejects booking against a home that is not owned by the authenticated user', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.createBooking('11111111-1111-1111-1111-111111111111', {
      homeId: '22222222-2222-2222-2222-222222222222',
      offeringId: '33333333-3333-3333-3333-333333333333',
      scheduledFrom: new Date('2030-01-01T10:00:00Z'),
      scheduledUntil: new Date('2030-01-01T11:00:00Z'),
    })).rejects.toThrow('Active home not found');

    expect(prisma.serviceOffering.findFirst).not.toHaveBeenCalled();
    const values = sqlValues(prisma.$queryRaw.mock.calls[0][0]);
    expect(values).toContain('11111111-1111-1111-1111-111111111111');
    expect(values).toContain('22222222-2222-2222-2222-222222222222');
  });

  it('snapshots the verified offering price instead of accepting a client price', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{ id: '22222222-2222-2222-2222-222222222222' }])
      .mockResolvedValueOnce([{
        id: '44444444-4444-4444-4444-444444444444',
        userId: '11111111-1111-1111-1111-111111111111',
        homeId: '22222222-2222-2222-2222-222222222222',
        providerId: '55555555-5555-5555-5555-555555555555',
        offeringId: '33333333-3333-3333-3333-333333333333',
        status: 'REQUESTED',
        servicePricePaise: 75000,
      }]);
    prisma.serviceOffering.findFirst.mockResolvedValue({
      id: '33333333-3333-3333-3333-333333333333',
      providerId: '55555555-5555-5555-5555-555555555555',
      pricePaise: 75000,
    });

    const result = await service.createBooking('11111111-1111-1111-1111-111111111111', {
      homeId: '22222222-2222-2222-2222-222222222222',
      offeringId: '33333333-3333-3333-3333-333333333333',
      scheduledFrom: new Date('2030-01-01T10:00:00Z'),
      scheduledUntil: new Date('2030-01-01T11:00:00Z'),
    });

    expect(result.servicePricePaise).toBe(75000);
    expect(prisma.serviceOffering.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: '33333333-3333-3333-3333-333333333333',
        active: true,
        provider: { active: true, verification: 'VERIFIED' },
      }),
    }));
    expect(sqlValues(prisma.$queryRaw.mock.calls[1][0])).toContain(75000);
  });

  it('does not cancel another users booking', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(service.cancelBooking(
      '11111111-1111-1111-1111-111111111111',
      '66666666-6666-6666-6666-666666666666',
    )).rejects.toThrow('Booking cannot be cancelled');

    const values = sqlValues(prisma.$queryRaw.mock.calls[0][0]);
    expect(values).toContain('11111111-1111-1111-1111-111111111111');
    expect(values).toContain('66666666-6666-6666-6666-666666666666');
  });
});
