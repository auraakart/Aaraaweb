import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ServiceBookingHistoryService } from './service-booking-history.service';

function setup() {
  const prisma = {
    serviceBooking: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
  };
  return {
    prisma,
    service: new ServiceBookingHistoryService(
      prisma as unknown as ConstructorParameters<typeof ServiceBookingHistoryService>[0],
    ),
  };
}

describe('ServiceBookingHistoryService', () => {
  it('fails closed when the booking does not belong to the authenticated resident and society', async () => {
    const { prisma, service } = setup();
    prisma.serviceBooking.findFirst.mockResolvedValue(null);

    await expect(service.timeline('society-a', 'resident-a', '11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.serviceBooking.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: '11111111-1111-4111-8111-111111111111',
        societyId: 'society-a',
        residentUserId: 'resident-a',
      },
    }));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns ordered projected events and an immutable warranty snapshot for an owned booking', async () => {
    const { prisma, service } = setup();
    prisma.serviceBooking.findFirst.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'COMPLETED',
      provider: { id: 'provider-1', businessName: 'Trusted Services' },
      offering: { id: 'offering-1', name: 'AC service' },
      accessRequest: { id: 'access-1', status: 'CHECKED_OUT' },
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { id: 'event-1', action: 'BOOKING_REQUESTED', fromStatus: null, toStatus: 'REQUESTED' },
        { id: 'event-2', action: 'PROVIDER_GATE_CHECKED_IN', fromStatus: 'CONFIRMED', toStatus: 'IN_PROGRESS' },
        { id: 'event-3', action: 'SERVICE_COMPLETED', fromStatus: 'IN_PROGRESS', toStatus: 'COMPLETED' },
      ])
      .mockResolvedValueOnce([
        { warrantyDays: 30, revisitPolicy: 'One free revisit', warrantyActive: true },
      ]);

    const result = await service.timeline('society-a', 'resident-a', '11111111-1111-4111-8111-111111111111');

    expect(result.events.map((event) => event.action)).toEqual([
      'BOOKING_REQUESTED',
      'PROVIDER_GATE_CHECKED_IN',
      'SERVICE_COMPLETED',
    ]);
    expect(result.warranty).toEqual(expect.objectContaining({
      warrantyDays: 30,
      revisitPolicy: 'One free revisit',
      warrantyActive: true,
    }));
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
