import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProviderSocietyStatus, ProviderVerificationStatus, ServiceBookingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type OfferingWithProvider = {
  providerId: string;
  provider: Record<string, unknown> & { id: string };
};

@Injectable()
export class ServicesMarketplaceOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async enrichOfferings<T extends OfferingWithProvider>(societyId: string, offerings: T[]) {
    const providerIds = [...new Set(offerings.map((offering) => offering.providerId))];
    if (!providerIds.length) return offerings;
    const [ratings, completed] = await Promise.all([
      this.prisma.serviceRating.groupBy({
        by: ['providerId'],
        where: { societyId, providerId: { in: providerIds } },
        _avg: { score: true },
        _count: { _all: true },
      }),
      this.prisma.serviceBooking.groupBy({
        by: ['providerId'],
        where: { societyId, providerId: { in: providerIds }, status: ServiceBookingStatus.COMPLETED },
        _count: { _all: true },
      }),
    ]);
    const ratingByProvider = new Map(ratings.map((row) => [row.providerId, {
      ratingAverage: row._avg.score === null ? null : Number(row._avg.score.toFixed(1)),
      ratingCount: row._count._all,
    }]));
    const completedByProvider = new Map(completed.map((row) => [row.providerId, row._count._all]));
    return offerings.map((offering) => ({
      ...offering,
      provider: {
        ...offering.provider,
        ratingAverage: ratingByProvider.get(offering.providerId)?.ratingAverage ?? null,
        ratingCount: ratingByProvider.get(offering.providerId)?.ratingCount ?? 0,
        completedJobs: completedByProvider.get(offering.providerId) ?? 0,
      },
    }));
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
