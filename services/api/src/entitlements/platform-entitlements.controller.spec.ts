import { GUARDS_METADATA } from '@nestjs/common/constants';
import { MembershipRole, SocietyStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProductFeature, ProductTier } from './entitlement.types';
import { PlatformEntitlementsController } from './platform-entitlements.controller';

describe('PlatformEntitlementsController', () => {
  it('is protected by the Super Admin platform role boundary', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, PlatformEntitlementsController) as unknown[];
    expect(guards).toContain(RolesGuard);
    expect(Reflect.getMetadata(ROLES_KEY, PlatformEntitlementsController)).toEqual([AppRole.SUPER_ADMIN]);
  });

  it('rejects unknown or non-boolean feature overrides', async () => {
    const prisma = { society: { update: vi.fn() } };
    const controller = new PlatformEntitlementsController(prisma as never);
    await expect(controller.updateEntitlements('11111111-1111-1111-1111-111111111111', {
      featureOverrides: { UNKNOWN: true },
    })).rejects.toThrow('Unknown product feature');
    await expect(controller.updateEntitlements('11111111-1111-1111-1111-111111111111', {
      featureOverrides: { [ProductFeature.SOS]: 'yes' },
    })).rejects.toThrow('must be boolean');
    expect(prisma.society.update).not.toHaveBeenCalled();
  });

  it('updates product tier and controlled feature overrides', async () => {
    const prisma = { society: { update: vi.fn().mockResolvedValue({ id: 'society-1' }) } };
    const controller = new PlatformEntitlementsController(prisma as never);
    await controller.updateEntitlements('11111111-1111-1111-1111-111111111111', {
      productTier: ProductTier.PREMIUM,
      featureOverrides: { [ProductFeature.AI_ASSISTANT]: false },
    });
    expect(prisma.society.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        productTier: ProductTier.PREMIUM,
        featureOverrides: { [ProductFeature.AI_ASSISTANT]: false },
      }),
    }));
  });

  it('revokes every active society session when a society is suspended', async () => {
    const prisma = {
      society: { update: vi.fn().mockResolvedValue({ id: 'society-1', status: SocietyStatus.SUSPENDED }) },
      session: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
    const controller = new PlatformEntitlementsController(prisma as never);
    await controller.updateSocietyStatus('11111111-1111-1111-1111-111111111111', { status: SocietyStatus.SUSPENDED });
    expect(prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { societyId: '11111111-1111-1111-1111-111111111111', revokedAt: null },
    }));
  });

  it('provisions Society Admin only from the platform boundary', async () => {
    const prisma = {
      society: { findUnique: vi.fn().mockResolvedValue({ id: 'society-1' }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-1', status: 'ACTIVE' }) },
      societyMembership: { upsert: vi.fn().mockResolvedValue({ id: 'membership-1' }) },
    };
    const controller = new PlatformEntitlementsController(prisma as never);
    await controller.assignSocietyAdmin('11111111-1111-1111-1111-111111111111', {
      userId: '22222222-2222-2222-2222-222222222222',
    });
    expect(prisma.societyMembership.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ role: MembershipRole.SOCIETY_ADMIN, active: true }),
    }));
  });
});
