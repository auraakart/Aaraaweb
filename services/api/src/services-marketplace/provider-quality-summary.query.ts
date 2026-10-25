import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
   * Services 4.0.6: private, provider-scoped 90-day operational evidence.
   * These are observations, not a quality score, certification or public
   * ranking. Do not use for automatic sanctions or guaranteed rework.
   */
export class ProviderQualitySummaryQuery {
  constructor(private readonly prisma: PrismaService) {}

  async get(providerId: string) {
    const rows = await this.prisma.$queryRaw<Array<{
      completedBookings:number;
      completedWithChecklist:number;
      reworkRequests:number;
      openReworkRequests:number;
    }>>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "ConsumerServiceBooking" b
          WHERE b."providerId"=${providerId}::uuid
            AND b."status"='COMPLETED'::"ServiceBookingStatus"
            AND b."updatedAt" >= CURRENT_TIMESTAMP - INTERVAL '90 days') AS "completedBookings",
        (SELECT COUNT(*)::int FROM "ConsumerServiceBooking" b
          JOIN "ConsumerServiceQualityChecklistSnapshot" s ON s."bookingId"=b."id"
          WHERE b."providerId"=${providerId}::uuid
            AND b."status"='COMPLETED'::"ServiceBookingStatus"
            AND b."updatedAt" >= CURRENT_TIMESTAMP - INTERVAL '90 days') AS "completedWithChecklist",
        (SELECT COUNT(*)::int FROM "ConsumerServiceDispute" d
          WHERE d."providerId"=${providerId}::uuid
            AND d."reasonCode"='REWORK_REQUEST'
            AND d."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '90 days') AS "reworkRequests",
        (SELECT COUNT(*)::int FROM "ConsumerServiceDispute" d
          WHERE d."providerId"=${providerId}::uuid
            AND d."reasonCode"='REWORK_REQUEST'
            AND d."status" IN ('OPEN','UNDER_REVIEW')
            AND d."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '90 days') AS "openReworkRequests"
    `);
    const sample=rows[0]??{completedBookings:0,completedWithChecklist:0,reworkRequests:0,openReworkRequests:0};
    return {
      periodDays:90,
      completedBookings:sample.completedBookings,
      completedWithChecklist:sample.completedWithChecklist,
      reworkRequests:sample.reworkRequests,
      openReworkRequests:sample.openReworkRequests,
      sufficientCompletedSample:sample.completedBookings>=5,
      reviewOnly:true,
      qualityScore:null,
      publicRankingEnabled:false,
      automaticPenaltyEnabled:false,
    };
  }
}
