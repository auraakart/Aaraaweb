import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerServiceLocationService, ConsumerServiceLocationType } from './consumer-service-location.service';
import { ServiceProviderSocietyTrustService } from './service-provider-society-trust.service';

@Injectable()
export class ConsumerProviderExperienceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locations: ConsumerServiceLocationService,
    private readonly societyTrust: ServiceProviderSocietyTrustService,
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
      categoryId: string | null;
      title: string;
      description: string | null;
      discountType: 'PERCENT' | 'FLAT' | 'FIXED_PRICE' | 'BUNDLE';
      discountValue: number;
      bundleLabel: string | null;
      startsAt: Date;
      endsAt: Date;
      terms: string | null;
    }>>(Prisma.sql`
      SELECT
        so."id",
        so."offeringId",
        COALESCE(so."categoryId", o."categoryId") AS "categoryId",
        so."title",
        so."description",
        so."discountType"::text AS "discountType",
        so."discountValue",
        so."bundleLabel",
        so."startsAt",
        so."endsAt",
        so."terms"
      FROM "ServiceOffer" so
      LEFT JOIN "ServiceOffering" o
        ON o."id" = so."offeringId"
       AND o."providerId" = ${providerId}::uuid
       AND o."active" = true
      WHERE so."providerId" = ${providerId}::uuid
        AND so."status" = 'APPROVED'::"ServiceOfferStatus"
        AND so."startsAt" <= CURRENT_TIMESTAMP
        AND so."endsAt" > CURRENT_TIMESTAMP
        AND (so."postalCode" IS NULL OR so."postalCode" = ${location.postalCode})
        AND (so."societyId" IS NULL OR so."societyId" = ${location.societyId ?? null}::uuid)
        AND (so."offeringId" IS NULL OR o."id" IS NOT NULL)
        AND (
          so."categoryId" IS NULL
          OR EXISTS (
            SELECT 1 FROM "ServiceCategory" c
            WHERE c."id" = so."categoryId" AND c."active" = true
          )
        )
      ORDER BY so."endsAt" ASC, so."createdAt" DESC
      LIMIT 10
    `);

    const continuityPolicies = await this.prisma.$queryRaw<Array<{
      offeringId: string;
      warrantyDays: number | null;
      revisitPolicy: string | null;
    }>>(Prisma.sql`
      SELECT cp."offeringId", cp."warrantyDays", cp."revisitPolicy"
      FROM "ServiceOfferingContinuityPolicy" cp
      JOIN "ServiceOffering" o
        ON o."id" = cp."offeringId"
       AND o."providerId" = ${providerId}::uuid
       AND o."active" = true
      WHERE cp."warrantyDays" IS NOT NULL OR cp."revisitPolicy" IS NOT NULL
      ORDER BY o."name" ASC
    `);

    const experiencePolicies = await this.prisma.$queryRaw<Array<{
      offeringId: string;
      quickServiceEligible: boolean;
      targetArrivalMinutes: number | null;
      includedWork: string | null;
      partsPolicy: string | null;
      extraWorkApprovalRequired: boolean;
      recurrenceCadences: unknown;
    }>>(Prisma.sql`
      SELECT
        xp."offeringId",
        xp."quickServiceEligible",
        xp."targetArrivalMinutes",
        xp."includedWork",
        xp."partsPolicy",
        xp."extraWorkApprovalRequired",
        xp."recurrenceCadences"
      FROM "ServiceOfferingExperiencePolicy" xp
      JOIN "ServiceOffering" o
        ON o."id" = xp."offeringId"
       AND o."providerId" = ${providerId}::uuid
       AND o."active" = true
      ORDER BY o."name" ASC
    `);

    const trustRows = await this.prisma.$queryRaw<Array<{ qualityTier: 'STANDARD' | 'TRUSTED' | 'PREMIUM' }>>(Prisma.sql`
      SELECT "qualityTier"::text AS "qualityTier"
      FROM "ServiceProviderTrustProfile"
      WHERE "providerId" = ${providerId}::uuid
      LIMIT 1
    `);
    const qualityTier = trustRows[0]?.qualityTier ?? 'STANDARD';

    const promotions = await this.prisma.$queryRaw<Array<{ label: string }>>(Prisma.sql`
      SELECT "label"
      FROM "ServiceProviderPromotion"
      WHERE "providerId" = ${providerId}::uuid
        AND "status" = 'APPROVED'::"ProviderPromotionStatus"
        AND "startsAt" <= CURRENT_TIMESTAMP
        AND "endsAt" > CURRENT_TIMESTAMP
      ORDER BY "endsAt" ASC
      LIMIT 1
    `);

    const societyTrust = location.societyId
      ? (await this.societyTrust.getSignals(location.societyId, [providerId])).get(providerId) ?? null
      : null;

    return {
      provider: { ...provider, qualityTier, ...(societyTrust ?? {}) },
      media,
      offers,
      continuityPolicies,
      experiencePolicies,
      promotion: promotions[0] ?? null,
    };
  }
}
