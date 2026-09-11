import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerServiceLocationService, ConsumerServiceLocationType } from './consumer-service-location.service';

@Injectable()
export class ConsumerProviderExperienceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: ConsumerServiceLocationService,
  ) {}

  async getForLocation(
    userId: string,
    providerId: string,
    locationType: ConsumerServiceLocationType,
    locationId: string,
  ) {
    const location = await this.locations.resolveLocation(userId, locationType, locationId);

    const providers = await this.prisma.$queryRaw<Array<{ id: string; businessName: string; description: string | null }>>(Prisma.sql`
      SELECT p."id", p."businessName", p."description"
      FROM "ServiceProvider" p
      WHERE p."id" = ${providerId}::uuid
        AND p."active" = true
        AND p."verification" = 'VERIFIED'::"ProviderVerificationStatus"
        AND EXISTS (
          SELECT 1
          FROM "ConsumerProviderServiceArea" pa
          WHERE pa."providerId" = p."id"
            AND pa."postalCode" = ${location.postalCode}
            AND pa."active" = true
        )
      LIMIT 1
    `);
    const provider = providers[0];
    if (!provider) throw new NotFoundException('Serviceable provider not found');

    const media = await this.prisma.$queryRaw<Array<{
      id: string;
      kind: 'LOGO' | 'GALLERY';
      publicUrl: string | null;
      altText: string | null;
      sortOrder: number;
    }>>(Prisma.sql`
      SELECT "id", "kind"::text AS "kind", "publicUrl", "altText", "sortOrder"
      FROM "ServiceProviderMedia"
      WHERE "providerId" = ${providerId}::uuid
        AND "status" = 'APPROVED'::"ProviderMediaStatus"
        AND "publicUrl" IS NOT NULL
      ORDER BY CASE WHEN "kind" = 'LOGO'::"ProviderMediaKind" THEN 0 ELSE 1 END, "sortOrder" ASC, "createdAt" ASC
      LIMIT 8
    `);

    const offers = await this.prisma.$queryRaw<Array<{
      id: string;
      offeringId: string | null;
      title: string;
      description: string | null;
      discountType: 'PERCENT' | 'FLAT';
      discountValue: number;
      startsAt: Date;
      endsAt: Date;
      terms: string | null;
    }>>(Prisma.sql`
      SELECT
        so."id",
        so."offeringId",
        so."title",
        so."description",
        so."discountType"::text AS "discountType",
        so."discountValue",
        so."startsAt",
        so."endsAt",
        so."terms"
      FROM "ServiceOffer" so
      WHERE so."providerId" = ${providerId}::uuid
        AND so."status" = 'APPROVED'::"ServiceOfferStatus"
        AND so."startsAt" <= CURRENT_TIMESTAMP
        AND so."endsAt" > CURRENT_TIMESTAMP
        AND (
          so."offeringId" IS NULL
          OR EXISTS (
            SELECT 1
            FROM "ServiceOffering" o
            WHERE o."id" = so."offeringId"
              AND o."providerId" = ${providerId}::uuid
              AND o."active" = true
          )
        )
      ORDER BY so."endsAt" ASC, so."createdAt" DESC
      LIMIT 10
    `);

    return { provider, media, offers };
  }
}
