import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceBookingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type RatingRow = {
  id: string;
  bookingId: string;
  userId: string;
  providerId: string;
  offeringId: string;
  stars: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProviderTrustRow = {
  providerId: string;
  ratingCount: bigint;
  averageStars: string | null;
  completedJobs: bigint;
};

@Injectable()
export class ConsumerServiceRatingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(userId: string, bookingId: string) {
    await this.assertBookingOwned(userId, bookingId);
    const rows = await this.prisma.$queryRaw<RatingRow[]>(Prisma.sql`
      SELECT * FROM "ConsumerServiceRating"
      WHERE "bookingId" = ${bookingId}::uuid AND "userId" = ${userId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async createMine(userId: string, bookingId: string, stars: number, comment?: string) {
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      throw new BadRequestException('Rating must be an integer from 1 to 5');
    }
    const normalizedComment = comment?.trim() || null;
    if (normalizedComment && normalizedComment.length > 1000) {
      throw new BadRequestException('Rating comment must be 1000 characters or fewer');
    }

    return this.prisma.$transaction(async (tx) => {
      const bookingRows = await tx.$queryRaw<Array<{
        id: string;
        userId: string;
        providerId: string;
        offeringId: string;
        status: ServiceBookingStatus;
      }>>(Prisma.sql`
        SELECT "id", "userId", "providerId", "offeringId", "status"
        FROM "ConsumerServiceBooking"
        WHERE "id" = ${bookingId}::uuid AND "userId" = ${userId}::uuid
        FOR UPDATE
      `);
      const booking = bookingRows[0];
      if (!booking) throw new NotFoundException('Consumer booking not found');
      if (booking.status !== ServiceBookingStatus.COMPLETED) {
        throw new BadRequestException('Only completed services can be rated');
      }

      const existing = await tx.$queryRaw<RatingRow[]>(Prisma.sql`
        SELECT * FROM "ConsumerServiceRating" WHERE "bookingId" = ${bookingId}::uuid LIMIT 1
      `);
      if (existing[0]) return existing[0];

      const rows = await tx.$queryRaw<RatingRow[]>(Prisma.sql`
        INSERT INTO "ConsumerServiceRating" (
          "id", "bookingId", "userId", "providerId", "offeringId", "stars", "comment", "createdAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}::uuid, ${booking.id}::uuid, ${userId}::uuid,
          ${booking.providerId}::uuid, ${booking.offeringId}::uuid,
          ${stars}, ${normalizedComment}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
      `);
      return rows[0];
    });
  }

  async providerSummary(providerId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ ratingCount: bigint; averageStars: string | null }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "ratingCount", ROUND(AVG("stars")::numeric, 2)::text AS "averageStars"
      FROM "ConsumerServiceRating"
      WHERE "providerId" = ${providerId}::uuid
    `);
    const row = rows[0];
    return {
      ratingCount: Number(row?.ratingCount ?? 0),
      averageStars: row?.averageStars ? Number(row.averageStars) : null,
    };
  }

  async providerTrustSummaries() {
    const rows = await this.prisma.$queryRaw<ProviderTrustRow[]>(Prisma.sql`
      SELECT
        p."id" AS "providerId",
        COALESCE(r."ratingCount", 0)::bigint AS "ratingCount",
        r."averageStars",
        COALESCE(j."completedJobs", 0)::bigint AS "completedJobs"
      FROM "ServiceProvider" p
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::bigint AS "ratingCount",
          ROUND(AVG(sr."stars")::numeric, 2)::text AS "averageStars"
        FROM "ConsumerServiceRating" sr
        WHERE sr."providerId" = p."id"
      ) r ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::bigint AS "completedJobs"
        FROM "ConsumerServiceBooking" b
        WHERE b."providerId" = p."id"
          AND b."status" = 'COMPLETED'::"ServiceBookingStatus"
      ) j ON true
      WHERE p."active" = true
        AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
      ORDER BY p."businessName" ASC
    `);
    return rows.map((row) => ({
      providerId: row.providerId,
      ratingCount: Number(row.ratingCount),
      averageStars: row.averageStars ? Number(row.averageStars) : null,
      completedJobs: Number(row.completedJobs),
    }));
  }

  private async assertBookingOwned(userId: string, bookingId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ConsumerServiceBooking"
      WHERE "id" = ${bookingId}::uuid AND "userId" = ${userId}::uuid
      LIMIT 1
    `);
    if (!rows[0]) throw new NotFoundException('Consumer booking not found');
  }
}
