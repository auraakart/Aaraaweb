import { describe, expect, it, vi } from 'vitest';
import { FacilitiesContractsController } from './facilities-contracts.controller';

function sqlText(call: unknown): string {
  return ((call as { strings?: readonly string[] }).strings ?? []).join('?');
}

describe('FacilitiesContractsController V4.20.3 linkage', () => {
  it('includes preventive-plan context in tenant-scoped contract listing', async () => {
    const prisma={$queryRaw:vi.fn().mockResolvedValue([])};
    const controller=new FacilitiesContractsController(prisma as never);
    await controller.list('society-1');
    const text=sqlText(prisma.$queryRaw.mock.calls[0]?.[0]);
    expect(text).toContain('FacilityMaintenancePlan');
    expect(text).toContain('maintenancePlanTitle');
    expect(text).toContain('maintenancePlanActive');
    expect(text).toContain('maintenancePlanNextDueAt');
    expect(text).toContain('c."societyId"');
  });
});
