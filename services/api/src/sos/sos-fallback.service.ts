import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EntitlementService } from '../entitlements/entitlement.service';
import { ProductFeature } from '../entitlements/entitlement.types';
import { PrismaService } from '../prisma/prisma.service';
import { SosService } from './sos.service';

type FallbackSosCategory = 'MEDICAL' | 'FIRE' | 'SECURITY' | 'LIFT' | 'OTHER';
type FallbackSosSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

@Injectable()
export class SosFallbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementService,
    private readonly sos: SosService,
  ) {}

  async trigger(
    userId: string,
    input: {
      unitId: string;
      category?: FallbackSosCategory;
      severity?: FallbackSosSeverity;
      message?: string;
      latitude?: number;
      longitude?: number;
    },
  ) {
    const rows = await this.prisma.$queryRaw<Array<{ societyId: string }>>(Prisma.sql`
      SELECT uo."societyId"
      FROM "UnitOccupancy" uo
      JOIN "Society" s ON s."id" = uo."societyId"
      WHERE uo."userId" = ${userId}::uuid
        AND uo."unitId" = ${input.unitId}::uuid
        AND uo."active" = true
        AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
        AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        AND s."status" = 'ACTIVE'
      ORDER BY uo."effectiveFrom" DESC
      LIMIT 1
    `);
    const societyId = rows[0]?.societyId;
    if (!societyId) {
      throw new BadRequestException('Unit is not actively assigned to the authenticated resident');
    }
    if (!(await this.entitlements.isEnabled(societyId, ProductFeature.SOS))) {
      throw new ForbiddenException('SOS is not enabled for the resolved society');
    }
    return this.sos.trigger(societyId, userId, input);
  }
}
