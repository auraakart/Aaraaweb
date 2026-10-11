import { ForbiddenException } from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { PrismaMembershipRepository } from '../auth/prisma-membership.repository';
import { EntitlementService } from '../entitlements/entitlement.service';
import { ProductFeature } from '../entitlements/entitlement.types';
import { PrismaService, TENANT_CONTEXT_SETTING } from '../prisma/prisma.service';
import { BrandingService } from './branding.service';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('V5 configuration tenant transaction on PostgreSQL', () => {
  it('isolates configuration, rejects revoked authority, and preserves dedicated auditors and legacy overrides', async () => {
    const prisma = new PrismaService();
    const societyA = randomUUID();
    const societyB = randomUUID();
    const member = randomUUID();
    const auditor = randomUUID();
    const service = new BrandingService(prisma, new EntitlementService(prisma), new PrismaMembershipRepository(prisma));
    const principal = { userId: member, societyId: societyA, roles: [AppRole.TENANT] };
    try {
      await prisma.society.createMany({ data: [
        { id: societyA, name: 'Configuration A', code: `config-${societyA}`, featureOverrides: { AI_ASSISTANT: true, NOTICES: false } },
        { id: societyB, name: 'Configuration B', code: `config-${societyB}` },
      ] });
      await prisma.user.createMany({ data: [
        { id: member, phone: `config-${member}` },
        { id: auditor, phone: `config-${auditor}` },
      ] });
      await prisma.societyMembership.create({ data: { userId: member, societyId: societyA, role: MembershipRole.TENANT } });
      await prisma.$executeRaw`
        INSERT INTO "SocietyResponsibilityAssignment" ("societyId", "userId", "responsibility")
        VALUES (CAST(${societyA} AS uuid), CAST(${auditor} AS uuid), 'READ_ONLY_AUDITOR')
      `;

      const config = await service.context(principal);
      expect(config.society).toEqual({ id: societyA, name: 'Configuration A' });
      expect(config.entitlements?.enabledFeatures).toContain(ProductFeature.AI_ASSISTANT);
      expect(config.entitlements?.enabledFeatures).not.toContain(ProductFeature.NOTICES);
      await expect(service.context({ ...principal, societyId: societyB, roles: [AppRole.SUPER_ADMIN] }))
        .rejects.toBeInstanceOf(ForbiddenException);

      const auditPrincipal = { userId: auditor, societyId: societyA, roles: [] };
      await expect(service.context(auditPrincipal)).resolves.toHaveProperty('society.id', societyA);
      await prisma.$executeRaw`
        UPDATE "SocietyResponsibilityAssignment" SET "active" = false
        WHERE "userId" = CAST(${auditor} AS uuid) AND "societyId" = CAST(${societyA} AS uuid)
      `;
      await expect(service.context({ ...auditPrincipal, roles: [AppRole.AUDITOR] }))
        .rejects.toBeInstanceOf(ForbiddenException);

      await prisma.societyMembership.updateMany({ where: { userId: member, societyId: societyA }, data: { active: false } });
      await expect(service.context(principal)).rejects.toBeInstanceOf(ForbiddenException);
      const context = await prisma.$queryRaw<Array<{ value: string | null }>>(
        Prisma.sql`SELECT current_setting(${TENANT_CONTEXT_SETTING}, true) AS value`,
      );
      expect(context[0]?.value).not.toBe(societyA);
      expect(context[0]?.value).not.toBe(societyB);
      await expect(service.context({ userId: member, roles: [AppRole.SUPER_ADMIN] })).resolves.toMatchObject({ society: null, entitlements: null });
    } finally {
      try {
        await prisma.society.deleteMany({ where: { id: { in: [societyA, societyB] } } });
        await prisma.user.deleteMany({ where: { id: { in: [member, auditor] } } });
      } finally {
        await prisma.$disconnect();
      }
    }
  });
});
