import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type ProviderSubscriptionTier = 'BASIC' | 'GROWTH' | 'PREMIUM';
export type ProviderPlacementType = 'NONE' | 'FEATURED' | 'SPONSORED';

export type ProviderCommercialInput = {
  subscriptionTier: ProviderSubscriptionTier;
  subscriptionStartsAt?: string | null;
  subscriptionEndsAt?: string | null;
  placementType: ProviderPlacementType;
  placementStartsAt?: string | null;
  placementEndsAt?: string | null;
  active?: boolean;
};

type ProviderCommercialRow = {
  providerId: string;
  subscriptionTier: ProviderSubscriptionTier;
  subscriptionStartsAt: Date | null;
  subscriptionEndsAt: Date | null;
  placementType: ProviderPlacementType;
  placementStartsAt: Date | null;
  placementEndsAt: Date | null;
  active: boolean;
  subscriptionCurrent: boolean;
  placementCurrent: boolean;
};

@Injectable()
export class ProviderCommercialService {
  constructor(private readonly prisma: PrismaService) {}

  async get(providerId: string) {
    await this.requireProvider(providerId);
    const rows = await this.prisma.$queryRaw<ProviderCommercialRow[]>(Prisma.sql`
      SELECT
        p."id" AS "providerId",
        COALESCE(cp."subscriptionTier", 'BASIC') AS "subscriptionTier",
        cp."subscriptionStartsAt",
        cp."subscriptionEndsAt",
        COALESCE(cp."placementType", 'NONE') AS "placementType",
        cp."placementStartsAt",
        cp."placementEndsAt",
        COALESCE(cp."active", true) AS "active",
        (
          COALESCE(cp."active", true) = true
          AND COALESCE(cp."subscriptionTier", 'BASIC') <> 'BASIC'
          AND cp."subscriptionStartsAt" <= CURRENT_TIMESTAMP
          AND cp."subscriptionEndsAt" > CURRENT_TIMESTAMP
        ) AS "subscriptionCurrent",
        (
          COALESCE(cp."active", true) = true
          AND COALESCE(cp."placementType", 'NONE') <> 'NONE'
          AND cp."placementStartsAt" <= CURRENT_TIMESTAMP
          AND cp."placementEndsAt" > CURRENT_TIMESTAMP
        ) AS "placementCurrent"
      FROM "ServiceProvider" p
      LEFT JOIN "ConsumerProviderCommercialProfile" cp ON cp."providerId" = p."id"
      WHERE p."id" = ${providerId}::uuid
      LIMIT 1
    `);
    return rows[0];
  }

  async set(providerId: string, input: ProviderCommercialInput) {
    await this.requireProvider(providerId);
    const subscription = this.window(input.subscriptionStartsAt, input.subscriptionEndsAt, input.subscriptionTier !== 'BASIC', 'subscription');
    const placement = this.window(input.placementStartsAt, input.placementEndsAt, input.placementType !== 'NONE', 'placement');

    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ConsumerProviderCommercialProfile" (
        "providerId", "subscriptionTier", "subscriptionStartsAt", "subscriptionEndsAt",
        "placementType", "placementStartsAt", "placementEndsAt", "active", "createdAt", "updatedAt"
      ) VALUES (
        ${providerId}::uuid,
        ${input.subscriptionTier},
        ${subscription.startsAt},
        ${subscription.endsAt},
        ${input.placementType},
        ${placement.startsAt},
        ${placement.endsAt},
        ${input.active ?? true},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("providerId") DO UPDATE SET
        "subscriptionTier" = EXCLUDED."subscriptionTier",
        "subscriptionStartsAt" = EXCLUDED."subscriptionStartsAt",
        "subscriptionEndsAt" = EXCLUDED."subscriptionEndsAt",
        "placementType" = EXCLUDED."placementType",
        "placementStartsAt" = EXCLUDED."placementStartsAt",
        "placementEndsAt" = EXCLUDED."placementEndsAt",
        "active" = EXCLUDED."active",
        "updatedAt" = CURRENT_TIMESTAMP
    `);
    return this.get(providerId);
  }

  private async requireProvider(providerId: string) {
    const provider = await this.prisma.serviceProvider.findUnique({ where: { id: providerId }, select: { id: true } });
    if (!provider) throw new NotFoundException('Service provider not found');
  }

  private window(startsAt: string | null | undefined, endsAt: string | null | undefined, required: boolean, name: string) {
    if (!required) return { startsAt: null, endsAt: null };
    if (!startsAt || !endsAt) throw new BadRequestException(`${name} start and end are required`);
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException(`${name} end must be after start`);
    }
    return { startsAt: start, endsAt: end };
  }
}
