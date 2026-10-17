import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { SocietyOwnershipTransferService } from './society-ownership-transfer.service';
const withDatabase = process.env.DATABASE_URL ? describe : describe.skip;

async function fixture(prisma: PrismaService) {
  const societyId = randomUUID(), initiator = randomUUID(), approver = randomUUID(), to = randomUUID();
  await prisma.$transaction(async tx => {
    await tx.user.createMany({ data: [{ id: initiator, phone: 'own-'+initiator }, { id: approver, phone: 'own-'+approver }] });
    await tx.partner.create({ data: { id: to, slug: 'own-'+to, displayName: 'Ownership fixture', status: 'ACTIVE' } });
    await tx.society.create({ data: { id: societyId, name: 'Ownership fixture', code: 'own-'+societyId, productTier: 'PREMIUM', featureOverrides: { SOS: true } } });
    await tx.societyMembership.createMany({ data: [initiator, approver].map(userId => ({ societyId, userId, role: 'SUPER_ADMIN' as const })) });
  });
  const service = new SocietyOwnershipTransferService(prisma);
  const principal = (userId: string) => ({ userId, societyId, roles: [AppRole.SUPER_ADMIN] });
  const proposal = { toPartnerId: to, expectedOwnershipVersion: 1, idempotencyKey: randomUUID(), reason: 'Synthetic ownership transfer' };
  return { societyId, initiator, approver, to, service, principal, proposal };
}

withDatabase('V5.1.1 native PostgreSQL atomic ownership history', () => {
  it('applies independent approval once and preserves entitlement and role data', async () => {
    const prisma = new PrismaService();
    try {
      const f = await fixture(prisma);
      const before = await prisma.society.findUniqueOrThrow({ where: { id: f.societyId } });
      const r = await f.service.propose(f.principal(f.initiator), f.societyId, f.proposal);
      expect(await f.service.propose(f.principal(f.initiator), f.societyId, f.proposal)).toEqual(r);
      await expect(f.service.approve(f.principal(f.initiator), f.societyId, r.id)).rejects.toThrow(/Independent/);
      const result = await f.service.approve(f.principal(f.approver), f.societyId, r.id);
      expect(await f.service.approve(f.principal(f.approver), f.societyId, r.id)).toEqual(result);
      const after = await prisma.society.findUniqueOrThrow({ where: { id: f.societyId } });
      expect(after).toMatchObject({ partnerId: f.to, ownershipVersion: 2, productTier: before.productTier, featureOverrides: before.featureOverrides });
      expect(await prisma.societyOwnershipTransfer.count({ where: { societyId: f.societyId } })).toBe(1);
      expect(await prisma.societyMembership.count({ where: { societyId: f.societyId, active: true } })).toBe(2);
      await expect(prisma.societyOwnershipTransferRequest.update({ where: { id: r.id }, data: { reason: 'forged' } })).rejects.toThrow(/immutable/);
      await expect(prisma.societyOwnershipTransfer.delete({ where: { id: result.id } })).rejects.toThrow(/immutable/);
      // Revocation must also deny an otherwise valid idempotent replay.
      await prisma.societyMembership.updateMany({ where: { userId: f.approver, societyId: f.societyId }, data: { active: false } });
      await expect(f.service.approve(f.principal(f.approver), f.societyId, r.id)).rejects.toThrow(/authority/);
    } finally { await prisma.$disconnect(); }
  });

  it('serializes concurrent approvals and rejects a stale competing proposal', async () => {
    const prisma = new PrismaService();
    try {
      const f = await fixture(prisma);
      const r = await f.service.propose(f.principal(f.initiator), f.societyId, f.proposal);
      const stale = await f.service.propose(f.principal(f.initiator), f.societyId, { ...f.proposal, idempotencyKey: randomUUID() });
      const results = await Promise.all([1, 2].map(() => f.service.approve(f.principal(f.approver), f.societyId, r.id)));
      expect(results[0]).toEqual(results[1]);
      await expect(f.service.approve(f.principal(f.approver), f.societyId, stale.id)).rejects.toThrow(/version changed/);
      expect(await prisma.societyOwnershipTransfer.count({ where: { societyId: f.societyId } })).toBe(1);
    } finally { await prisma.$disconnect(); }
  });

  it('denies unapproved DB ownership writes, forged/self approvals and orphan receipts', async () => {
    const prisma = new PrismaService();
    try {
      const f = await fixture(prisma);
      const r = await f.service.propose(f.principal(f.initiator), f.societyId, f.proposal);
      await expect(prisma.society.update({ where: { id: f.societyId }, data: { partnerId: f.to, ownershipVersion: 2 } })).rejects.toThrow(/approval required/);
      await expect(prisma.societyOwnershipTransfer.create({ data: { requestId: r.id, societyId: f.societyId, ownershipVersion: 2, approvedById: f.initiator } })).rejects.toThrow(/Invalid ownership/);
      await expect(prisma.societyOwnershipTransfer.create({ data: { requestId: r.id, societyId: f.societyId, ownershipVersion: 2, approvedById: f.approver } })).rejects.toThrow(/commit together/);
      expect(await prisma.societyOwnershipTransfer.count({ where: { societyId: f.societyId } })).toBe(0);
      expect((await prisma.society.findUniqueOrThrow({ where: { id: f.societyId } })).ownershipVersion).toBe(1);
    } finally { await prisma.$disconnect(); }
  });

  it('rolls back a receipt and ownership mutation together on downstream failure', async () => {
    const prisma = new PrismaService();
    try {
      const f = await fixture(prisma);
      const r = await f.service.propose(f.principal(f.initiator), f.societyId, f.proposal);
      await expect(prisma.$transaction(async tx => {
        const scoped = new SocietyOwnershipTransferService({ $transaction: (cb: (client: typeof tx) => Promise<unknown>) => cb(tx) } as never);
        await scoped.approve(f.principal(f.approver), f.societyId, r.id);
        throw new Error('Injected downstream failure');
      })).rejects.toThrow(/Injected/);
      expect(await prisma.societyOwnershipTransfer.count({ where: { societyId: f.societyId } })).toBe(0);
      expect((await prisma.society.findUniqueOrThrow({ where: { id: f.societyId } })).ownershipVersion).toBe(1);
    } finally { await prisma.$disconnect(); }
  });

  it('denies revoked initiator, suspended destination and cross-society selectors', async () => {
    const prisma = new PrismaService();
    try {
      const f = await fixture(prisma);
      const r = await f.service.propose(f.principal(f.initiator), f.societyId, f.proposal);
      await expect(f.service.approve(f.principal(f.approver), randomUUID(), r.id)).rejects.toThrow(/authority/);
      await prisma.societyMembership.updateMany({ where: { societyId: f.societyId, userId: f.initiator }, data: { active: false } });
      await expect(f.service.approve(f.principal(f.approver), f.societyId, r.id)).rejects.toThrow(/authority/);
      await prisma.societyMembership.updateMany({ where: { societyId: f.societyId, userId: f.initiator }, data: { active: true } });
      await prisma.partner.update({ where: { id: f.to }, data: { status: 'RESTRICTED' } });
      await expect(f.service.approve(f.principal(f.approver), f.societyId, r.id)).rejects.toThrow(/partners unavailable/);
      expect(await prisma.societyOwnershipTransfer.count({ where: { societyId: f.societyId } })).toBe(0);
    } finally { await prisma.$disconnect(); }
  });
});
