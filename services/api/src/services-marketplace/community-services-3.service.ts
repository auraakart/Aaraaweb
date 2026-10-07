import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProviderSocietyStatus, ProviderVerificationStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';
import { ConsumerServiceLocationService, ConsumerServiceLocationType } from './consumer-service-location.service';

export const SERVICE_RECURRENCE_CADENCES = ['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY'] as const;
export type ServiceRecurrenceCadence = (typeof SERVICE_RECURRENCE_CADENCES)[number];
export type RecurringPlanStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';
export type CommunityCampaignStatus = 'OPEN' | 'LOCKED' | 'CANCELLED' | 'COMPLETED';

export type ServiceExperiencePolicyInput = {
  quickServiceEligible: boolean;
  targetArrivalMinutes?: number | null;
  includedWork?: string | null;
  partsPolicy?: string | null;
  extraWorkApprovalRequired: boolean;
  recurrenceCadences?: ServiceRecurrenceCadence[];
};

export type RecurringPlanInput = {
  offeringId: string;
  locationType: ConsumerServiceLocationType;
  locationId: string;
  cadence: ServiceRecurrenceCadence;
  preferredWeekday?: number | null;
  preferredTime?: string | null;
};

export type CommunityCampaignInput = {
  offeringId: string;
  title: string;
  description?: string | null;
  serviceDate: Date;
  joinEndsAt: Date;
  thresholdHomes: number;
  maxHomes?: number | null;
  residentPricePaise: number;
};

@Injectable()
export class CommunityServices3Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operators: ConsumerProviderOperatorService,
    private readonly locations: ConsumerServiceLocationService,
  ) {}

  async getOfferingExperiencePolicy(offeringId: string) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT "offeringId","quickServiceEligible","targetArrivalMinutes","includedWork","partsPolicy",
             "extraWorkApprovalRequired","recurrenceCadences","updatedAt"
      FROM "ServiceOfferingExperiencePolicy"
      WHERE "offeringId" = ${offeringId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? {
      offeringId,
      quickServiceEligible: false,
      targetArrivalMinutes: null,
      includedWork: null,
      partsPolicy: null,
      extraWorkApprovalRequired: true,
      recurrenceCadences: [],
      updatedAt: null,
    };
  }

  async setMyOfferingExperiencePolicy(userId: string, offeringId: string, input: ServiceExperiencePolicyInput) {
    const provider = await this.operators.resolveProvider(userId);
    const offering = await this.prisma.serviceOffering.findFirst({
      where: { id: offeringId, providerId: provider.providerId, active: true },
      select: { id: true },
    });
    if (!offering) throw new NotFoundException('Active provider offering not found');

    const targetArrivalMinutes = input.quickServiceEligible ? input.targetArrivalMinutes ?? null : null;
    if (input.quickServiceEligible && (targetArrivalMinutes === null || targetArrivalMinutes < 15 || targetArrivalMinutes > 240)) {
      throw new BadRequestException('Quick service target must be between 15 and 240 minutes');
    }
    const recurrenceCadences = [...new Set(input.recurrenceCadences ?? [])];
    if (recurrenceCadences.some((cadence) => !SERVICE_RECURRENCE_CADENCES.includes(cadence))) {
      throw new BadRequestException('Unsupported recurring-service cadence');
    }

    const includedWork = this.optionalText(input.includedWork, 1500);
    const partsPolicy = this.optionalText(input.partsPolicy, 1500);
    const recurrenceJson = JSON.stringify(recurrenceCadences);
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "ServiceOfferingExperiencePolicy" (
        "offeringId","quickServiceEligible","targetArrivalMinutes","includedWork","partsPolicy",
        "extraWorkApprovalRequired","recurrenceCadences","createdAt","updatedAt"
      ) VALUES (
        ${offeringId}::uuid, ${input.quickServiceEligible}, ${targetArrivalMinutes}, ${includedWork}, ${partsPolicy},
        ${input.extraWorkApprovalRequired}, ${recurrenceJson}::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("offeringId") DO UPDATE SET
        "quickServiceEligible" = EXCLUDED."quickServiceEligible",
        "targetArrivalMinutes" = EXCLUDED."targetArrivalMinutes",
        "includedWork" = EXCLUDED."includedWork",
        "partsPolicy" = EXCLUDED."partsPolicy",
        "extraWorkApprovalRequired" = EXCLUDED."extraWorkApprovalRequired",
        "recurrenceCadences" = EXCLUDED."recurrenceCadences",
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "offeringId","quickServiceEligible","targetArrivalMinutes","includedWork","partsPolicy",
                "extraWorkApprovalRequired","recurrenceCadences","updatedAt"
    `);
    return rows[0];
  }

  listRecurringPlans(userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT rp.*, o."name" AS "offeringName", o."pricePaise", p."businessName" AS "providerName"
      FROM "ConsumerServiceRecurringPlan" rp
      JOIN "ServiceOffering" o ON o."id" = rp."offeringId"
      JOIN "ServiceProvider" p ON p."id" = o."providerId"
      WHERE rp."userId" = ${userId}::uuid
      ORDER BY CASE rp."status" WHEN 'ACTIVE' THEN 0 WHEN 'PAUSED' THEN 1 ELSE 2 END, rp."updatedAt" DESC
    `);
  }

  async createRecurringPlan(userId: string, input: RecurringPlanInput) {
    if (!SERVICE_RECURRENCE_CADENCES.includes(input.cadence)) throw new BadRequestException('Unsupported recurring-service cadence');
    if (input.preferredWeekday != null && (input.preferredWeekday < 1 || input.preferredWeekday > 7)) {
      throw new BadRequestException('Preferred weekday must be between 1 and 7');
    }
    if (input.preferredTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.preferredTime)) {
      throw new BadRequestException('Preferred time must use HH:mm');
    }

    const location = await this.locations.resolveLocation(userId, input.locationType, input.locationId);
    const serviceable = await this.locations.listServiceableOfferings(userId, input.locationType, input.locationId);
    if (!(serviceable as Array<Record<string, unknown>>).some((row) => row.id === input.offeringId)) {
      throw new NotFoundException('Service offering is not available for this location');
    }

    const policies = await this.prisma.$queryRaw<Array<{ recurrenceCadences: unknown }>>(Prisma.sql`
      SELECT "recurrenceCadences" FROM "ServiceOfferingExperiencePolicy"
      WHERE "offeringId" = ${input.offeringId}::uuid LIMIT 1
    `);
    const allowedCadences = Array.isArray(policies[0]?.recurrenceCadences)
      ? policies[0]!.recurrenceCadences.map(String)
      : [];
    if (!allowedCadences.includes(input.cadence)) throw new BadRequestException('Provider has not enabled this recurring cadence');

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtext(${userId}),
          hashtext(${input.offeringId + ':' + input.locationType + ':' + input.locationId})
        )
      `);
      const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "ConsumerServiceRecurringPlan"
        WHERE "userId" = ${userId}::uuid AND "offeringId" = ${input.offeringId}::uuid
          AND "locationType" = ${input.locationType} AND "locationId" = ${input.locationId}::uuid
          AND "status" IN ('ACTIVE','PAUSED')
        LIMIT 1 FOR UPDATE
      `);

      if (existing[0]) {
        const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
          UPDATE "ConsumerServiceRecurringPlan"
          SET "cadence" = ${input.cadence}, "preferredWeekday" = ${input.preferredWeekday ?? null},
              "preferredTime" = ${input.preferredTime ?? null}::time, "status" = 'ACTIVE',
              "locationLabel" = ${location.label}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${existing[0].id}::uuid AND "userId" = ${userId}::uuid
          RETURNING *
        `);
        return rows[0];
      }

      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO "ConsumerServiceRecurringPlan" (
          "id","userId","offeringId","locationType","locationId","locationLabel",
          "cadence","preferredWeekday","preferredTime","status","createdAt","updatedAt"
        ) VALUES (
          ${randomUUID()}::uuid, ${userId}::uuid, ${input.offeringId}::uuid, ${input.locationType}, ${input.locationId}::uuid,
          ${location.label}, ${input.cadence}, ${input.preferredWeekday ?? null}, ${input.preferredTime ?? null}::time,
          'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        RETURNING *
      `);
      return rows[0];
    });
  }

  async setRecurringPlanStatus(userId: string, planId: string, status: RecurringPlanStatus) {
    const current = await this.prisma.$queryRaw<Array<{ status: RecurringPlanStatus }>>(Prisma.sql`
      SELECT "status" FROM "ConsumerServiceRecurringPlan"
      WHERE "id" = ${planId}::uuid AND "userId" = ${userId}::uuid LIMIT 1
    `);
    if (!current[0]) throw new NotFoundException('Recurring service plan not found');
    if (current[0].status === 'CANCELLED') throw new BadRequestException('Cancelled recurring plans cannot be reactivated');

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      UPDATE "ConsumerServiceRecurringPlan"
      SET "status" = ${status}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${planId}::uuid AND "userId" = ${userId}::uuid
      RETURNING *
    `);
    return rows[0];
  }

  async listCommunityDeals(userId: string, locationType: ConsumerServiceLocationType, locationId: string) {
    const location = await this.locations.resolveLocation(userId, locationType, locationId);
    if (!location.societyId || !location.societyUnitId) return [];

    return this.prisma.$queryRaw(Prisma.sql`
      SELECT c.*, o."name" AS "offeringName", o."pricePaise" AS "normalPricePaise",
             p."businessName" AS "providerName",
             COUNT(i."id") FILTER (WHERE i."status" = 'JOINED')::int AS "joinedHomes",
             COALESCE(BOOL_OR(i."unitId" = ${location.societyUnitId}::uuid AND i."status" = 'JOINED'), false) AS "joinedByThisHome",
             (COUNT(i."id") FILTER (WHERE i."status" = 'JOINED') >= c."thresholdHomes") AS "thresholdMet"
      FROM "CommunityServiceCampaign" c
      JOIN "ServiceOffering" o ON o."id" = c."offeringId" AND o."active" = true
      JOIN "ServiceProvider" p ON p."id" = o."providerId" AND p."active" = true
      JOIN "ServiceProviderSociety" ps
        ON ps."providerId" = p."id" AND ps."societyId" = c."societyId"
       AND ps."status" = 'APPROVED'::"ProviderSocietyStatus"
      LEFT JOIN "CommunityServiceCampaignInterest" i ON i."campaignId" = c."id"
      WHERE c."societyId" = ${location.societyId}::uuid
        AND c."status" IN ('OPEN','LOCKED')
        AND c."serviceDate" > CURRENT_TIMESTAMP
      GROUP BY c."id", o."name", o."pricePaise", p."businessName"
      ORDER BY c."serviceDate" ASC, c."createdAt" DESC
    `);
  }

  async joinCommunityDeal(userId: string, campaignId: string, locationType: ConsumerServiceLocationType, locationId: string) {
    const location = await this.locations.resolveLocation(userId, locationType, locationId);
    if (!location.societyId || !location.societyUnitId) throw new BadRequestException('Community deals require a society unit');

    return this.prisma.$transaction(async (tx) => {
      const campaigns = await tx.$queryRaw<Array<{
        societyId: string;
        status: CommunityCampaignStatus;
        joinEndsAt: Date;
        maxHomes: number | null;
      }>>(Prisma.sql`
        SELECT "societyId","status","joinEndsAt","maxHomes"
        FROM "CommunityServiceCampaign"
        WHERE "id" = ${campaignId}::uuid FOR UPDATE
      `);
      const campaign = campaigns[0];
      if (!campaign || campaign.societyId !== location.societyId) throw new NotFoundException('Community service deal not found');
      if (campaign.status !== 'OPEN' || campaign.joinEndsAt <= new Date()) throw new BadRequestException('Community service deal is no longer open');

      if (campaign.maxHomes !== null) {
        const counts = await tx.$queryRaw<Array<{ joined: number }>>(Prisma.sql`
          SELECT COUNT(*)::int AS "joined" FROM "CommunityServiceCampaignInterest"
          WHERE "campaignId" = ${campaignId}::uuid AND "status" = 'JOINED'
        `);
        const existing = await tx.$queryRaw<Array<{ status: string }>>(Prisma.sql`
          SELECT "status" FROM "CommunityServiceCampaignInterest"
          WHERE "campaignId" = ${campaignId}::uuid AND "unitId" = ${location.societyUnitId}::uuid LIMIT 1
        `);
        if ((counts[0]?.joined ?? 0) >= campaign.maxHomes && existing[0]?.status !== 'JOINED') {
          throw new BadRequestException('Community service deal has reached its household limit');
        }
      }

      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO "CommunityServiceCampaignInterest" (
          "id","campaignId","societyId","unitId","userId","status","createdAt","updatedAt"
        ) VALUES (
          ${randomUUID()}::uuid, ${campaignId}::uuid, ${location.societyId}::uuid,
          ${location.societyUnitId}::uuid, ${userId}::uuid, 'JOINED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT ("campaignId","unitId") DO UPDATE SET
          "userId" = EXCLUDED."userId", "status" = 'JOINED', "updatedAt" = CURRENT_TIMESTAMP
        RETURNING *
      `);
      return rows[0];
    });
  }

  async withdrawCommunityDeal(userId: string, campaignId: string, locationType: ConsumerServiceLocationType, locationId: string) {
    const location = await this.locations.resolveLocation(userId, locationType, locationId);
    if (!location.societyId || !location.societyUnitId) throw new BadRequestException('Community deals require a society unit');
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      UPDATE "CommunityServiceCampaignInterest"
      SET "status" = 'WITHDRAWN', "userId" = ${userId}::uuid, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "campaignId" = ${campaignId}::uuid AND "societyId" = ${location.societyId}::uuid
        AND "unitId" = ${location.societyUnitId}::uuid AND "status" = 'JOINED'
      RETURNING *
    `);
    if (!rows[0]) throw new NotFoundException('Joined community service deal not found for this home');
    return rows[0];
  }

  async createCommunityDeal(societyId: string, userId: string, input: CommunityCampaignInput) {
    if (input.joinEndsAt <= new Date()) throw new BadRequestException('Community deal join deadline must be in the future');
    if (input.serviceDate <= input.joinEndsAt) throw new BadRequestException('Service date must be after the join deadline');
    if (input.thresholdHomes < 2 || input.thresholdHomes > 5000) throw new BadRequestException('Community deal threshold is invalid');
    if (input.maxHomes != null && input.maxHomes < input.thresholdHomes) {
      throw new BadRequestException('Maximum homes cannot be lower than the threshold');
    }

    const offering = await this.prisma.serviceOffering.findFirst({
      where: {
        id: input.offeringId,
        active: true,
        provider: {
          active: true,
          verification: ProviderVerificationStatus.VERIFIED,
          societies: { some: { societyId, status: ProviderSocietyStatus.APPROVED } },
        },
      },
      select: { id: true, pricePaise: true },
    });
    if (!offering) throw new NotFoundException('Society-approved service offering not found');
    if (input.residentPricePaise < 0 || input.residentPricePaise > offering.pricePaise) {
      throw new BadRequestException('Community resident price must be between zero and the normal service price');
    }

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "CommunityServiceCampaign" (
        "id","societyId","offeringId","createdByUserId","title","description",
        "serviceDate","joinEndsAt","thresholdHomes","maxHomes","residentPricePaise","status","createdAt","updatedAt"
      ) VALUES (
        ${randomUUID()}::uuid, ${societyId}::uuid, ${input.offeringId}::uuid, ${userId}::uuid,
        ${input.title.trim()}, ${this.optionalText(input.description, 2000)}, ${input.serviceDate}, ${input.joinEndsAt},
        ${input.thresholdHomes}, ${input.maxHomes ?? null}, ${input.residentPricePaise}, 'OPEN',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `);
    return rows[0];
  }

  listAdminCommunityDeals(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT c.*, o."name" AS "offeringName", p."businessName" AS "providerName",
             COUNT(i."id") FILTER (WHERE i."status" = 'JOINED')::int AS "joinedHomes",
             (COUNT(i."id") FILTER (WHERE i."status" = 'JOINED') >= c."thresholdHomes") AS "thresholdMet"
      FROM "CommunityServiceCampaign" c
      JOIN "ServiceOffering" o ON o."id" = c."offeringId"
      JOIN "ServiceProvider" p ON p."id" = o."providerId"
      LEFT JOIN "CommunityServiceCampaignInterest" i ON i."campaignId" = c."id"
      WHERE c."societyId" = ${societyId}::uuid
      GROUP BY c."id", o."name", p."businessName"
      ORDER BY c."serviceDate" DESC, c."createdAt" DESC
    `);
  }

  async setCommunityDealStatus(societyId: string, campaignId: string, status: CommunityCampaignStatus) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      UPDATE "CommunityServiceCampaign"
      SET "status" = ${status}, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${campaignId}::uuid AND "societyId" = ${societyId}::uuid
        AND "status" NOT IN ('CANCELLED','COMPLETED')
      RETURNING *
    `);
    if (!rows[0]) throw new NotFoundException('Active community service deal not found');
    return rows[0];
  }

  private optionalText(value: string | null | undefined, maxLength: number) {
    const normalized = value?.trim() || null;
    if (normalized && normalized.length > maxLength) throw new BadRequestException('Text field is too long');
    return normalized;
  }
}
