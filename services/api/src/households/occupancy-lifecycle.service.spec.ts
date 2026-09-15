import { UnitRelation } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { OccupancyLifecycleService } from './occupancy-lifecycle.service';

describe('OccupancyLifecycleService boundaries', () => {
  it('does not expose another resident lifecycle request through self reads', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new OccupancyLifecycleService(prisma as never);
    await expect(service.getMine(
      '22222222-2222-2222-2222-222222222222',
      '44444444-4444-4444-4444-444444444444',
      '11111111-1111-1111-1111-111111111111',
    )).rejects.toThrow('Occupancy lifecycle request not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('revokes every gate authority flag when an approved move-out completes', async () => {
    const row = {
      id: '11111111-1111-1111-1111-111111111111',
      societyId: '22222222-2222-2222-2222-222222222222',
      unitId: '33333333-3333-3333-3333-333333333333',
      userId: '44444444-4444-4444-4444-444444444444',
      occupancyId: '55555555-5555-5555-5555-555555555555',
      kind: 'MOVE_OUT',
      relation: UnitRelation.TENANT,
      status: 'APPROVED',
      effectiveAt: new Date('2026-09-01T00:00:00.000Z'),
      reason: null,
    };
    const occupancy = {
      id: row.occupancyId,
      societyId: row.societyId,
      unitId: row.unitId,
      userId: row.userId,
      active: true,
      primaryGateContact: true,
      gateApprovalEnabled: true,
      gateNotificationEnabled: true,
    };
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([{ count: 0n }])
        .mockResolvedValueOnce([row]),
      $executeRaw: vi.fn().mockResolvedValue(1),
      unitOccupancy: {
        findFirst: vi.fn().mockResolvedValue(occupancy),
        update: vi.fn().mockResolvedValue({ ...occupancy, active: false }),
        create: vi.fn(),
      },
    };
    const prisma = { $transaction: vi.fn().mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx)) };
    const service = new OccupancyLifecycleService(prisma as never);
    await service.complete(row.societyId, '66666666-6666-6666-6666-666666666666', row.id);
    expect(tx.unitOccupancy.update).toHaveBeenCalledWith({
      where: { id: occupancy.id },
      data: {
        active: false,
        effectiveTo: row.effectiveAt,
        primaryGateContact: false,
        gateApprovalEnabled: false,
        gateNotificationEnabled: false,
      },
    });
  });
});
