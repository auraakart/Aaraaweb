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
import { societyBrandDigest } from './branding-contract';

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
      const firstPresentation = {displayName:'Configuration A Branding',
        colors:{primary:'#155E75',primaryDeep:'#164E63'}};
      const first = await prisma.societyBrandRevision.create({data:{
        societyId:societyA,version:1,createdById:member,
        config:firstPresentation,digest:societyBrandDigest(firstPresentation),
        publishedAt:new Date('2026-10-10T00:00:00.000Z'),
      }});
      const secondPresentation = {displayName:'Configuration B Branding'};
      await prisma.societyBrandRevision.create({data:{
        societyId:societyB,version:1,createdById:member,
        config:secondPresentation,digest:societyBrandDigest(secondPresentation),
        publishedAt:new Date('2026-10-10T00:00:00.000Z'),
      }});
      const rendered = await service.context(principal);
      expect(rendered.branding.brand.displayName).toBe('Configuration A Branding');
      expect(rendered.branding.brand.colors.primary).toBe('#155E75');
      expect(rendered.branding.revision).toBe(`society-${societyA}-v1`);
      await expect(prisma.societyBrandRevision.update({
        where:{id:first.id},data:{config:{displayName:'Tampered'}},
      })).rejects.toThrow();
      const draftPresentation = {displayName:'Not Published'};
      const draft = await prisma.societyBrandRevision.create({data:{
        societyId:societyA,version:2,createdById:member,
        config:draftPresentation,digest:societyBrandDigest(draftPresentation),
      }});
      expect((await service.context(principal)).branding.brand.displayName).toBe('Configuration A Branding');
      await prisma.societyBrandRevision.update({where:{id:draft.id},data:{publishedAt:new Date()}});
      expect((await service.context(principal)).branding.brand.displayName).toBe('Not Published');
      await expect(prisma.societyBrandRevision.update({
        where:{id:draft.id},data:{publishedAt:null},
      })).rejects.toThrow();
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
