import { describe, expect, it, vi } from 'vitest';
import { FacilitiesPreventiveController } from './facilities-preventive.controller';

describe('FacilitiesPreventiveController V4.20.3 evidence', () => {
  it('returns plan, generated work, linked contracts and related evidence within society scope', async () => {
    const prisma={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{id:'plan-1',title:'Lift monthly service',assetId:'asset-1'}])
      .mockResolvedValueOnce([{id:'wo-1',title:'Lift monthly service',status:'COMPLETED'}])
      .mockResolvedValueOnce([{id:'contract-1',title:'Lift AMC',status:'ACTIVE'}])
      .mockResolvedValueOnce([{id:'ev-1',kind:'SERVICE_REPORT'}])};
    const controller=new FacilitiesPreventiveController(prisma as never,{ } as never);

    const result=await controller.evidence('society-1','11111111-1111-4111-8111-111111111111');

    expect(result).toEqual(expect.objectContaining({
      plan:expect.objectContaining({id:'plan-1'}),
      workOrders:[expect.objectContaining({id:'wo-1'})],
      contracts:[expect.objectContaining({id:'contract-1'})],
      evidence:[expect.objectContaining({id:'ev-1'})],
    }));
    expect(result.boundary).toContain('Operational maintenance evidence only');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
  });
});
