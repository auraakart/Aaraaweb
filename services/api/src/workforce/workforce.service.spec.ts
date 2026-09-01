import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceService } from './workforce.service';

describe('WorkforceService tenant isolation', () => {
  it('does not reveal a household outside the authenticated society', async () => {
    const prisma = {
      household: { findFirst: vi.fn().mockResolvedValue(null) },
      unitResident: { findFirst: vi.fn() },
    };
    const service = new WorkforceService(prisma as unknown as PrismaService);

    await expect(
      service.addWorker('society-a', 'resident-a', {
        householdId: 'household-b',
        name: 'Maya',
        phone: '+919900000000',
        role: 'MAID',
      }),
    ).rejects.toThrow('Household not found');
    expect(prisma.household.findFirst).toHaveBeenCalledWith({ where: { id: 'household-b', societyId: 'society-a' } });
    expect(prisma.unitResident.findFirst).not.toHaveBeenCalled();
  });

  it('scopes society review lookup by assignment id and tenant society', async () => {
    const prisma = {
      workforceAssignment: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new WorkforceService(prisma as unknown as PrismaService);

    await expect(service.review('society-a', 'assignment-b', 'APPROVED')).rejects.toThrow(
      'Active workforce assignment not found',
    );
    expect(prisma.workforceAssignment.findFirst).toHaveBeenCalledWith({
      where: { id: 'assignment-b', societyId: 'society-a', active: true },
      include: { worker: true },
    });
  });
});
