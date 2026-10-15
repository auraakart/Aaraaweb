import { Controller, Get, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { ProductFeature } from '../entitlements/entitlement.types';
import { RequiresFeature } from '../entitlements/feature.decorator';
import { FeatureGuard } from '../entitlements/feature.guard';
import { PrismaService } from '../prisma/prisma.service';

const RESPONDER_ROLES = [
  'SOCIETY_ADMIN',
  'COMMITTEE_MEMBER',
  'FACILITY_MANAGER',
  'SECURITY_SUPERVISOR',
  'SECURITY_GUARD',
] as const;

type SosResponder = {
  userId: string;
  name: string | null;
  phone: string;
  role: string;
};

@Controller('sos/responders')
@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)
@RequiresFeature(ProductFeature.SOS)
@RequiresPermissions(AppPermission.SOS_RESPOND)
export class SosRespondersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentTenant() societyId: string) {
    const roles = Prisma.join(RESPONDER_ROLES.map((role) => Prisma.sql`${role}::"MembershipRole"`));
    return this.prisma.$queryRaw<SosResponder[]>(Prisma.sql`
      SELECT
        sm."userId",
        u."name",
        u."phone",
        sm."role"::text AS "role"
      FROM "SocietyMembership" sm
      JOIN "User" u ON u."id" = sm."userId"
      WHERE sm."societyId" = ${societyId}::uuid
        AND sm."active" = true
        AND u."status" = 'ACTIVE'
        AND sm."role" IN (${roles})
      ORDER BY
        CASE sm."role"
          WHEN 'SECURITY_SUPERVISOR' THEN 0
          WHEN 'SECURITY_GUARD' THEN 1
          WHEN 'FACILITY_MANAGER' THEN 2
          WHEN 'SOCIETY_ADMIN' THEN 3
          ELSE 4
        END,
        COALESCE(u."name", u."phone") ASC
    `);
  }
}
