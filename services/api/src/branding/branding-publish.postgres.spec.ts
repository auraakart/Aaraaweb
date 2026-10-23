import { ConflictException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaMembershipRepository } from '../auth/prisma-membership.repository';
import { EntitlementService } from '../entitlements/entitlement.service';
import { BrandingService } from './branding.service';
import { AppRole } from '../auth/auth.types';

const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

withDatabase('V5.3.2 branding publication and society isolation on PostgreSQL', () => {
  it('serializes version allocation, protects drafts and changes the selected society only', async () => {
    const prisma = new PrismaService();
    const service = new BrandingService(prisma, new EntitlementService(prisma),
      new PrismaMembershipRepository(prisma));
    const societyA = randomUUID(), societyB = randomUUID(), admin = randomUUID(), tenant = randomUUID();
    const config = { displayName: 'Lake Gardens', colors: { primary: '#155E75', primaryDeep: '#164E63' } };
    try {
      await prisma.society.createMany({ data: [
        { id: societyA, name: 'Lake Society', code: 'brand-'+societyA },
        { id: societyB, name: 'Hill Society', code: 'brand-'+societyB },
      ] });
      await prisma.user.createMany({ data: [
        { id: admin, phone: 'brand-'+admin },
        { id: tenant, phone: 'brand-'+tenant },
      ] });
      await prisma.societyMembership.createMany({ data: [
        { societyId: societyA, userId: admin, role: 'SOCIETY_ADMIN' },
        { societyId: societyB, userId: tenant, role: 'TENANT' },
      ] });
      await expect(service.createDraft(societyB, tenant, { expectedVersion: 0, config }))
        .rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.createDraft(societyB, admin, { expectedVersion: 0, config }))
        .rejects.toBeInstanceOf(ForbiddenException);
      const results = await Promise.allSettled([
        service.createDraft(societyA, admin, { expectedVersion: 0, config }),
        service.createDraft(societyA, admin, { expectedVersion: 0, config }),
      ]);
      expect(results.filter(x => x.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(x => x.status === 'rejected')).toHaveLength(1);
      const first = (results.find(x => x.status === 'fulfilled') as PromiseFulfilledResult<{
        id: string; version: number;
      }>).value;
      expect(first.version).toBe(1);
      expect((await service.context({ userId: admin, societyId: societyA, roles: [AppRole.SOCIETY_ADMIN] }))
        .branding.brand.displayName).toBe('Aaraagate');
      await expect(service.publish(societyB, tenant, first.id, 0)).rejects.toBeInstanceOf(ForbiddenException);
      const published = await service.publish(societyA, admin, first.id, 0);
      expect(published.version).toBe(1);
      expect((await service.context({ userId: admin, societyId: societyA, roles: [AppRole.SOCIETY_ADMIN] }))
        .branding.brand.displayName).toBe('Lake Gardens');
      await expect(service.publish(societyA, admin, first.id, 0)).rejects.toBeInstanceOf(ConflictException);
      await expect(prisma.societyBrandRevision.update({
        where: { id: first.id }, data: { config: { displayName: 'tampered' } },
      })).rejects.toThrow();
      const second = await service.createDraft(societyA, admin, {
        expectedVersion: 1, config: { displayName: 'Lake Gardens 2' },
      });
      expect((await service.context({ userId: admin, societyId: societyA, roles: [AppRole.SOCIETY_ADMIN] }))
        .branding.brand.displayName).toBe('Lake Gardens');
      await expect(service.publish(societyA, admin, second.id, 0)).rejects.toBeInstanceOf(ConflictException);
      await service.publish(societyA, admin, second.id, 1);
      const context = await service.context({ userId: admin, societyId: societyA, roles: [AppRole.SOCIETY_ADMIN] });
      expect(context.branding.brand.displayName).toBe('Lake Gardens 2');
      expect(context.branding.revision).toBe(`society-${societyA}-v2`);
      expect((await service.context({ userId: tenant, societyId: societyB, roles: [AppRole.TENANT] }))
        .branding.brand.displayName).toBe('Aaraagate');
      expect((await service.history(societyA, admin)).map(x => x.version)).toEqual([2,1]);
      await prisma.societyMembership.updateMany({ where: { societyId: societyA, userId: admin }, data: { active: false } });
      await expect(service.createDraft(societyA, admin, { expectedVersion: 2, config }))
        .rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.history(societyA, admin)).rejects.toBeInstanceOf(ForbiddenException);
    } finally {
      // Publication records are append-only. The isolated CI database is
      // disposable; do not weaken production evidence to delete test fixtures.
      await prisma.$disconnect();
    }
  });
});
