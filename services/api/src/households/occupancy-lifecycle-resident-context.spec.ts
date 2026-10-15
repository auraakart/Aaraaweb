import { describe, expect, it, vi } from 'vitest';
import { OccupancyLifecycleService } from './occupancy-lifecycle.service';

describe('OccupancyLifecycleService resident property context', () => {
  it('preserves ownedUnitIds while enriching occupancies and owned units with property labels', async () => {
    const prisma={
      unitOccupancy:{findMany:vi.fn().mockResolvedValue([
        {id:'occ-1',unitId:'unit-1',relation:'OWNER',effectiveFrom:new Date(),unit:{id:'unit-1',number:'101',building:{id:'b-1',name:'A Block',code:'A'}}},
      ])},
      unitOwnership:{findMany:vi.fn().mockResolvedValue([
        {unitId:'unit-1',ownershipBps:10000,unit:{id:'unit-1',number:'101',building:{id:'b-1',name:'A Block',code:'A'}}},
      ])},
    };
    const service=new OccupancyLifecycleService(prisma as never);
    const result=await service.selfContext('society-1','user-1');

    expect(result.ownedUnitIds).toEqual(['unit-1']);
    expect(result.ownedUnits[0]).toEqual(expect.objectContaining({
      unitId:'unit-1',
      unit:expect.objectContaining({number:'101',building:expect.objectContaining({name:'A Block'})}),
    }));
    expect(result.occupancies[0]).toEqual(expect.objectContaining({
      unitId:'unit-1',
      unit:expect.objectContaining({number:'101',building:expect.objectContaining({name:'A Block'})}),
    }));
  });
});
