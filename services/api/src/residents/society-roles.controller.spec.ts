import { MembershipRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { SocietyRolesController } from './society-roles.controller';

describe('SocietyRolesController', () => {
  it('rejects privileged, relationship and vendor roles', async () => {
    const prisma = { user: { findUnique: vi.fn() }, societyMembership: { upsert: vi.fn() } };
    const controller = new SocietyRolesController(prisma as never);
    for (const role of [MembershipRole.SUPER_ADMIN, MembershipRole.SOCIETY_ADMIN, MembershipRole.OWNER, MembershipRole.TENANT, MembershipRole.FAMILY_MEMBER, MembershipRole.VENDOR]) {
      await expect(controller.provision({ phone: '+919999999999', name: 'Test', role }, '11111111-1111-1111-1111-111111111111')).rejects.toThrow('not assignable');
    }
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('creates a new operational user without touching unrelated global identities', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'user-1', status: 'ACTIVE' }),
      },
      societyMembership: { upsert: vi.fn().mockResolvedValue({ id: 'membership-1' }) },
    };
    const controller = new SocietyRolesController(prisma as never);
    await controller.provision({ phone: '+919999999999', name: 'Gate Guard', role: MembershipRole.SECURITY_GUARD }, '11111111-1111-1111-1111-111111111111');
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: { phone: '+919999999999', name: 'Gate Guard' } }));
    expect(prisma.societyMembership.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ role: MembershipRole.SECURITY_GUARD }) }));
  });

  it('deactivates a role society-safely and revokes active sessions', async () => {
    const prisma = {
      societyMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'membership-1', userId: 'user-1', role: MembershipRole.ACCOUNTANT }),
        update: vi.fn(),
      },
      session: { updateMany: vi.fn() },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
    const controller = new SocietyRolesController(prisma as never);
    await controller.deactivate('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    expect(prisma.societyMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ societyId: '22222222-2222-2222-2222-222222222222' }) }));
    expect(prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ societyId: '22222222-2222-2222-2222-222222222222', revokedAt: null }) }));
  });
});
