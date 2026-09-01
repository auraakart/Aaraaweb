import { AccessRequestStatus, AccessSubjectType, GateMutationAction } from '@prisma/client';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProductFeature } from '../entitlements/entitlement.types';
import { AccessService } from './access.service';

function setup(overrides: any = {}, enabled = true) {
  const prisma: any = {
    unitResident: { findFirst: vi.fn().mockResolvedValue({ id: 'link-1' }) },
    gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate-1', active: true }) },
    accessRequest: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'access-1', ...data })),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({
        id: 'access-1',
        societyId: 'society-1',
        requestedById: 'user-1',
        subjectType: AccessSubjectType.VISITOR,
        status: AccessRequestStatus.PENDING,
      }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'access-1', status: AccessRequestStatus.APPROVED }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    gateMutationReceipt: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'receipt-1' }),
    },
    ...overrides,
  };
  prisma.$transaction = overrides.$transaction ?? vi.fn(async (callback: any) => callback(prisma));
  const entitlements: any = { isEnabled: vi.fn().mockResolvedValue(enabled) };
  return { svc: new AccessService(prisma, entitlements), prisma, entitlements };
}

describe('AccessService', () => {
  it('creates and audits a tenant-scoped pending request', async () => {
    const { svc, prisma, entitlements } = setup();
    await svc.create('society-1', 'user-1', 'unit-1', AccessSubjectType.VISITOR, 'Rahul');
    expect(entitlements.isEnabled).toHaveBeenCalledWith('society-1', ProductFeature.VISITOR_MANAGEMENT);
    expect(prisma.accessRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ societyId: 'society-1', unitId: 'unit-1', requestedById: 'user-1', status: AccessRequestStatus.PENDING }),
    }));
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('denies an access type disabled for the society tier', async () => {
    const { svc } = setup({}, false);
    await expect(svc.create('society-1', 'user-1', 'unit-1', AccessSubjectType.DOMESTIC_HELP, 'Maya')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies creation for a unit outside the resident household', async () => {
    const { svc } = setup({ unitResident: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.create('society-1', 'user-1', 'unit-x', AccessSubjectType.VISITOR, 'Rahul')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects invalid approval validity windows', async () => {
    const { svc } = setup();
    const now = new Date();
    await expect(svc.approve('society-1', 'user-1', 'access-1', now, now)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not allow a resident to approve another resident request', async () => {
    const { svc } = setup({ accessRequest: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.approve('society-1', 'user-1', 'access-x', new Date(Date.now() - 1000), new Date(Date.now() + 1000))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('issues a credential and commits approval with compare-and-set', async () => {
    const { svc, prisma } = setup();
    const result = await svc.approve('society-1', 'user-1', 'access-1', new Date(Date.now() - 1000), new Date(Date.now() + 60_000));
    expect(result.credential).toBeTruthy();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.accessRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: AccessRequestStatus.PENDING }),
      data: expect.objectContaining({ status: AccessRequestStatus.APPROVED, credentialHash: expect.any(String) }),
    }));
  });

  it('rejects unknown gate credentials', async () => {
    const { svc } = setup({ accessRequest: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.verify('society-1', 'gate-1', 'wrong')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns the previously committed result for a repeated idempotency key', async () => {
    const existing = {
      id: 'receipt-1',
      societyId: 'society-1',
      gateId: 'gate-1',
      accessRequestId: 'access-1',
      actorUserId: 'guard-1',
      idempotencyKey: 'same-key',
      action: GateMutationAction.CHECK_IN,
    };
    const { svc, prisma } = setup({
      accessRequest: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'access-1',
          societyId: 'society-1',
          requestedById: 'user-1',
          subjectType: AccessSubjectType.VISITOR,
          status: AccessRequestStatus.APPROVED,
          validFrom: new Date(Date.now() - 1000),
          validUntil: new Date(Date.now() + 60_000),
        }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'access-1', status: AccessRequestStatus.CHECKED_IN }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      gateMutationReceipt: { findUnique: vi.fn().mockResolvedValue(existing), create: vi.fn() },
    });

    const result = await svc.checkIn('society-1', 'gate-1', 'credential', 'guard-1', 'same-key');
    expect(result.status).toBe(AccessRequestStatus.CHECKED_IN);
    expect(prisma.accessRequest.updateMany).not.toHaveBeenCalled();
    expect(prisma.gateMutationReceipt.create).not.toHaveBeenCalled();
  });
});
