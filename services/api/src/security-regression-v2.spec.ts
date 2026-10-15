import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AccessService } from './access/access.service';
import { BillingService } from './billing/billing.service';
import { HouseholdService } from './households/household.service';
import { NoticesService } from './notices/notices.service';
import { PrismaService } from './prisma/prisma.service';
import { WorkforceService } from './workforce/workforce.service';

describe('commercial V1 relationship-expiry security regression', () => {
  it('removes household visibility immediately when no current occupancy remains', async () => {
    const prisma = {
      unitOccupancy: { findMany: vi.fn().mockResolvedValue([]) },
      household: { findMany: vi.fn() },
    };
    const service = new HouseholdService(prisma as unknown as PrismaService);

    await expect(service.listMine('society-a', 'moved-out-user')).resolves.toEqual([]);
    expect(prisma.household.findMany).not.toHaveBeenCalled();
    expect(prisma.unitOccupancy.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        societyId: 'society-a',
        userId: 'moved-out-user',
        active: true,
        effectiveFrom: expect.objectContaining({ lte: expect.any(Date) }),
        OR: [
          { effectiveTo: null },
          { effectiveTo: expect.objectContaining({ gt: expect.any(Date) }) },
        ],
      }),
    }));
  });

  it('denies household mutation after occupancy has expired even if the household still exists', async () => {
    const prisma = {
      household: {
        findFirst: vi.fn().mockResolvedValue({ id: 'household-a', societyId: 'society-a', unitId: 'unit-a' }),
        update: vi.fn(),
      },
      unitOccupancy: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new HouseholdService(prisma as unknown as PrismaService);

    await expect(
      service.updatePreferences('society-a', 'moved-out-user', 'household-a', { delivery: 'gate' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.household.update).not.toHaveBeenCalled();
    expect(prisma.unitOccupancy.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        societyId: 'society-a',
        userId: 'moved-out-user',
        unitId: 'unit-a',
        active: true,
        effectiveFrom: expect.objectContaining({ lte: expect.any(Date) }),
        OR: [
          { effectiveTo: null },
          { effectiveTo: expect.objectContaining({ gt: expect.any(Date) }) },
        ],
      }),
    }));
  });

  it('routes workforce gate events only to current notification-enabled occupants', async () => {
    const workforceFind = vi.fn().mockResolvedValue({
      id: 'assignment-a',
      societyId: 'society-a',
      householdId: 'household-a',
      workerId: 'worker-a',
      status: 'APPROVED',
      active: true,
      startDate: null,
      endDate: null,
      schedule: {},
      worker: {
        id: 'worker-a', name: 'Maya', phone: '+919900000000', role: 'MAID', active: true, verification: 'VERIFIED',
      },
      household: { unitId: 'unit-a', unit: { occupancies: [] } },
    });
    const prisma = {
      gateMutationReceipt: { findUnique: vi.fn().mockResolvedValue(null) },
      gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate-a', active: true }) },
      workforceAssignment: { findFirst: workforceFind },
    };
    const service = new WorkforceService(prisma as unknown as PrismaService, {} as AccessService);

    await expect(
      service.gateCheckIn('society-a', 'gate-a', 'assignment-a', 'guard-a', 'idem-expired'),
    ).rejects.toThrow('Destination household does not have an active resident');

    expect(workforceFind).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'assignment-a', societyId: 'society-a', active: true }),
      include: expect.objectContaining({
        household: expect.objectContaining({
          include: expect.objectContaining({
            unit: expect.objectContaining({
              include: expect.objectContaining({
                occupancies: expect.objectContaining({
                  where: expect.objectContaining({
                    active: true,
                    gateNotificationEnabled: true,
                    effectiveFrom: expect.objectContaining({ lte: expect.any(Date) }),
                    OR: [
                      { effectiveTo: null },
                      { effectiveTo: expect.objectContaining({ gt: expect.any(Date) }) },
                    ],
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    }));
  });

  it('keeps maintenance payability limited to verified current owners or current tenants', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new BillingService(prisma as unknown as PrismaService);

    await service.listPayable('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    const sql = (prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');

    expect(sql).toContain('uo."verified" = true');
    expect(sql).toContain('uo."active" = true');
    expect(sql).toContain('uo."effectiveFrom" <= CURRENT_TIMESTAMP');
    expect(sql).toContain('uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP');
    expect(sql).toContain('ur."relation" = \'TENANT\'');
    expect(sql).toContain('ur."active" = true');
    expect(sql).toContain('ur."effectiveFrom" <= CURRENT_TIMESTAMP');
    expect(sql).toContain('ur."effectiveTo" IS NULL OR ur."effectiveTo" > CURRENT_TIMESTAMP');
  });

  it('keeps notice visibility limited to current ownership or current occupancy for shared broadcasts', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new NoticesService(prisma as unknown as PrismaService);

    await service.listPublished('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    const sql = (prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');

    expect(sql).toContain('uo."verified"=true');
    expect(sql).toContain('uo."active"=true');
    expect(sql).toContain('uo."effectiveFrom"<=CURRENT_TIMESTAMP');
    expect(sql).toContain('uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP');
    expect(sql).toContain('n."audience"=\'OWNER_AND_OCCUPANTS\'');
    expect(sql).toContain('ur."active"=true');
    expect(sql).toContain('ur."effectiveFrom"<=CURRENT_TIMESTAMP');
    expect(sql).toContain('ur."effectiveTo" IS NULL OR ur."effectiveTo">CURRENT_TIMESTAMP');
  });
});
