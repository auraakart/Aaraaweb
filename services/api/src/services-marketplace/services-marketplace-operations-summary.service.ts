import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type OperationsSummaryRow = {
  bookings30d: bigint;
  completed30d: bigint;
  cancelled30d: bigint;
  activeVerifiedProviders: bigint;
  activeCommercialPlacements: bigint;
  repeatCustomers90d: bigint;
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
}
