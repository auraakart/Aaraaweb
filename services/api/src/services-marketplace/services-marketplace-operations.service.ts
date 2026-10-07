import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProviderSocietyStatus, ProviderVerificationStatus, ServiceBookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceProviderSocietyTrustService } from './service-provider-society-trust.service';

type OfferingWithProvider = {
  id: string;
  providerId: string;
  provider: Record<string, unknown> & { id: string };
};

type ExperiencePolicyRow = {
  offeringId: string;
  quickServiceEligible: boolean;
  targetArrivalMinutes: number | null;
  includedWork: string | null;
  partsPolicy: string | null;
  extraWorkApprovalRequired: boolean;
  recurrenceCadences: unknown;
};

type OfferingTrustEnrichment = {
  ratingAverage: number | null;
  ratingCount: number;
  completedJobs: number;
  societyTrusted: boolean;
  societyCompletedJobs: number;
  societyRatingAverage: number | null;
  societyRatingCount: number;
  societyCancellationRate: number | null;
  societyOnTimeRate: number | null;
  societyArrivalSamples: number;
};

type EnrichedOffering<T extends OfferingWithProvider> =
  Omit<T, 'provider'> & {
    experiencePolicy: ExperiencePolicyRow | null;
    provider: T['provider'] & OfferingTrustEnrichment;
  };

@Injectable()
export class ServicesMarketplaceOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly societyTrust: ServiceProviderSocietyTrustService,
  ) {}

  async enrichOfferings<T extends OfferingWithProvider>(
    societyId: string,
    offerings: T[],
  ): Promise<EnrichedOffering<T>[]> {
    if (!offerings.length) return [];
    const providerIds = [...new Set(offerings.map((offering) => offering.providerId))];
    const offeringIds = [...new Set(offerings.map((offering) => offering.id))];

    const [trustByProvider, experiencePolicies] = await Promise.all([
      this.societyTrust.getSignals(societyId, providerIds),
      this.prisma.$queryRaw<ExperiencePolicyRow[]>(Prisma.sql`
        SELECT
          "offeringId",
          "quickServiceEligible",
          "targetArrivalMinutes",
          "includedWork",
          "partsPolicy",
          "extraWorkApprovalRequired",
          "recurrenceCadences"
        FROM "ServiceOfferingExperiencePolicy"
        WHERE "offeringId" IN (${Prisma.join(offeringIds.map((id) => Prisma.sql`${id}::uuid`))})
      `),
    ]);
    const policyByOffering = new Map(experiencePolicies.map((row) => [row.offeringId, row]));

    return offerings.map((offering) => {
      const trust = trustByProvider.get(offering.providerId);
      return {
        ...offering,
        experiencePolicy: policyByOffering.get(offering.id) ?? null,
        provider: {
          ...offering.provider,
          ratingAverage: trust?.societyRatingAverage ?? null,
          ratingCount: trust?.societyRatingCount ?? 0,
          completedJobs: trust?.societyCompletedJobs ?? 0,
          societyTrusted: trust?.societyTrusted ?? false,
          societyCompletedJobs: trust?.societyCompletedJobs ?? 0,
          societyRatingAverage: trust?.societyRatingAverage ?? null,
          societyRatingCount: trust?.societyRatingCount ?? 0,
          societyCancellationRate: trust?.societyCancellationRate ?? null,
          societyOnTimeRate: trust?.societyOnTimeRate ?? null,
          societyArrivalSamples: trust?.societyArrivalSamples ?? 0,
        },
      };
    });
  }

  async assertProviderAvailable(societyId: string, offeringId: string, scheduledFrom: Date, scheduledUntil: Date) {
    if (scheduledUntil <= scheduledFrom) throw new BadRequestException('Booking time window is invalid');
    const offering = await this.prisma.serviceOffering.findFirst({
      where: {
        id: offeringId,
        active: true,
        provider: {
          active: true,
          verification: ProviderVerificationStatus.VERIFIED,
          societies: { some: { societyId, status: ProviderSocietyStatus.APPROVED } },
        },
      },
      select: { providerId: true },
    });
    if (!offering) throw new NotFoundException('Service offering is unavailable for this society');
    const overlap = await this.prisma.serviceBooking.findFirst({
      where: {
        societyId,
        providerId: offering.providerId,
        status: { in: [ServiceBookingStatus.REQUESTED, ServiceBookingStatus.CONFIRMED, ServiceBookingStatus.IN_PROGRESS] },
        scheduledFrom: { lt: scheduledUntil },
        scheduledUntil: { gt: scheduledFrom },
      },
      select: { id: true },
    });
    if (overlap) throw new BadRequestException('Provider is not available for this time window');
  }

  async setPlatformVerification(providerId: string, verification: ProviderVerificationStatus) {
    const provider = await this.prisma.serviceProvider.findUnique({ where: { id: providerId }, select: { id: true } });
    if (!provider) throw new NotFoundException('Service provider not found');
    return this.prisma.serviceProvider.update({
      where: { id: providerId },
      data: {
        verification,
        active: verification !== ProviderVerificationStatus.SUSPENDED,
      },
      select: { id: true, businessName: true, verification: true, active: true },
    });
  }

  async setSocietyStatus(societyId: string, providerId: string, status: ProviderSocietyStatus, commissionBps?: number) {
    if (commissionBps !== undefined && (commissionBps < 0 || commissionBps > 10000)) {
      throw new BadRequestException('Commission must be between 0 and 10000 basis points');
    }
    if (status === ProviderSocietyStatus.APPROVED) {
      const provider = await this.prisma.serviceProvider.findFirst({
        where: { id: providerId, active: true, verification: ProviderVerificationStatus.VERIFIED },
        select: { id: true },
      });
      if (!provider) throw new BadRequestException('Provider must be platform-verified before society approval');
    }
    const linked = await this.prisma.serviceProviderSociety.findUnique({
      where: { societyId_providerId: { societyId, providerId } },
      select: { id: true, commissionBps: true },
    });
    if (!linked) throw new NotFoundException('Provider is not associated with this society');
    return this.prisma.serviceProviderSociety.update({
      where: { societyId_providerId: { societyId, providerId } },
      data: {
        status,
        ...(commissionBps !== undefined ? { commissionBps } : {}),
        approvedAt: status === ProviderSocietyStatus.APPROVED ? new Date() : null,
      },
    });
  }

  async setOfferingActive(offeringId: string, active: boolean) {
    const offering = await this.prisma.serviceOffering.findUnique({ where: { id: offeringId }, select: { id: true } });
    if (!offering) throw new NotFoundException('Service offering not found');
    return this.prisma.serviceOffering.update({
      where: { id: offeringId },
      data: { active },
      select: { id: true, providerId: true, categoryId: true, name: true, active: true },
    });
  }
}
