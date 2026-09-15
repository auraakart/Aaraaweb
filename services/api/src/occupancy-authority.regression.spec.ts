import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccessRequestStatus, AccessSubjectType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AccessService } from './access/access.service';
import { AuthStateStore } from './auth/auth-state.store';
import { SessionService } from './auth/session.service';
import { HouseholdService } from './households/household.service';
import { PrismaService } from './prisma/prisma.service';

describe('V2.1B post-move-out authority regressions', () => {
  it('reloads active society memberships for every bearer principal resolution', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.REDIS_URL;
    const state = new AuthStateStore();
    const memberships = vi.fn()
      .mockResolvedValueOnce([{ role: 'RESIDENT' }])
      .mockResolvedValueOnce([]);
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'session-1',
          userId: '11111111-1111-4111-8111-111111111111',
          societyId: '22222222-2222-4222-8222-222222222222',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          user: { status: 'ACTIVE' },
          society: { status: 'ACTIVE' },
        }),
      },
      societyMembership: { findMany: memberships },
    };
    const service = new SessionService(prisma as unknown as PrismaService, state);
    try {
      await expect(service.getPrincipal('same-live-token')).resolves.toMatchObject({ roles: ['RESIDENT'] });
      await expect(service.getPrincipal('same-live-token')).resolves.toMatchObject({ roles: [] });
      expect(memberships).toHaveBeenCalledTimes(2);
      expect(memberships).toHaveBeenLastCalledWith({
        where: {
          userId: '11111111-1111-4111-8111-111111111111',
          societyId: '22222222-2222-4222-8222-222222222222',
          active: true,
        },
        select: { role: true },
      });
    } finally {
      await state.onModuleDestroy();
    }
  });

  it('allows an active gate-enabled occupant to approve a gate-originated request', async () => {
    const occupancyLookup = vi.fn().mockResolvedValue({ id: 'occupancy-1' });
    const request = {
      id: 'access-1',
      societyId: 'society-1',
      unitId: 'unit-1',
      requestedById: 'primary-host',
      subjectType: AccessSubjectType.VISITOR,
      status: AccessRequestStatus.PENDING,
      metadata: { source: 'GATE_WALK_IN', gateId: 'gate-1' },
    };
    const tx = {
      accessRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ ...request, status: AccessRequestStatus.APPROVED }),
      },
      auditEvent: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    const prisma = {
      unitOccupancy: { findFirst: occupancyLookup },
      accessRequest: { findFirst: vi.fn().mockResolvedValue(request) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const entitlements = { isEnabled: vi.fn().mockResolvedValue(true) };
    const service = new AccessService(
      prisma as unknown as ConstructorParameters<typeof AccessService>[0],
      entitlements as unknown as ConstructorParameters<typeof AccessService>[1],
    );
    const validFrom = new Date();
    const validUntil = new Date(validFrom.getTime() + 10 * 60 * 1000);

    await expect(service.approve(
      'society-1',
      'secondary-occupant',
      'access-1',
      validFrom,
      validUntil,
    )).resolves.toMatchObject({ request: { status: AccessRequestStatus.APPROVED } });

    expect(occupancyLookup).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        societyId: 'society-1',
        unitId: 'unit-1',
        userId: 'secondary-occupant',
        active: true,
        gateApprovalEnabled: true,
        effectiveFrom: expect.any(Object),
        OR: expect.any(Array),
      }),
      select: { id: true },
    }));
    expect(tx.accessRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'access-1', societyId: 'society-1', status: AccessRequestStatus.PENDING }),
    }));
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });

  it('does not grant routine gate approval authority from non-resident ownership alone', async () => {
    const occupancyLookup = vi.fn().mockResolvedValue(null);
    const ownershipLookup = vi.fn().mockResolvedValue({ id: 'ownership-1' });
    const transaction = vi.fn();
    const prisma = {
      unitOccupancy: { findFirst: occupancyLookup },
      unitOwnership: { findFirst: ownershipLookup },
      accessRequest: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'access-1',
          societyId: 'society-1',
          unitId: 'unit-1',
          requestedById: 'current-host',
          subjectType: AccessSubjectType.VISITOR,
          status: AccessRequestStatus.PENDING,
          metadata: { source: 'GATE_WALK_IN', gateId: 'gate-1' },
        }),
      },
      $transaction: transaction,
    };
    const entitlements = { isEnabled: vi.fn().mockResolvedValue(true) };
    const service = new AccessService(
      prisma as unknown as ConstructorParameters<typeof AccessService>[0],
      entitlements as unknown as ConstructorParameters<typeof AccessService>[1],
    );
    const validFrom = new Date();
    const validUntil = new Date(validFrom.getTime() + 10 * 60 * 1000);

    await expect(service.approve(
      'society-1',
      'non-resident-owner',
      'access-1',
      validFrom,
      validUntil,
    )).rejects.toBeInstanceOf(NotFoundException);

    expect(occupancyLookup).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        societyId: 'society-1',
        unitId: 'unit-1',
        userId: 'non-resident-owner',
        active: true,
        gateApprovalEnabled: true,
      }),
    }));
    expect(ownershipLookup).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not allow an ended occupant to approve a gate-originated request', async () => {
    const occupancyLookup = vi.fn().mockResolvedValue(null);
    const prisma = {
      unitOccupancy: { findFirst: occupancyLookup },
      accessRequest: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'access-1',
          societyId: 'society-1',
          unitId: 'unit-1',
          requestedById: 'current-host',
          subjectType: AccessSubjectType.VISITOR,
          status: AccessRequestStatus.PENDING,
          metadata: { source: 'GATE_WALK_IN', gateId: 'gate-1' },
        }),
      },
    };
    const entitlements = { isEnabled: vi.fn().mockResolvedValue(true) };
    const service = new AccessService(
      prisma as unknown as ConstructorParameters<typeof AccessService>[0],
      entitlements as unknown as ConstructorParameters<typeof AccessService>[1],
    );

    await expect(service.approve(
      'society-1',
      'former-tenant',
      'access-1',
      new Date(Date.now() - 1_000),
      new Date(Date.now() + 60_000),
    )).rejects.toBeInstanceOf(NotFoundException);

    expect(occupancyLookup).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        societyId: 'society-1',
        unitId: 'unit-1',
        userId: 'former-tenant',
        active: true,
        gateApprovalEnabled: true,
        effectiveFrom: expect.any(Object),
        OR: expect.any(Array),
      }),
    }));
  });

  it('does not allow an ended occupant to mutate household state', async () => {
    const occupancyLookup = vi.fn().mockResolvedValue(null);
    const householdUpdate = vi.fn();
    const prisma = {
      household: {
        findFirst: vi.fn().mockResolvedValue({ id: 'household-1', societyId: 'society-1', unitId: 'unit-1', accessPreferences: {} }),
        update: householdUpdate,
      },
      unitOccupancy: { findFirst: occupancyLookup },
    };
    const service = new HouseholdService(prisma as unknown as PrismaService);

    await expect(service.updatePreferences(
      'society-1',
      'former-tenant',
      'household-1',
      { quietHours: true },
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(occupancyLookup).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        societyId: 'society-1',
        unitId: 'unit-1',
        userId: 'former-tenant',
        active: true,
        effectiveFrom: expect.any(Object),
        OR: expect.any(Array),
      }),
    }));
    expect(householdUpdate).not.toHaveBeenCalled();
  });
});
