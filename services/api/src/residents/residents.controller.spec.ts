import { GUARDS_METADATA } from '@nestjs/common/constants';
import { MembershipRole, UnitRelation } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PermissionsGuard } from '../auth/permissions.guard';
import { AppPermission } from '../auth/permission.types';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { ResidentsController } from './residents.controller';

describe('ResidentsController authorization', () => {
  it('enforces PermissionsGuard at controller scope', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ResidentsController) as unknown[];
    expect(guards).toContain(PermissionsGuard);
  });

  it('requires society configuration read permission to list residents', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ResidentsController.prototype.list)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_READ,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ResidentsController.prototype.listOwnerships)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_READ,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ResidentsController.prototype.history)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_READ,
    ]);
  });

  it('requires society configuration manage permission for resident mutations', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ResidentsController.prototype.create)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_MANAGE,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ResidentsController.prototype.link)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_MANAGE,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ResidentsController.prototype.endOwnership)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_MANAGE,
    ]);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ResidentsController.prototype.membership)).toEqual([
      AppPermission.SOCIETY_CONFIGURATION_MANAGE,
    ]);
  });
});

describe('ResidentsController relationship lifecycle', () => {
  it('atomically removes occupant roles and revokes sessions on final move-out', async () => {
    const occupancy = {
      id: '11111111-1111-1111-1111-111111111111',
      societyId: '22222222-2222-2222-2222-222222222222',
      unitId: '33333333-3333-3333-3333-333333333333',
      userId: '44444444-4444-4444-4444-444444444444',
      relation: UnitRelation.TENANT,
      effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
      primaryGateContact: true,
    };
    const prisma = {
      unitOccupancy: {
        findFirst: vi.fn().mockResolvedValueOnce(occupancy).mockResolvedValueOnce(null),
        update: vi.fn().mockResolvedValue({ ...occupancy, active: false }),
        count: vi.fn().mockResolvedValue(0),
      },
      unitOwnership: { count: vi.fn().mockResolvedValue(0) },
      societyMembership: {
        upsert: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },
      session: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
    const controller = new ResidentsController(prisma as never);
    await controller.endOccupancy(
      occupancy.id,
      { effectiveTo: '2026-09-01T00:00:00.000Z' },
      occupancy.societyId,
    );
    expect(prisma.unitOccupancy.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ active: false, primaryGateContact: false, gateApprovalEnabled: false, gateNotificationEnabled: false }),
    }));
    expect(prisma.societyMembership.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ role: MembershipRole.TENANT, active: true }),
      data: { active: false },
    }));
    expect(prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: occupancy.userId, societyId: occupancy.societyId, revokedAt: null }),
    }));
  });

  it('forces the first occupant to be a notification-enabled primary contact', async () => {
    const prisma = {
      unit: { findFirst: vi.fn().mockResolvedValue({ id: '33333333-3333-3333-3333-333333333333' }) },
      unitOwnership: { updateMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
      unitOccupancy: {
        updateMany: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        count: vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1).mockResolvedValueOnce(0),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'occupancy-1', ...data })),
      },
      societyMembership: {
        upsert: vi.fn(),
        updateMany: vi.fn(),
        count: vi.fn().mockResolvedValue(1),
      },
      session: { updateMany: vi.fn() },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
    const controller = new ResidentsController(prisma as never);
    await controller.link({
      userId: '44444444-4444-4444-4444-444444444444',
      unitId: '33333333-3333-3333-3333-333333333333',
      relation: UnitRelation.TENANT,
      primaryGateContact: false,
      gateNotificationEnabled: false,
    }, '22222222-2222-2222-2222-222222222222');
    expect(prisma.unitOccupancy.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      primaryGateContact: true,
      gateNotificationEnabled: true,
    }) });
  });

  it('rejects scheduled move-out instead of revoking a resident early', async () => {
    const prisma = {
      unitOccupancy: { findFirst: vi.fn().mockResolvedValue({
        id: 'occupancy-1', effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
      }) },
      $transaction: vi.fn(),
    };
    const controller = new ResidentsController(prisma as never);
    await expect(controller.endOccupancy(
      '11111111-1111-1111-1111-111111111111',
      { effectiveTo: '2999-09-01T00:00:00.000Z' },
      '22222222-2222-2222-2222-222222222222',
    )).rejects.toThrow('Future move-out is not supported');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects scheduled relationship endings that would leave stale roles', async () => {
    const prisma = {
      unit: { findFirst: vi.fn().mockResolvedValue({ id: '33333333-3333-3333-3333-333333333333' }) },
      $transaction: vi.fn(),
    };
    const controller = new ResidentsController(prisma as never);
    await expect(controller.link({
      userId: '44444444-4444-4444-4444-444444444444',
      unitId: '33333333-3333-3333-3333-333333333333',
      relation: UnitRelation.TENANT,
      effectiveTo: '2999-09-01T00:00:00.000Z',
    }, '22222222-2222-2222-2222-222222222222')).rejects.toThrow('Scheduled relationship termination is not supported');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('prevents relationship roles from being granted without a unit relationship', () => {
    const prisma = { societyMembership: { upsert: vi.fn() } };
    const controller = new ResidentsController(prisma as never);
    expect(() => controller.membership({
      userId: '44444444-4444-4444-4444-444444444444',
      role: MembershipRole.TENANT,
    }, '22222222-2222-2222-2222-222222222222')).toThrow('must be managed through a unit relationship');
    expect(prisma.societyMembership.upsert).not.toHaveBeenCalled();
  });

  it('removes owner finance authority when a non-resident ownership ends', async () => {
    const ownership = {
      id: '11111111-1111-1111-1111-111111111111',
      societyId: '22222222-2222-2222-2222-222222222222',
      unitId: '33333333-3333-3333-3333-333333333333',
      userId: '44444444-4444-4444-4444-444444444444',
      effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
    };
    const prisma = {
      unitOwnership: {
        findFirst: vi.fn().mockResolvedValue(ownership),
        update: vi.fn().mockResolvedValue({ ...ownership, active: false }),
        count: vi.fn().mockResolvedValue(0),
      },
      unitOccupancy: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0) },
      societyMembership: {
        upsert: vi.fn(), updateMany: vi.fn(), count: vi.fn().mockResolvedValue(0),
      },
      session: { updateMany: vi.fn() },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
    const controller = new ResidentsController(prisma as never);
    await controller.endOwnership(ownership.id, { effectiveTo: '2026-09-01T00:00:00.000Z' }, ownership.societyId);
    expect(prisma.unitOwnership.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ active: false }),
    }));
    expect(prisma.societyMembership.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ role: MembershipRole.OWNER, active: true }),
    }));
    expect(prisma.session.updateMany).toHaveBeenCalled();
  });

  it('ends ownership and occupancy atomically when a resident owner moves out', async () => {
    const ownership = {
      id: '11111111-1111-1111-1111-111111111111', societyId: '22222222-2222-2222-2222-222222222222',
      unitId: '33333333-3333-3333-3333-333333333333', userId: '44444444-4444-4444-4444-444444444444',
      effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
    };
    const occupancy = { ...ownership, id: '55555555-5555-5555-5555-555555555555', primaryGateContact: true };
    const prisma = {
      unitOwnership: { findFirst: vi.fn().mockResolvedValue(ownership), update: vi.fn(), count: vi.fn().mockResolvedValue(0) },
      unitOccupancy: {
        findFirst: vi.fn().mockResolvedValueOnce(occupancy).mockResolvedValueOnce(null),
        update: vi.fn(), count: vi.fn().mockResolvedValue(0),
      },
      societyMembership: { upsert: vi.fn(), updateMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
      session: { updateMany: vi.fn() },
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
    const controller = new ResidentsController(prisma as never);
    await controller.endOwnership(ownership.id, { effectiveTo: '2026-09-01T00:00:00.000Z', endOccupancy: true }, ownership.societyId);
    expect(prisma.unitOccupancy.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: occupancy.id }, data: expect.objectContaining({ active: false, primaryGateContact: false }),
    }));
    expect(prisma.unitOwnership.update).toHaveBeenCalled();
  });
});
