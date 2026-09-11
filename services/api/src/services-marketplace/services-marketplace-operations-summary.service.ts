import { Injectable } from '@nestjs/common';
import { Prisma, ServiceBookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type OperationsSummaryRow = {
  bookings30d: bigint;
  completed30d: bigint;
  cancelled30d: bigint;
  activeVerifiedProviders: bigint;
  activeCommercialPlacements: bigint;
  repeatCustomers90d: bigint;
};

type OperationsAttentionRow = {
  bookingId: string;
  status: ServiceBookingStatus;
  scheduledStart: Date;
  scheduledEnd: Date;
  createdAt: Date;
  updatedAt: Date;
  offeringName: string;
  providerName: string;
  reason: 'REQUEST_AWAITING_CONFIRMATION' | 'CONFIRMED_NOT_STARTED' | 'IN_PROGRESS_OVERRUN';
  attentionAgeMinutes: number;
};

@Injectable()
export class ServicesMarketplaceOperationsSummaryService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const rows = await this.prisma.$queryRaw<OperationsSummaryRow[]>(Prisma.sql`
      WITH recent_bookings AS (
        SELECT "userId", "status"
        FROM "ConsumerServiceBooking"
        WHERE "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'
      ),
      repeat_customers AS (
        SELECT "userId"
        FROM "ConsumerServiceBooking"
        WHERE "status" = 'COMPLETED'
          AND "createdAt" >= CURRENT_TIMESTAMP - INTERVAL '90 days'
        GROUP BY "userId"
        HAVING COUNT(*) >= 2
      )
      SELECT
        (SELECT COUNT(*) FROM recent_bookings) AS "bookings30d",
        (SELECT COUNT(*) FROM recent_bookings WHERE "status" = 'COMPLETED') AS "completed30d",
        (SELECT COUNT(*) FROM recent_bookings WHERE "status" = 'CANCELLED') AS "cancelled30d",
        (
          SELECT COUNT(*)
          FROM "ServiceProvider"
          WHERE "active" = true AND "verification" = 'VERIFIED'
        ) AS "activeVerifiedProviders",
        (
          SELECT COUNT(*)
          FROM "ConsumerProviderCommercialProfile"
          WHERE "active" = true
            AND "placementType" <> 'NONE'
            AND "placementStartsAt" <= CURRENT_TIMESTAMP
            AND "placementEndsAt" > CURRENT_TIMESTAMP
        ) AS "activeCommercialPlacements",
        (SELECT COUNT(*) FROM repeat_customers) AS "repeatCustomers90d"
    `);

    const row = rows[0];
    const bookings30d = Number(row?.bookings30d ?? 0n);
    const completed30d = Number(row?.completed30d ?? 0n);
    const cancelled30d = Number(row?.cancelled30d ?? 0n);

    return {
      windowDays: 30,
      bookings30d,
      completed30d,
      cancelled30d,
      completionRate30d: bookings30d > 0 ? completed30d / bookings30d : 0,
      cancellationRate30d: bookings30d > 0 ? cancelled30d / bookings30d : 0,
      activeVerifiedProviders: Number(row?.activeVerifiedProviders ?? 0n),
      activeCommercialPlacements: Number(row?.activeCommercialPlacements ?? 0n),
      repeatCustomers90d: Number(row?.repeatCustomers90d ?? 0n),
    };
  }

  async getAttentionQueue() {
    const rows = await this.prisma.$queryRaw<OperationsAttentionRow[]>(Prisma.sql`
      SELECT
        b."id" AS "bookingId",
        b."status",
        b."scheduledStart",
        b."scheduledEnd",
        b."createdAt",
        b."updatedAt",
        o."name" AS "offeringName",
        p."businessName" AS "providerName",
        CASE
          WHEN b."status" = 'REQUESTED' THEN 'REQUEST_AWAITING_CONFIRMATION'
          WHEN b."status" = 'CONFIRMED' THEN 'CONFIRMED_NOT_STARTED'
          ELSE 'IN_PROGRESS_OVERRUN'
        END AS "reason",
        CASE
          WHEN b."status" = 'REQUESTED' THEN FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - b."createdAt")) / 60)::int
          WHEN b."status" = 'CONFIRMED' THEN FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - b."scheduledStart")) / 60)::int
          ELSE FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - b."scheduledEnd")) / 60)::int
        END AS "attentionAgeMinutes"
      FROM "ConsumerServiceBooking" b
      JOIN "ServiceOffering" o ON o."id" = b."offeringId"
      JOIN "ServiceProvider" p ON p."id" = b."providerId"
      WHERE
        (b."status" = 'REQUESTED' AND b."createdAt" <= CURRENT_TIMESTAMP - INTERVAL '2 hours')
        OR (b."status" = 'CONFIRMED' AND b."scheduledStart" <= CURRENT_TIMESTAMP - INTERVAL '30 minutes')
        OR (b."status" = 'IN_PROGRESS' AND b."scheduledEnd" <= CURRENT_TIMESTAMP - INTERVAL '60 minutes')
      ORDER BY
        CASE b."status"
          WHEN 'IN_PROGRESS' THEN 1
          WHEN 'CONFIRMED' THEN 2
          ELSE 3
        END,
        "attentionAgeMinutes" DESC,
        b."createdAt" ASC
      LIMIT 50
    `);

    return {
      thresholds: {
        requestConfirmationMinutes: 120,
        confirmedStartGraceMinutes: 30,
        inProgressOverrunMinutes: 60,
      },
      items: rows,
    };
  }
}
