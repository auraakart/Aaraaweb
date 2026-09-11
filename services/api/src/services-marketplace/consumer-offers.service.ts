import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerServiceLocationService, ConsumerServiceLocationType } from './consumer-service-location.service';

type ConsumerOfferRow = {
  id: string;
  providerId: string;
  providerName: string;
  offeringId: string | null;
  offeringName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  title: string;
  description: string | null;
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
  startsAt: Date;
  endsAt: Date;
  terms: string | null;
};

@Injectable()
export class ConsumerOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: ConsumerServiceLocationService,
  ) {}

  async listForLocation(userId: string, locationType: ConsumerServiceLocationType, locationId: string) {
    const location = await this.locations.resolveLocation(userId, locationType, locationId);

    return this.prisma.$queryRaw<ConsumerOfferRow[]>(Prisma.sql`
      SELECT
        so."id",
        p."id" AS "providerId",
        p."businessName" AS "providerName",
        o."id" AS "offeringId",
        o."name" AS "offeringName",
        c."id" AS "categoryId",
        c."name" AS "categoryName",
        so."title",
        so."description",
        so."discountType"::text AS "discountType",
        so."discountValue",
        so."startsAt",
        so."endsAt",
        so."terms"
      FROM "ServiceOffer" so
      JOIN "ServiceProvider" p
        ON p."id" = so."providerId"
       AND p."active" = true
       AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
      LEFT JOIN "ServiceOffering" o
        ON o."id" = so."offeringId"
       AND o."providerId" = p."id"
       AND o."active" = true
      LEFT JOIN "ServiceCategory" c
        ON c."id" = o."categoryId"
       AND c."active" = true
      WHERE so."status" = 'APPROVED'::"ServiceOfferStatus"
        AND so."startsAt" <= CURRENT_TIMESTAMP
        AND so."endsAt" > CURRENT_TIMESTAMP
        AND EXISTS (
          SELECT 1
          FROM "ConsumerProviderServiceArea" pa
          WHERE pa."providerId" = p."id"
            AND pa."postalCode" = ${location.postalCode}
            AND pa."active" = true
        )
        AND (
          so."offeringId" IS NULL
          OR (
            o."id" IS NOT NULL
            AND c."id" IS NOT NULL
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
          )
        )
      ORDER BY so."endsAt" ASC, so."createdAt" DESC
      LIMIT 50
    `);
  }
}
