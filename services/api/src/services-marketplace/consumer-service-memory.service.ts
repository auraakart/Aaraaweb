import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerServiceLocationService, ConsumerServiceLocationType } from './consumer-service-location.service';

@Injectable()
export class ConsumerServiceMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: ConsumerServiceLocationService,
  ) {}

  listFavorites(userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        f."providerId",
        p."businessName",
        p."description",
        f."updatedAt"
      FROM "ConsumerFavoriteProvider" f
      JOIN "ServiceProvider" p
        ON p."id" = f."providerId"
       AND p."active" = true
       AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
      WHERE f."userId" = ${userId}::uuid
        AND f."active" = true
      ORDER BY f."updatedAt" DESC, p."businessName" ASC
    `);
  }

  async setFavorite(userId: string, providerId: string, active: boolean) {
    const providers = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "ServiceProvider"
      WHERE "id" = ${providerId}::uuid
        AND "active" = true
        AND "verification" = 'VERIFIED'::"ProviderVerificationStatus"
      LIMIT 1
    `);
    if (!providers[0]) throw new NotFoundException('Verified provider not found');

    const rows = await this.prisma.$queryRaw<Array<{ providerId: string; active: boolean }>>(Prisma.sql`
      INSERT INTO "ConsumerFavoriteProvider" (
        "userId", "providerId", "active", "createdAt", "updatedAt"
      ) VALUES (
        ${userId}::uuid, ${providerId}::uuid, ${active}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("userId", "providerId") DO UPDATE SET
        "active" = EXCLUDED."active",
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "providerId", "active"
    `);
    return rows[0];
  }

  async listHistory(
    userId: string,
    locationType: ConsumerServiceLocationType,
    locationId: string,
  ) {
    const location = await this.locations.resolveLocation(userId, locationType, locationId);
    const homeId = location.homeId;
    const societyUnitId = location.societyUnitId;

    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        b."id",
        b."providerId",
        b."offeringId",
        b."offeringName",
        b."providerName",
        b."scheduledFrom",
        b."scheduledUntil",
        b."servicePricePaise",
        COALESCE(completed_event."completedAt", b."updatedAt") AS "completedAt",
        r."stars" AS "ratingStars",
        r."comment" AS "ratingComment",
        current_o."currentOffering",
        (current_o."currentOffering" IS NOT NULL) AS "canRebook"
      FROM "ConsumerServiceBooking" b
      LEFT JOIN "ConsumerServiceRating" r
        ON r."bookingId" = b."id" AND r."userId" = ${userId}::uuid
      LEFT JOIN LATERAL (
        SELECT e."occurredAt" AS "completedAt"
        FROM "ConsumerServiceBookingEvent" e
        WHERE e."bookingId" = b."id"
          AND e."toStatus" = 'COMPLETED'::"ServiceBookingStatus"
        ORDER BY e."occurredAt" DESC
        LIMIT 1
      ) completed_event ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object(
          'id', o."id",
          'providerId', o."providerId",
          'name', o."name",
          'description', o."description",
          'pricePaise', o."pricePaise",
          'durationMinutes', o."durationMinutes",
          'providerName', p."businessName",
          'provider', jsonb_build_object(
            'id', p."id",
            'businessName', p."businessName",
            'description', p."description"
          )
        ) AS "currentOffering"
        FROM "ServiceOffering" o
        JOIN "ServiceProvider" p
          ON p."id" = o."providerId"
         AND p."active" = true
         AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
        JOIN "ConsumerProviderServiceArea" pa
          ON pa."providerId" = p."id"
         AND pa."postalCode" = ${location.postalCode}
         AND pa."active" = true
        WHERE o."id" = b."offeringId"
          AND o."providerId" = b."providerId"
          AND o."active" = true
          AND (
            NOT EXISTS (
              SELECT 1 FROM "ConsumerOfferingServiceArea" osa
              WHERE osa."offeringId" = o."id"
            )
            OR EXISTS (
              SELECT 1 FROM "ConsumerOfferingServiceArea" osa
              WHERE osa."offeringId" = o."id"
                AND osa."postalCode" = ${location.postalCode}
                AND osa."active" = true
            )
          )
        LIMIT 1
      ) current_o ON true
      WHERE b."status" = 'COMPLETED'::"ServiceBookingStatus"
        AND (
          (${homeId}::uuid IS NOT NULL AND b."homeId" = ${homeId}::uuid AND b."userId" = ${userId}::uuid)
          OR (${societyUnitId}::uuid IS NOT NULL AND b."societyUnitId" = ${societyUnitId}::uuid)
        )
      ORDER BY COALESCE(completed_event."completedAt", b."updatedAt") DESC
      LIMIT 100
    `);
  }
}
