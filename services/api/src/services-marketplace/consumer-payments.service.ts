import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceBookingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type ConsumerPaymentRow = {
  id: string;
  bookingId: string;
  userId: string;
  idempotencyKey: string;
  status: 'CREATED' | 'PENDING' | 'CAPTURED' | 'FAILED' | 'REFUND_PENDING' | 'REFUNDED';
  currency: string;
  grossAmountPaise: number;
  platformFeePaise: number | null;
  providerAmountPaise: number | null;
  provider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  capturedAt: Date | null;
  refundedAt: Date | null;
};

type BookingPaymentSourceRow = {
  id: string;
  userId: string;
  status: ServiceBookingStatus;
  servicePricePaise: number;
};

@Injectable()
export class ConsumerPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  listMine(userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        p.*,
        b."offeringName",
        b."providerName",
        b."scheduledFrom",
        b."scheduledUntil"
      FROM "ConsumerServicePayment" p
      JOIN "ConsumerServiceBooking" b ON b."id" = p."bookingId" AND b."userId" = p."userId"
      WHERE p."userId" = ${userId}::uuid
      ORDER BY p."createdAt" DESC
    `);
  }

  listForBooking(userId: string, bookingId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p.*
      FROM "ConsumerServicePayment" p
      JOIN "ConsumerServiceBooking" b ON b."id" = p."bookingId" AND b."userId" = p."userId"
      WHERE p."userId" = ${userId}::uuid AND p."bookingId" = ${bookingId}::uuid
      ORDER BY p."createdAt" DESC
    `);
  }

  async createIntent(userId: string, bookingId: string, idempotencyKey: string) {
    const normalizedKey = idempotencyKey.trim();
    if (normalizedKey.length < 8 || normalizedKey.length > 100) {
      throw new BadRequestException('Idempotency key must be between 8 and 100 characters');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.$queryRaw<ConsumerPaymentRow[]>(Prisma.sql`
        SELECT *
        FROM "ConsumerServicePayment"
        WHERE "userId" = ${userId}::uuid AND "idempotencyKey" = ${normalizedKey}
        ORDER BY "createdAt" DESC
        LIMIT 1
        FOR UPDATE
      `);
      if (existing[0]) {
        if (existing[0].bookingId !== bookingId) {
          throw new BadRequestException('Idempotency key is already used for another booking');
        }
        return existing[0];
      }

      const bookingRows = await tx.$queryRaw<BookingPaymentSourceRow[]>(Prisma.sql`
        SELECT "id", "userId", "status", "servicePricePaise"
        FROM "ConsumerServiceBooking"
        WHERE "id" = ${bookingId}::uuid AND "userId" = ${userId}::uuid
        FOR UPDATE
      `);
      const booking = bookingRows[0];
      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.status === ServiceBookingStatus.CANCELLED) {
        throw new BadRequestException('Cancelled booking cannot create a payment intent');
      }
      if (!Number.isSafeInteger(booking.servicePricePaise) || booking.servicePricePaise < 0) {
        throw new BadRequestException('Booking has an invalid payment amount');
      }

      const active = await tx.$queryRaw<ConsumerPaymentRow[]>(Prisma.sql`
        SELECT *
        FROM "ConsumerServicePayment"
        WHERE "bookingId" = ${bookingId}::uuid
          AND "userId" = ${userId}::uuid
          AND "status" IN (
            'CREATED'::"ConsumerServicePaymentStatus",
            'PENDING'::"ConsumerServicePaymentStatus",
            'CAPTURED'::"ConsumerServicePaymentStatus",
            'REFUND_PENDING'::"ConsumerServicePaymentStatus"
          )
        ORDER BY "createdAt" DESC
        LIMIT 1
        FOR UPDATE
      `);
      if (active[0]) return active[0];

      const paymentId = randomUUID();
      const rows = await tx.$queryRaw<ConsumerPaymentRow[]>(Prisma.sql`
        INSERT INTO "ConsumerServicePayment" (
          "id", "bookingId", "userId", "idempotencyKey", "status", "currency",
          "grossAmountPaise", "platformFeePaise", "providerAmountPaise", "createdAt", "updatedAt"
        ) VALUES (
          ${paymentId}::uuid,
          ${bookingId}::uuid,
          ${userId}::uuid,
          ${normalizedKey},
          'CREATED'::"ConsumerServicePaymentStatus",
          'INR',
          ${booking.servicePricePaise},
          NULL,
          NULL,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        RETURNING *
      `);
      const payment = rows[0];

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ConsumerServicePaymentEvent" (
          "id", "paymentId", "actorUserId", "type", "fromStatus", "toStatus", "occurredAt"
        ) VALUES (
          ${randomUUID()}::uuid,
          ${payment.id}::uuid,
          ${userId}::uuid,
          'INTENT_CREATED',
          NULL,
          'CREATED'::"ConsumerServicePaymentStatus",
          CURRENT_TIMESTAMP
        )
      `);

      return payment;
    });
  }
}
