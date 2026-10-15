import { ServiceBookingStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ServiceBookingTransitionService } from './service-booking-transition.service';

function setup() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    serviceBooking: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const prisma = {
    $transaction: vi.fn().mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const bookingAccess = { cancelApproved: vi.fn().mockResolvedValue(undefined) };
  return {
    tx,
    prisma,
    bookingAccess,
    service: new ServiceBookingTransitionService(prisma as never, bookingAccess as never),
  };
}

describe('ServiceBookingTransitionService', () => {
  it('cancels a confirmed booking and revokes linked access under one booking lock', async () => {
    const { tx, bookingAccess, service } = setup();
    tx.serviceBooking.findFirst.mockResolvedValue({
      id: 'booking-1',
      societyId: 'society-1',
      residentUserId: 'resident-1',
      status: ServiceBookingStatus.CONFIRMED,
      accessRequestId: 'access-1',
    });
    tx.serviceBooking.updateMany.mockResolvedValue({ count: 1 });
    tx.serviceBooking.findFirstOrThrow.mockResolvedValue({ id: 'booking-1', status: ServiceBookingStatus.CANCELLED });

    await expect(service.cancelMine('society-1', 'resident-1', 'booking-1'))
      .resolves.toMatchObject({ status: ServiceBookingStatus.CANCELLED });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(bookingAccess.cancelApproved).toHaveBeenCalledWith(tx, 'society-1', 'resident-1', 'access-1');
    expect(tx.serviceBooking.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'booking-1',
        societyId: 'society-1',
        residentUserId: 'resident-1',
        status: ServiceBookingStatus.CONFIRMED,
      }),
      data: { status: ServiceBookingStatus.CANCELLED },
    }));
  });

  it('does not overwrite a booking whose state changed before cancellation', async () => {
    const { tx, service } = setup();
    tx.serviceBooking.findFirst.mockResolvedValue({
      id: 'booking-1',
      societyId: 'society-1',
      residentUserId: 'resident-1',
      status: ServiceBookingStatus.REQUESTED,
      accessRequestId: null,
    });
    tx.serviceBooking.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.cancelMine('society-1', 'resident-1', 'booking-1'))
      .rejects.toThrow('changed before cancellation');
  });

  it('completes only the locked confirmed or in-progress state', async () => {
    const { tx, service } = setup();
    tx.serviceBooking.findFirst.mockResolvedValue({
      id: 'booking-1',
      societyId: 'society-1',
      status: ServiceBookingStatus.CONFIRMED,
    });
    tx.serviceBooking.updateMany.mockResolvedValue({ count: 1 });
    tx.serviceBooking.findFirstOrThrow.mockResolvedValue({ id: 'booking-1', status: ServiceBookingStatus.COMPLETED });

    await expect(service.complete('society-1', 'booking-1'))
      .resolves.toMatchObject({ status: ServiceBookingStatus.COMPLETED });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.serviceBooking.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'booking-1', societyId: 'society-1', status: ServiceBookingStatus.CONFIRMED },
      data: { status: ServiceBookingStatus.COMPLETED },
    }));
  });

  it('rejects completion after another transition already changed the booking', async () => {
    const { tx, service } = setup();
    tx.serviceBooking.findFirst.mockResolvedValue({
      id: 'booking-1',
      societyId: 'society-1',
      status: ServiceBookingStatus.CANCELLED,
    });

    await expect(service.complete('society-1', 'booking-1')).rejects.toThrow('cancelled');
    expect(tx.serviceBooking.updateMany).not.toHaveBeenCalled();
  });
});
