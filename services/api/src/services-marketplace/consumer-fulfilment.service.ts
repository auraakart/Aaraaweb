import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceBookingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PushNotificationService } from '../notifications/push-notification.service';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED_FROM: Readonly<Record<ServiceBookingStatus, readonly ServiceBookingStatus[]>> = {
  [ServiceBookingStatus.REQUESTED]: [],
  [ServiceBookingStatus.CONFIRMED]: [ServiceBookingStatus.REQUESTED],
  [ServiceBookingStatus.CANCELLED]: [ServiceBookingStatus.REQUESTED, ServiceBookingStatus.CONFIRMED],
  [ServiceBookingStatus.IN_PROGRESS]: [ServiceBookingStatus.CONFIRMED],
  [ServiceBookingStatus.COMPLETED]: [ServiceBookingStatus.IN_PROGRESS],
};

type BookingStatusRow = { id: string; status: ServiceBookingStatus };
type ConsumerBookingNotificationStatus =
  | typeof ServiceBookingStatus.CONFIRMED
  | typeof ServiceBookingStatus.CANCELLED;

type NotificationBookingRow = {
  id: string;
  userId: string;
  offeringName: string;
  providerName: string;
};

@Injectable()
export class ConsumerFulfilmentService {
  private readonly logger = new Logger(ConsumerFulfilmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushNotificationService,
  ) {}

  listBookings() {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        b.*, h."label" AS "homeLabel",
        o."name" AS "currentOfferingName",
        p."businessName" AS "currentProviderName"
      FROM "ConsumerServiceBooking" b
      LEFT JOIN "ConsumerHome" h ON h."id" = b."homeId"
      JOIN "ServiceOffering" o ON o."id" = b."offeringId"
      JOIN "ServiceProvider" p ON p."id" = b."providerId"
      ORDER BY b."createdAt" DESC
    `);
  }

  async getBooking(bookingId: string) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT b.*
      FROM "ConsumerServiceBooking" b
      WHERE b."id" = ${bookingId}::uuid
      LIMIT 1
    `);
    if (!rows.length) throw new NotFoundException('Consumer booking not found');
    return rows[0];
  }

  listEvents(bookingId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT e.*
      FROM "ConsumerServiceBookingEvent" e
      WHERE e."bookingId" = ${bookingId}::uuid
      ORDER BY e."occurredAt" ASC
    `);
  }

  async transition(
    actorUserId: string,
    bookingId: string,
    toStatus: ServiceBookingStatus,
    note?: string,
    actionOverride?: string,
  ) {
    const allowedFrom = ALLOWED_FROM[toStatus] ?? [];
    if (!allowedFrom.length) throw new BadRequestException('Unsupported fulfilment transition');

    const updated = await this.prisma.$transaction(async (tx) => {
      const currentRows = await tx.$queryRaw<BookingStatusRow[]>(Prisma.sql`
        SELECT "id", "status"
        FROM "ConsumerServiceBooking"
        WHERE "id" = ${bookingId}::uuid
        FOR UPDATE
      `);
      const current = currentRows[0];
      if (!current) throw new NotFoundException('Consumer booking not found');
      if (!allowedFrom.includes(current.status)) {
        throw new BadRequestException(`Cannot transition consumer booking from ${current.status} to ${toStatus}`);
      }

      const updatedRows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        UPDATE "ConsumerServiceBooking"
        SET "status" = ${toStatus}::"ServiceBookingStatus", "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${bookingId}::uuid AND "status" = ${current.status}::"ServiceBookingStatus"
        RETURNING *
      `);
      if (!updatedRows.length) throw new BadRequestException('Consumer booking changed concurrently; retry the action');

      const eventId = randomUUID();
      await tx.$queryRaw(Prisma.sql`
        INSERT INTO "ConsumerServiceBookingEvent" (
          "id", "bookingId", "actorUserId", "action", "fromStatus", "toStatus", "note", "occurredAt"
        ) VALUES (
          ${eventId}::uuid,
          ${bookingId}::uuid,
          ${actorUserId}::uuid,
          ${actionOverride ?? this.actionFor(toStatus)},
          ${current.status}::"ServiceBookingStatus",
          ${toStatus}::"ServiceBookingStatus",
          ${note ?? null},
          CURRENT_TIMESTAMP
        )
      `);

      return updatedRows[0];
    });

    if (toStatus === ServiceBookingStatus.CONFIRMED || toStatus === ServiceBookingStatus.CANCELLED) {
      void this.publishBookingStatus(bookingId, toStatus).catch((error: unknown) => {
        this.logger.warn(`Consumer booking push failed for ${bookingId}: ${error instanceof Error ? error.message : 'unknown error'}`);
      });
    }

    return updated;
  }

  private async publishBookingStatus(bookingId: string, status: ConsumerBookingNotificationStatus) {
    const rows = await this.prisma.$queryRaw<NotificationBookingRow[]>(Prisma.sql`
      SELECT
        b."id",
        b."userId",
        o."name" AS "offeringName",
        p."businessName" AS "providerName"
      FROM "ConsumerServiceBooking" b
      JOIN "ServiceOffering" o ON o."id" = b."offeringId"
      JOIN "ServiceProvider" p ON p."id" = b."providerId"
      WHERE b."id" = ${bookingId}::uuid
      LIMIT 1
    `);
    const booking = rows[0];
    if (!booking) return;
    await this.push.sendConsumerBookingEvent({
      userId: booking.userId,
      bookingId: booking.id,
      offeringName: booking.offeringName,
      providerName: booking.providerName,
      status,
    });
  }

  private actionFor(status: ServiceBookingStatus) {
    switch (status) {
      case ServiceBookingStatus.CONFIRMED:
        return 'CONFIRMED';
      case ServiceBookingStatus.IN_PROGRESS:
        return 'STARTED';
      case ServiceBookingStatus.COMPLETED:
        return 'COMPLETED';
      case ServiceBookingStatus.CANCELLED:
        return 'CANCELLED';
      default:
        return 'STATUS_CHANGED';
    }
  }
}
