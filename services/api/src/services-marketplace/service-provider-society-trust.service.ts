import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type SocietyProviderTrustSignal = {
  providerId: string;
  societyCompletedJobs: number;
  societyCancelledJobs: number;
  societyRatingAverage: number | null;
  societyRatingCount: number;
  societyCancellationRate: number;
  societyArrivalSamples: number;
  societyOnTimeRate: number | null;
  societyTrusted: boolean;
};

type SocietyTrustRow = {
  providerId: string;
  completedJobs: number;
  cancelledJobs: number;
  ratingAverage: number | null;
  ratingCount: number;
  arrivalSamples: number;
  onTimeArrivals: number;
};

@Injectable()
export class ServiceProviderSocietyTrustService {
  constructor(private readonly prisma: PrismaService) {}

  async getSignals(societyId: string, providerIds: string[]) {
    const uniqueProviderIds = [...new Set(providerIds.filter(Boolean))];
    if (!uniqueProviderIds.length) return new Map<string, SocietyProviderTrustSignal>();

    const rows = await this.prisma.$queryRaw<SocietyTrustRow[]>(Prisma.sql`
      SELECT
        b."providerId",
        COUNT(*) FILTER (WHERE b."status" = 'COMPLETED'::"ServiceBookingStatus")::int AS "completedJobs",
        COUNT(*) FILTER (WHERE b."status" = 'CANCELLED'::"ServiceBookingStatus")::int AS "cancelledJobs",
        AVG(r."score")::float8 AS "ratingAverage",
        COUNT(r."id")::int AS "ratingCount",
        COUNT(*) FILTER (WHERE ar."enteredAt" IS NOT NULL)::int AS "arrivalSamples",
        COUNT(*) FILTER (
          WHERE ar."enteredAt" IS NOT NULL
            AND ar."enteredAt" <= b."scheduledFrom" + INTERVAL '30 minutes'
        )::int AS "onTimeArrivals"
      FROM "ServiceBooking" b
      LEFT JOIN "ServiceRating" r ON r."bookingId" = b."id"
      LEFT JOIN "AccessRequest" ar ON ar."id" = b."accessRequestId"
      WHERE b."societyId" = ${societyId}::uuid
        AND b."providerId" IN (${Prisma.join(uniqueProviderIds.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP BY b."providerId"
    `);

    const byProvider = new Map<string, SocietyProviderTrustSignal>();
    for (const row of rows) {
      const completedJobs = Number(row.completedJobs ?? 0);
      const cancelledJobs = Number(row.cancelledJobs ?? 0);
      const ratingCount = Number(row.ratingCount ?? 0);
      const ratingAverage = row.ratingAverage === null ? null : Number(Number(row.ratingAverage).toFixed(1));
      const terminalJobs = completedJobs + cancelledJobs;
      const cancellationRate = terminalJobs === 0 ? 0 : cancelledJobs / terminalJobs;
      const arrivalSamples = Number(row.arrivalSamples ?? 0);
      const onTimeArrivals = Number(row.onTimeArrivals ?? 0);
      const onTimeRate = arrivalSamples === 0 ? null : onTimeArrivals / arrivalSamples;

      // "Society Trusted" is earned from local evidence and cannot be purchased.
      // Small samples deliberately fail closed; arrival punctuality is considered
      // once at least three gate-entry observations exist.
      const societyTrusted =
        completedJobs >= 5
        && ratingCount >= 3
        && ratingAverage !== null
        && ratingAverage >= 4.2
        && cancellationRate <= 0.15
        && (arrivalSamples < 3 || (onTimeRate ?? 0) >= 0.8);

      byProvider.set(row.providerId, {
        providerId: row.providerId,
        societyCompletedJobs: completedJobs,
        societyCancelledJobs: cancelledJobs,
        societyRatingAverage: ratingAverage,
        societyRatingCount: ratingCount,
        societyCancellationRate: Number(cancellationRate.toFixed(3)),
        societyArrivalSamples: arrivalSamples,
        societyOnTimeRate: onTimeRate === null ? null : Number(onTimeRate.toFixed(3)),
        societyTrusted,
      });
    }
    return byProvider;
  }
}
