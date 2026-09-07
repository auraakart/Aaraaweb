import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProviderVerificationStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AvailabilityWindowInput,
  AvailabilityWindowPatch,
  ConsumerAvailabilityService,
} from './consumer-availability.service';
import { ConsumerServiceLocationService } from './consumer-service-location.service';

type ProviderOperatorRow = {
  id: string;
  providerId: string;
  userId: string;
  active: boolean;
};

@Injectable()
export class ConsumerProviderOperatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: ConsumerAvailabilityService,
    private readonly locations: ConsumerServiceLocationService,
  ) {}

  async resolveProvider(userId: string) {
    const rows = await this.prisma.$queryRaw<Array<ProviderOperatorRow & { businessName: string; verification: ProviderVerificationStatus; providerActive: boolean }>>(Prisma.sql`
      SELECT po."id", po."providerId", po."userId", po."active",
             p."businessName", p."verification", p."active" AS "providerActive"
      FROM "ConsumerProviderOperator" po
      JOIN "ServiceProvider" p ON p."id" = po."providerId"
      WHERE po."userId" = ${userId}::uuid AND po."active" = true
      ORDER BY po."createdAt" ASC
      LIMIT 2
    `);
    if (rows.length !== 1) throw new ForbiddenException('Provider operator access is not available');
    const row = rows[0];
    if (!row.providerActive || row.verification !== ProviderVerificationStatus.VERIFIED) {
      throw new ForbiddenException('Provider must be active and verified');
    }
    return row;
  }

  async linkOperator(providerId: string, userId: string) {
    const [provider, user] = await Promise.all([
      this.prisma.serviceProvider.findUnique({ where: { id: providerId }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
    ]);
    if (!provider) throw new NotFoundException('Service provider not found');
    if (!user) throw new NotFoundException('User not found');
    const rows = await this.prisma.$queryRaw<ProviderOperatorRow[]>(Prisma.sql`
      INSERT INTO "ConsumerProviderOperator" ("id", "providerId", "userId", "active", "createdAt", "updatedAt")
      VALUES (${randomUUID()}::uuid, ${providerId}::uuid, ${userId}::uuid, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("providerId", "userId")
      DO UPDATE SET "active" = true, "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "id", "providerId", "userId", "active"
    `);
    return rows[0];
  }

  async listMyServiceAreas(userId: string) {
    const provider = await this.resolveProvider(userId);
    return this.availability.listServiceAreas(provider.providerId);
  }

  async addMyServiceArea(userId: string, postalCode: string) {
    const provider = await this.resolveProvider(userId);
    return this.availability.addServiceArea(provider.providerId, postalCode);
  }

  async setMyServiceAreaActive(userId: string, areaId: string, active: boolean) {
    const provider = await this.resolveProvider(userId);
    return this.availability.setServiceAreaActive(provider.providerId, areaId, active);
  }

  async listMyOfferings(userId: string) {
    const provider = await this.resolveProvider(userId);
    return this.prisma.serviceOffering.findMany({
      where: { providerId: provider.providerId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, description: true, pricePaise: true, durationMinutes: true, active: true, categoryId: true },
    });
  }

  async listMyOfferingAreas(userId: string, offeringId: string) {
    await this.assertOfferingOwned(userId, offeringId);
    return this.locations.listOfferingServiceAreas(offeringId);
  }

  async addMyOfferingArea(userId: string, offeringId: string, postalCode: string) {
    await this.assertOfferingOwned(userId, offeringId);
    return this.locations.addOfferingServiceArea(offeringId, postalCode);
  }

  async setMyOfferingAreaActive(userId: string, offeringId: string, areaId: string, active: boolean) {
    await this.assertOfferingOwned(userId, offeringId);
    return this.locations.setOfferingServiceAreaActive(offeringId, areaId, active);
  }

  async listMyAvailabilityWindows(userId: string, offeringId: string) {
    await this.assertOfferingOwned(userId, offeringId);
    return this.availability.listAvailabilityWindows(offeringId);
  }

  async createMyAvailabilityWindow(userId: string, offeringId: string, input: AvailabilityWindowInput) {
    await this.assertOfferingOwned(userId, offeringId);
    return this.availability.createAvailabilityWindow(offeringId, input);
  }

  async updateMyAvailabilityWindow(
    userId: string,
    offeringId: string,
    windowId: string,
    patch: AvailabilityWindowPatch,
  ) {
    await this.assertOfferingOwned(userId, offeringId);
    return this.availability.updateAvailabilityWindow(offeringId, windowId, patch);
  }

  private async assertOfferingOwned(userId: string, offeringId: string) {
    const provider = await this.resolveProvider(userId);
    const offering = await this.prisma.serviceOffering.findFirst({
      where: { id: offeringId, providerId: provider.providerId },
      select: { id: true },
    });
    if (!offering) throw new NotFoundException('Provider offering not found');
  }
}
