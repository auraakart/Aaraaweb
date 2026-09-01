import { AccessRequestStatus, AccessSubjectType } from '@prisma/client';
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
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'access-1', ...data })),
    },
    ...overrides,
  };
  const entitlements: any = { isEnabled: vi.fn().mockResolvedValue(enabled) };
  return { svc: new AccessService(prisma, entitlements), prisma, entitlements };
}

describe('AccessService', () => {
  it('creates a tenant-scoped pending request for an active resident unit', async () => {
    const { svc, prisma, entitlements } = setup();
    await svc.create('society-1', 'user-1', 'unit-1', AccessSubjectType.VISITOR, 'Rahul');
    expect(entitlements.isEnabled).toHaveBeenCalledWith('society-1', ProductFeature.VISITOR_MANAGEMENT);
    expect(prisma.accessRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ societyId: 'society-1', unitId: 'unit-1', requestedById: 'user-1', status: AccessRequestStatus.PENDING }),
    }));
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
    await expect(
      svc.approve('society-1', 'user-1', 'access-x', new Date(Date.now() - 1000), new Date(Date.now() + 1000)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('issues a credential only after approval', async () => {
    const { svc, prisma } = setup();
    const result = await svc.approve(
      'society-1',
      'user-1',
      'access-1',
      new Date(Date.now() - 1000),
      new Date(Date.now() + 60_000),
    );
    expect(result.credential).toBeTruthy();
    expect(prisma.accessRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: AccessRequestStatus.APPROVED, credentialHash: expect.any(String) }),
    }));
  });

  it('rejects unknown gate credentials', async () => {
    const { svc } = setup({ accessRequest: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.verify('society-1', 'gate-1', 'wrong')).rejects.toBeInstanceOf(NotFoundException);
  });
});
