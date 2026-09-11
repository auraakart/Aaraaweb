import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerServiceLocationService, ConsumerServiceLocationType } from './consumer-service-location.service';

type CommercialOfferingRow = {
  id: string;
  name: string;
  pricePaise: number;
  durationMinutes: number | null;
  categoryId: string;
  categoryName: string;
  providerId: string;
  providerName: string;
  providerDescription: string | null;
  commercialPlacement: 'FEATURED' | 'SPONSORED';
  subscriptionTier: 'BASIC' | 'GROWTH' | 'PREMIUM';
};

@Injectable()
export class ConsumerCommercialDiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: ConsumerServiceLocationService,
  ) {}

  async list(
    userId: string,
    locationType: ConsumerServiceLocationType,
    locationId: string,
    categoryId?: string,
  ) {
    const location = await this.locations.resolveLocation(userId, locationType, locationId);
    return this.prisma.$queryRaw<CommercialOfferingRow[]>(Prisma.sql`
      SELECT
        o."id",
        o."name",
        o."pricePaise",
        o."durationMinutes",
        c."id" AS "categoryId",
        c."name" AS "categoryName",
        p."id" AS "providerId",
        p."businessName" AS "providerName",
        p."description" AS "providerDescription",
        cp."placementType" AS "commercialPlacement",
        cp."subscriptionTier" AS "subscriptionTier"
      FROM "ServiceOffering" o
      JOIN "ServiceCategory" c ON c."id" = o."categoryId" AND c."active" = true
      JOIN "ServiceProvider" p
        ON p."id" = o."providerId"
       AND p."active" = true
       AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
      JOIN "ConsumerProviderCommercialProfile" cp
        ON cp."providerId" = p."id"
       AND cp."active" = true
       AND cp."placementType" IN ('FEATURED', 'SPONSORED')
       AND cp."placementStartsAt" <= CURRENT_TIMESTAMP
       AND cp."placementEndsAt" > CURRENT_TIMESTAMP
      JOIN "ConsumerProviderServiceArea" pa
        ON pa."providerId" = p."id"
       AND pa."postalCode" = ${location.postalCode}
       AND pa."active" = true
      WHERE o."active" = true
        AND (${categoryId ?? null}::uuid IS NULL OR o."categoryId" = ${categoryId ?? null}::uuid)
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
      ORDER BY
        CASE cp."placementType" WHEN 'SPONSORED' THEN 0 ELSE 1 END,
        cp."placementEndsAt" ASC,
        c."sortOrder" ASC,
        o."name" ASC,
        p."businessName" ASC
      LIMIT 20
    `);
  }
}
