import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceBookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerBookingsService } from './consumer-bookings.service';

export type ConsumerRebookInput = {
  scheduledFrom: Date;
  scheduledUntil: Date;
  notes?: string;
};

type RebookSourceRow = {
  id: string;
  userId: string;
  homeId: string | null;
  societyUnitId: string | null;
  offeringId: string;
  status: ServiceBookingStatus;
};

@Injectable()
export class ConsumerRebookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: ConsumerBookingsService,
  ) {}

  async rebook(userId: string, bookingId: string, input: ConsumerRebookInput) {
    if (input.scheduledUntil <= input.scheduledFrom) {
      throw new BadRequestException('Scheduled end must be after scheduled start');
    }

    const rows = await this.prisma.$queryRaw<RebookSourceRow[]>(Prisma.sql`
      SELECT b."id", b."userId", b."homeId", b."societyUnitId", b."offeringId", b."status"
      FROM "ConsumerServiceBooking" b
      WHERE b."id" = ${bookingId}::uuid
        AND b."userId" = ${userId}::uuid
      LIMIT 1
    `);
    const source = rows[0];
    if (!source) throw new NotFoundException('Completed service booking not found');
    if (source.status !== ServiceBookingStatus.COMPLETED) {
      throw new BadRequestException('Only completed service bookings can be rebooked');
    }

    if (source.homeId) {
      return this.bookings.createBooking(userId, {
        homeId: source.homeId,
        offeringId: source.offeringId,
        scheduledFrom: input.scheduledFrom,
        scheduledUntil: input.scheduledUntil,
        notes: input.notes,
      });
    }

    if (source.societyUnitId) {
      return this.bookings.createBooking(userId, {
        locationType: 'SOCIETY_UNIT',
        locationId: source.societyUnitId,
        offeringId: source.offeringId,
        scheduledFrom: input.scheduledFrom,
        scheduledUntil: input.scheduledUntil,
        notes: input.notes,
      });
    }

    throw new BadRequestException('Original service location is no longer available');
  }
}
