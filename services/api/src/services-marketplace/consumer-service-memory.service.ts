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
        b."updatedAt" AS "completedAt",
        EXISTS (
          SELECT 1
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
        ) AS "canRebook"
      FROM "ConsumerServiceBooking" b
      WHERE b."status" = 'COMPLETED'::"ServiceBookingStatus"
        AND (
          (${homeId}::uuid IS NOT NULL AND b."homeId" = ${homeId}::uuid AND b."userId" = ${userId}::uuid)
          OR (${societyUnitId}::uuid IS NOT NULL AND b."societyUnitId" = ${societyUnitId}::uuid)
        )
      ORDER BY b."updatedAt" DESC
      LIMIT 100
    `);
  }
}
