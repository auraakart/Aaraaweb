import { AccessRequestStatus, AccessSubjectType, GateMutationAction } from '@prisma/client';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProductFeature } from '../entitlements/entitlement.types';
import { AccessService } from './access.service';

type Overrides = Record<string, unknown>;

function setup(overrides: Overrides = {}, enabled = true) {
  const prisma = {
    unitOccupancy: {
      findFirst: vi.fn().mockResolvedValue({ id: 'link-1' }),
      findMany: vi.fn().mockResolvedValue([{ unitId: 'unit-1' }]),
    },
    gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate-1', active: true }) },
    accessRequest: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'access-1', ...data })),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({
        id: 'access-1',
        societyId: 'society-1',
        unitId: 'unit-1',
        requestedById: 'user-1',
        subjectType: AccessSubjectType.VISITOR,
        status: AccessRequestStatus.PENDING,
        metadata: { source: 'GATE_WALK_IN' },
      }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'access-1', status: AccessRequestStatus.APPROVED }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    auditEvent: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    gateMutationReceipt: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'receipt-1' }),
    },
    $transaction: vi.fn(),
    ...overrides,
  };
  const suppliedTransaction = overrides.$transaction as typeof prisma.$transaction | undefined;
  prisma.$transaction = suppliedTransaction ?? vi.fn(async (callback: (client: typeof prisma) => unknown) => callback(prisma));
  const entitlements = { isEnabled: vi.fn().mockResolvedValue(enabled) };
  return {
    svc: new AccessService(
      prisma as unknown as ConstructorParameters<typeof AccessService>[0],
      entitlements as unknown as ConstructorParameters<typeof AccessService>[1],
    ),
    prisma,
    entitlements,
  };
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

  it('strips gate-origin metadata from resident-created requests', async () => {
    const { svc, prisma } = setup();
    await svc.create('society-1', 'user-1', 'unit-1', AccessSubjectType.VISITOR, 'Rahul', undefined, undefined, {
      source: 'GATE_WALK_IN', gateId: 'gate-2', createdByGuardId: 'guard-2', note: 'expected',
    });
    expect(prisma.accessRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ metadata: { note: 'expected' } }),
    }));
  });

  it('creates an approved visitor invite and returns the raw gate credential once', async () => {
    const { svc, prisma, entitlements } = setup();
    const result = await svc.inviteVisitor(
      'society-1',
      'user-1',
      'unit-1',
      'Rahul',
      new Date(Date.now() - 1000),
      new Date(Date.now() + 60_000),
      '9999999999',
      'Dinner',
    );
    expect(entitlements.isEnabled).toHaveBeenCalledWith('society-1', ProductFeature.VISITOR_MANAGEMENT);
    expect(result.credential).toEqual(expect.any(String));
    expect(result.credential.length).toBeGreaterThan(20);
    expect(prisma.accessRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        subjectType: AccessSubjectType.VISITOR,
        status: AccessRequestStatus.APPROVED,
        credentialHash: expect.any(String),
      }),
    }));
    expect(prisma.auditEvent.create).toHaveBeenCalledTimes(2);
  });

  it('denies an access type disabled for the society tier', async () => {
    const { svc } = setup({}, false);
    await expect(svc.create('society-1', 'user-1', 'unit-1', AccessSubjectType.DOMESTIC_HELP, 'Maya')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies creation for a unit outside the resident household', async () => {
    const { svc } = setup({ unitOccupancy: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.create('society-1', 'user-1', 'unit-x', AccessSubjectType.VISITOR, 'Rahul')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects invalid approval validity windows', async () => {
    const { svc } = setup();
    const now = new Date();
    await expect(svc.approve('society-1', 'user-1', 'access-1', now, now)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    [AccessSubjectType.CAB, 15],
    [AccessSubjectType.DELIVERY, 30],
  ])('enforces the %s quick-arrival approval window server-side', async (subjectType, maxMinutes) => {
    const request = {
      id: 'access-1', societyId: 'society-1', unitId: 'unit-1', requestedById: 'user-1',
      subjectType, status: AccessRequestStatus.PENDING,
      metadata: { source: 'GATE_QUICK_ARRIVAL', gateId: 'gate-1' },
    };
    const { svc } = setup({ accessRequest: { findFirst: vi.fn().mockResolvedValue(request) } });
    const validFrom = new Date();

    await expect(svc.approve(
      'society-1', 'user-1', 'access-1', validFrom, new Date(validFrom.getTime() + (maxMinutes + 1) * 60_000),
    )).rejects.toThrow(`Gate arrival approval cannot exceed ${maxMinutes} minutes`);
  });

  it('rejects a delayed approval window for a gate-originated request', async () => {
    const request = {
      id: 'access-1', societyId: 'society-1', unitId: 'unit-1', requestedById: 'user-1',
      subjectType: AccessSubjectType.DELIVERY, status: AccessRequestStatus.PENDING,
      metadata: { source: 'GATE_QUICK_ARRIVAL', gateId: 'gate-1' },
    };
    const { svc } = setup({ accessRequest: { findFirst: vi.fn().mockResolvedValue(request) } });
    const validFrom = new Date(Date.now() + 10 * 60_000);

    await expect(svc.approve(
      'society-1', 'user-1', 'access-1', validFrom, new Date(validFrom.getTime() + 10 * 60_000),
    )).rejects.toThrow('Gate arrival approval must start immediately');
  });

  it('does not allow a resident to approve another resident request', async () => {
    const { svc } = setup({ accessRequest: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.approve('society-1', 'user-1', 'access-x', new Date(Date.now() - 1000), new Date(Date.now() + 1000))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows an active tenant gate approver to decide a unit request', async () => {
    const { svc, prisma } = setup();
    await svc.approve('society-1', 'tenant-1', 'access-1', new Date(Date.now() - 1000), new Date(Date.now() + 60_000));
    expect(prisma.unitOccupancy.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        societyId: 'society-1', unitId: 'unit-1', userId: 'tenant-1', active: true, gateApprovalEnabled: true,
      }),
    }));
  });

  it('denies a non-resident owner gate approval when no active occupancy exists', async () => {
    const { svc } = setup({ unitOccupancy: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(
      svc.approve('society-1', 'owner-1', 'access-1', new Date(Date.now() - 1000), new Date(Date.now() + 60_000)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets a notification-only occupant retrieve the gate request without granting approval', async () => {
    const { svc, prisma } = setup();
    await svc.listMine('society-1', 'resident-1');
    expect(prisma.unitOccupancy.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        societyId: 'society-1', userId: 'resident-1', active: true, gateNotificationEnabled: true,
      }),
    }));
  });

  it('does not let another occupant decide a private resident-created request', async () => {
    const request = {
      id: 'access-1', societyId: 'society-1', unitId: 'unit-1', requestedById: 'resident-1',
      subjectType: AccessSubjectType.VISITOR, status: AccessRequestStatus.PENDING, metadata: {},
    };
    const { svc } = setup({ accessRequest: { findFirst: vi.fn().mockResolvedValue(request) } });
    await expect(
      svc.approve('society-1', 'tenant-1', 'access-1', new Date(Date.now() - 1000), new Date(Date.now() + 60_000)),
    ).rejects.toBeInstanceOf(NotFoundException);
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

  it('rejects expired, cancelled and reused credentials safely', async () => {
    const base = {
      id: 'access-1', societyId: 'society-1', unitId: 'unit-1', requestedById: 'user-1',
      subjectType: AccessSubjectType.VISITOR, metadata: {}, validFrom: new Date(Date.now() - 60_000),
      validUntil: new Date(Date.now() - 1000),
    };
    const expired = setup({ accessRequest: { findFirst: vi.fn().mockResolvedValue({ ...base, status: AccessRequestStatus.APPROVED }) } }).svc;
    await expect(expired.verify('society-1', 'gate-1', 'credential')).rejects.toThrow('outside its validity window');
    await expect(expired.checkIn('society-1', 'gate-1', 'credential', 'guard-1', 'expired-key')).rejects.toThrow('outside its validity window');

    for (const status of [AccessRequestStatus.CANCELLED, AccessRequestStatus.CHECKED_OUT]) {
      const reused = setup({ accessRequest: { findFirst: vi.fn().mockResolvedValue({ ...base, status, validUntil: new Date(Date.now() + 60_000) }) } }).svc;
      await expect(reused.verify('society-1', 'gate-1', 'credential')).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('rejects a gate-originated request at a different gate', async () => {
    const request = {
      id: 'access-1', societyId: 'society-1', unitId: 'unit-1', requestedById: 'user-1',
      subjectType: AccessSubjectType.VISITOR, status: AccessRequestStatus.APPROVED,
      metadata: { source: 'GATE_WALK_IN', gateId: 'gate-1' },
    };
    const { svc } = setup({ accessRequest: { findFirst: vi.fn().mockResolvedValue(request) } });

    await expect(svc.gateRequestStatus('society-1', 'gate-2', 'access-1')).rejects.toThrow('Access request belongs to a different gate');
    await expect(svc.checkInRequest('society-1', 'gate-2', 'access-1', 'guard-2', 'wrong-gate')).rejects.toThrow('Access request belongs to a different gate');
  });

  it('allows a resident-issued credential at any authorized society gate', async () => {
    const request = {
      id: 'access-1', societyId: 'society-1', unitId: 'unit-1', requestedById: 'user-1',
      subjectType: AccessSubjectType.VISITOR, status: AccessRequestStatus.APPROVED,
      validFrom: new Date(Date.now() - 1000), validUntil: new Date(Date.now() + 60_000), metadata: {},
    };
    const { svc } = setup({ accessRequest: { findFirst: vi.fn().mockResolvedValue(request) } });

    await expect(svc.verify('society-1', 'gate-2', 'credential', 'guard-2')).resolves.toBe(request);
  });

  it('does not resolve a request id outside the authenticated society', async () => {
    const findFirst = vi.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
      if (where.id === 'foreign-request' && where.societyId === 'society-1') return Promise.resolve(null);
      return Promise.resolve({ id: 'access-1', societyId: 'society-1', status: AccessRequestStatus.APPROVED });
    });
    const { svc } = setup({ accessRequest: { findFirst, updateMany: vi.fn(), findUniqueOrThrow: vi.fn() } });

    await expect(svc.checkInRequest('society-1', 'gate-1', 'foreign-request', 'guard-1', 'tenant-key')).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'foreign-request', societyId: 'society-1' } });
  });

  it('does not resolve a gate credential outside the authenticated society', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const { svc } = setup({ accessRequest: { findFirst, updateMany: vi.fn(), findUniqueOrThrow: vi.fn() } });

    await expect(svc.checkIn('society-1', 'gate-1', 'foreign-credential', 'guard-1', 'tenant-key')).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ societyId: 'society-1', credentialHash: expect.any(String) }) }));
  });

  it('keeps the gate-mutation pre-check tenant scoped', async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce({
        id: 'access-1',
        societyId: 'society-1',
        subjectType: AccessSubjectType.VISITOR,
        status: AccessRequestStatus.APPROVED,
      })
      .mockResolvedValueOnce(null);
    const { svc, prisma } = setup({
      accessRequest: {
        findFirst,
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn(),
      },
    });

    await expect(svc.checkInRequest('society-1', 'gate-1', 'access-1', 'guard-1', 'tenant-key')).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst.mock.calls[1]?.[0]).toEqual({ where: { id: 'access-1', societyId: 'society-1' } });
    expect(prisma.accessRequest.updateMany).not.toHaveBeenCalled();
  });

  it('returns the previously committed result for a repeated idempotency key within the same society', async () => {
    const existing = {
      id: 'receipt-1',
      societyId: 'society-1',
      gateId: 'gate-1',
      accessRequestId: 'access-1',
      actorUserId: 'guard-1',
      idempotencyKey: 'same-key',
      action: GateMutationAction.CHECK_IN,
    };
    const findFirst = vi.fn()
      .mockResolvedValueOnce({
        id: 'access-1',
        societyId: 'society-1',
        requestedById: 'user-1',
        subjectType: AccessSubjectType.VISITOR,
        status: AccessRequestStatus.APPROVED,
        validFrom: new Date(Date.now() - 1000),
        validUntil: new Date(Date.now() + 60_000),
      })
      .mockResolvedValueOnce({ id: 'access-1', societyId: 'society-1', status: AccessRequestStatus.CHECKED_IN });
    const { svc, prisma } = setup({
      accessRequest: {
        findFirst,
        findUniqueOrThrow: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      gateMutationReceipt: { findUnique: vi.fn().mockResolvedValue(existing), create: vi.fn() },
    });

    const result = await svc.checkIn('society-1', 'gate-1', 'credential', 'guard-1', 'same-key');
    expect(result.status).toBe(AccessRequestStatus.CHECKED_IN);
    expect(findFirst.mock.calls[1]?.[0]).toEqual({ where: { id: 'access-1', societyId: 'society-1' } });
    expect(prisma.accessRequest.updateMany).not.toHaveBeenCalled();
    expect(prisma.gateMutationReceipt.create).not.toHaveBeenCalled();
  });

  it('returns the committed result when a concurrent retry loses the status race', async () => {
    const receipt = {
      id: 'receipt-1', societyId: 'society-1', gateId: 'gate-1', accessRequestId: 'access-1',
      actorUserId: 'guard-1', idempotencyKey: 'concurrent-key', action: GateMutationAction.CHECK_IN,
    };
    const approved = {
      id: 'access-1', societyId: 'society-1', requestedById: 'user-1', subjectType: AccessSubjectType.VISITOR,
      status: AccessRequestStatus.APPROVED, validFrom: new Date(Date.now() - 1000), validUntil: new Date(Date.now() + 60_000),
      metadata: {},
    };
    const findFirst = vi.fn()
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce({ ...approved, status: AccessRequestStatus.CHECKED_IN });
    const findUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(receipt);
    const { svc } = setup({
      accessRequest: { findFirst, updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
      gateMutationReceipt: { findUnique, create: vi.fn() },
      $transaction: vi.fn().mockRejectedValue(new BadRequestException('Access request is not ready for check-in')),
    });

    await expect(svc.checkIn('society-1', 'gate-1', 'credential', 'guard-1', 'concurrent-key')).resolves.toEqual(
      expect.objectContaining({ status: AccessRequestStatus.CHECKED_IN }),
    );
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('keeps a conflicting concurrent idempotency key rejected', async () => {
    const conflicting = {
      id: 'receipt-1', societyId: 'society-1', gateId: 'gate-1', accessRequestId: 'another-request',
      actorUserId: 'guard-1', idempotencyKey: 'conflict-key', action: GateMutationAction.CHECK_IN,
    };
    const request = {
      id: 'access-1', societyId: 'society-1', requestedById: 'user-1', subjectType: AccessSubjectType.VISITOR,
      status: AccessRequestStatus.APPROVED, validFrom: new Date(Date.now() - 1000), validUntil: new Date(Date.now() + 60_000),
      metadata: {},
    };
    const { svc } = setup({
      accessRequest: { findFirst: vi.fn().mockResolvedValue(request), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
      gateMutationReceipt: { findUnique: vi.fn().mockResolvedValue(conflicting), create: vi.fn() },
    });

    await expect(svc.checkIn('society-1', 'gate-1', 'credential', 'guard-1', 'conflict-key')).rejects.toThrow(
      'Idempotency key was already used for a different gate operation',
    );
  });
});
