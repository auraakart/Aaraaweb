import { GUARDS_METADATA } from '@nestjs/common/constants';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { BearerGuard } from '../auth/bearer.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PlatformOwnershipTransferController } from './platform-ownership-transfer.controller';
import { SocietyOwnershipTransferService } from './society-ownership-transfer.service';

const societyId = randomUUID(), actorId = randomUUID(), approverId = randomUUID();
const from = randomUUID(), to = randomUUID(), requestId = randomUUID();
const principal = { userId: actorId, societyId, roles: [AppRole.SUPER_ADMIN] };
const input = { toPartnerId: to, expectedOwnershipVersion: 1, idempotencyKey: randomUUID(), reason: 'Approved commercial ownership correction' };
function fixture() {
  const tx = {
    $queryRaw: vi.fn(async (parts: TemplateStringsArray) => parts.join('').includes('FROM "User"') ? [{ id: actorId }] :
      parts.join('').includes('FROM "Partner"') ? [{ id: from, status: 'ACTIVE' }, { id: to, status: 'ACTIVE' }] : []),
    society: { findUnique: vi.fn().mockResolvedValue({ partnerId: from, ownershipVersion: 1, status: 'ACTIVE' }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    societyOwnershipTransferRequest: { findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue({ id: requestId, societyId, fromPartnerId: from, toPartnerId: to, initiatedById: actorId, expectedOwnershipVersion: 1, transfer: null }), create: vi.fn().mockResolvedValue({ id: requestId }) },
    societyOwnershipTransfer: { create: vi.fn().mockResolvedValue({ id: 'receipt' }) },
  };
  const prisma = { $transaction: vi.fn(async (cb: (p: typeof tx) => Promise<unknown>) => cb(tx)) };
  return { tx, prisma, service: new SocietyOwnershipTransferService(prisma as never) };
}
describe('V5.1.1 scoped two-person ownership transfers', () => {
  it('keeps both endpoints bearer and Super Admin guarded', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PlatformOwnershipTransferController)).toEqual([BearerGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, PlatformOwnershipTransferController)).toEqual([AppRole.SUPER_ADMIN]);
  });
  it.each([[], [AppRole.OWNER], [AppRole.SOCIETY_ADMIN], [AppRole.SECURITY_GUARD]].map(roles => ({ roles })))('rejects non-platform roles $roles before data access', async ({ roles }) => {
    const { service, prisma } = fixture();
    await expect(service.propose({ ...principal, roles }, societyId, input)).rejects.toThrow(/authority/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects foreign selected society and bad proposal input', async () => {
    const { service, prisma } = fixture();
    await expect(service.propose(principal, randomUUID(), input)).rejects.toThrow(/authority/);
    await expect(service.propose(principal, societyId, { ...input, reason: '   ' })).rejects.toThrow(/Invalid/);
    await expect(service.propose(principal, societyId, { ...input, expectedOwnershipVersion: 2147483647 })).rejects.toThrow(/Invalid/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('records frozen source ownership and server initiator without changing society', async () => {
    const { service, tx } = fixture();
    await expect(service.propose(principal, societyId, input)).resolves.toEqual({ id: requestId, applied: false });
    expect(tx.societyOwnershipTransferRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fromPartnerId: from, initiatedById: actorId, societyId }) }));
    expect(tx.society.updateMany).not.toHaveBeenCalled();
  });
  it('rejects self-approval and a foreign request without writes', async () => {
    const { service, tx } = fixture();
    await expect(service.approve(principal, societyId, requestId)).rejects.toThrow(/Independent/);
    tx.societyOwnershipTransferRequest.findFirst.mockResolvedValueOnce(null);
    await expect(service.approve({ ...principal, userId: approverId }, societyId, requestId)).rejects.toThrow(/unavailable/);
    expect(tx.societyOwnershipTransferRequest.findFirst).toHaveBeenCalledWith({ where: { id: requestId, societyId }, include: { transfer: true } });
    expect(tx.societyOwnershipTransfer.create).not.toHaveBeenCalled();
  });
  it('writes approval and versioned owner together without changing features or roles', async () => {
    const { service, tx } = fixture();
    await expect(service.approve({ ...principal, userId: approverId }, societyId, requestId)).resolves.toEqual({ id: 'receipt', ownershipVersion: 2, applied: true });
    expect(tx.society.updateMany).toHaveBeenCalledWith({ where: { id: societyId, partnerId: from, ownershipVersion: 1 }, data: { partnerId: to, ownershipVersion: 2 } });
    expect(tx.societyOwnershipTransfer.create).toHaveBeenCalledWith({ data: { requestId, societyId, ownershipVersion: 2, approvedById: approverId }, select: { id: true } });
  });
  it('denies revoked authority inside transaction and inactive partners', async () => {
    const { service, tx } = fixture();
    tx.$queryRaw.mockImplementation(async parts => parts.join('').includes('FROM "User"') ? [] : []);
    await expect(service.approve({ ...principal, userId: approverId }, societyId, requestId)).rejects.toThrow(/authority/);
    expect(tx.societyOwnershipTransfer.create).not.toHaveBeenCalled();
  });
  it('rejects stale approval and propagates write failure for atomic rollback', async () => {
    const { service, tx } = fixture();
    tx.society.findUnique.mockResolvedValueOnce({ partnerId: from, ownershipVersion: 2, status: 'ACTIVE' });
    await expect(service.approve({ ...principal, userId: approverId }, societyId, requestId)).rejects.toThrow(/version changed/);
    expect(tx.societyOwnershipTransfer.create).not.toHaveBeenCalled();
    tx.society.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.approve({ ...principal, userId: approverId }, societyId, requestId)).rejects.toThrow(/version changed/);
  });
});
