import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';

export type OfferingContinuityPolicyInput = {
  warrantyDays?: number | null;
  revisitPolicy?: string | null;
};

@Injectable()
export class ProviderOfferingContinuityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operators: ConsumerProviderOperatorService,
  ) {}

  async getMyPolicy(userId: string, offeringId: string) {
    await this.assertOwnedOffering(userId, offeringId);
    const rows = await this.prisma.$queryRaw<Array<{
      offeringId: string;
      warrantyDays: number | null;
      revisitPolicy: string | null;
      updatedAt: Date;
    }>>(Prisma.sql`
      SELECT "offeringId", "warrantyDays", "revisitPolicy", "updatedAt"
      FROM "ServiceOfferingContinuityPolicy"
      WHERE "offeringId" = ${offeringId}::uuid
      LIMIT 1
    `);
    return rows[0] ?? { offeringId, warrantyDays: null, revisitPolicy: null, updatedAt: null };
  }

  async setMyPolicy(userId: string, offeringId: string, input: OfferingContinuityPolicyInput) {
    await this.assertOwnedOffering(userId, offeringId);
    const revisitPolicy = input.revisitPolicy?.trim() || null;
    const warrantyDays = input.warrantyDays ?? null;
    const rows = await this.prisma.$queryRaw<Array<{
      offeringId: string;
      warrantyDays: number | null;
      revisitPolicy: string | null;
      updatedAt: Date;
    }>>(Prisma.sql`
      INSERT INTO "ServiceOfferingContinuityPolicy" (
        "offeringId", "warrantyDays", "revisitPolicy", "createdAt", "updatedAt"
      ) VALUES (
        ${offeringId}::uuid, ${warrantyDays}, ${revisitPolicy}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("offeringId") DO UPDATE SET
        "warrantyDays" = EXCLUDED."warrantyDays",
        "revisitPolicy" = EXCLUDED."revisitPolicy",
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "offeringId", "warrantyDays", "revisitPolicy", "updatedAt"
    `);
    return rows[0];
  }

  private async assertOwnedOffering(userId: string, offeringId: string) {
    const provider = await this.operators.resolveProvider(userId);
    const offering = await this.prisma.serviceOffering.findFirst({
      where: { id: offeringId, providerId: provider.providerId },
      select: { id: true },
    });
    if (!offering) throw new NotFoundException('Provider offering not found');
    return offering;
  }
}
