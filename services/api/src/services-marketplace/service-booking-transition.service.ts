import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceBookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceBookingAccessService } from './service-booking-access.service';

@Injectable()
export class ServiceBookingTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookingAccess: ServiceBookingAccessService,
  ) {}

  async cancelMine(societyId: string, residentUserId: string, bookingId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockBooking(tx, societyId, bookingId);
      const booking = await tx.serviceBooking.findFirst({
        where: { id: bookingId, societyId, residentUserId },
      });
      if (!booking) throw new NotFoundException('Service booking not found');
      if (booking.status !== ServiceBookingStatus.REQUESTED && booking.status !== ServiceBookingStatus.CONFIRMED) {
        throw new BadRequestException(`Booking is ${booking.status.toLowerCase()}`);
      }

      if (booking.accessRequestId) {
        await this.bookingAccess.cancelApproved(tx, societyId, residentUserId, booking.accessRequestId);
      }

      const changed = await tx.serviceBooking.updateMany({
        where: {
          id: booking.id,
          societyId,
          residentUserId,
          status: booking.status,
        },
        data: { status: ServiceBookingStatus.CANCELLED },
      });
      if (changed.count !== 1) throw new BadRequestException('Booking changed before cancellation could complete');
      return tx.serviceBooking.findFirstOrThrow({ where: { id: booking.id, societyId, residentUserId } });
    });
  }

  async complete(societyId: string, bookingId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockBooking(tx, societyId, bookingId);
      const booking = await tx.serviceBooking.findFirst({ where: { id: bookingId, societyId } });
      if (!booking) throw new NotFoundException('Service booking not found');
      if (booking.status !== ServiceBookingStatus.CONFIRMED && booking.status !== ServiceBookingStatus.IN_PROGRESS) {
        throw new BadRequestException(`Booking is ${booking.status.toLowerCase()}`);
      }

      const changed = await tx.serviceBooking.updateMany({
        where: { id: booking.id, societyId, status: booking.status },
        data: { status: ServiceBookingStatus.COMPLETED },
      });
      if (changed.count !== 1) throw new BadRequestException('Booking changed before completion could complete');
      return tx.serviceBooking.findFirstOrThrow({ where: { id: booking.id, societyId } });
    });
  }

  private lockBooking(tx: Prisma.TransactionClient, societyId: string, bookingId: string) {
    return tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(${societyId}), hashtext(${bookingId}))
    `);
  }
}
