import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceBookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerBookingsService } from './consumer-bookings.service';

export type ConsumerRebookInput = {
  scheduledFrom: Date;
  scheduledUntil: Date;
  notes?: string;
  idempotencyKey?: string;
};

type RecurringExecutionRow = {
  id: string;
  offeringId: string;
  locationType: 'HOME' | 'SOCIETY_UNIT';
  locationId: string;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
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

  /**
   * Services 4.2.1: consumer explicitly requests ONE booking from an active
   * preference. There is no daemon, auto-billing or recurring reservation.
   * The existing booking engine revalidates current ownership, serviceability,
   * schedule, price and keyed retry semantics.
   */
  async bookFromRecurringPlan(userId: string, planId: string, input: ConsumerRebookInput) {
    if (!(input.scheduledFrom instanceof Date) || !(input.scheduledUntil instanceof Date) ||
        !Number.isFinite(input.scheduledFrom.getTime()) || !Number.isFinite(input.scheduledUntil.getTime()) ||
        input.scheduledUntil <= input.scheduledFrom) {
      throw new BadRequestException('Scheduled end must be after scheduled start');
    }
    const rows = await this.prisma.$queryRaw<RecurringExecutionRow[]>(Prisma.sql`
      SELECT "id", "offeringId", "locationType", "locationId", "status"
      FROM "ConsumerServiceRecurringPlan"
      WHERE "id" = ${planId}::uuid AND "userId" = ${userId}::uuid
      LIMIT 1
    `);
    const plan = rows[0];
    if (!plan) throw new NotFoundException('Recurring service plan not found');
    if (plan.status !== 'ACTIVE') {
      throw new BadRequestException('Recurring service plan must be active to request a booking');
    }
    if (plan.locationType !== 'HOME' && plan.locationType !== 'SOCIETY_UNIT') {
      throw new BadRequestException('Unsupported recurring service location');
    }
    return this.bookings.createBooking(userId, {
      locationType: plan.locationType,
      locationId: plan.locationId,
      offeringId: plan.offeringId,
      scheduledFrom: input.scheduledFrom,
      scheduledUntil: input.scheduledUntil,
      notes: input.notes,
      idempotencyKey: input.idempotencyKey,
    });
  }

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
        idempotencyKey: input.idempotencyKey,
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
        idempotencyKey: input.idempotencyKey,
      });
    }

    throw new BadRequestException('Original service location is no longer available');
  }
}
