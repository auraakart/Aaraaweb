import { describe, expect, it, vi } from 'vitest';
import { WorkforceService } from './workforce.service';

describe('WorkforceService occupant privacy for AI',()=>{
  it('does not substitute verified ownership for active occupancy',async()=>{
    const prisma={
      unitOccupancy:{findFirst:vi.fn().mockResolvedValue(null)},
      $queryRaw:vi.fn(),
    };
    const service=new WorkforceService(prisma as never,{} as never);
    await expect(service.residentStatusMine(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    )).rejects.toThrow('Household workforce not found');
    expect(prisma.unitOccupancy.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({
        societyId:'11111111-1111-4111-8111-111111111111',
        userId:'22222222-2222-4222-8222-222222222222',
        unitId:'33333333-3333-4333-8333-333333333333',
        active:true,
      }),
    }));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns workforce evidence to an active occupant only',async()=>{
    const prisma={
      unitOccupancy:{findFirst:vi.fn().mockResolvedValue({id:'occupancy-1'})},
      $queryRaw:vi.fn().mockResolvedValue([
        {id:'assignment-1',name:'Maya',role:'MAID',verification:'VERIFIED',status:'APPROVED',onLeaveToday:false,checkedInNow:true},
      ]),
    };
    const service=new WorkforceService(prisma as never,{} as never);
    const result=await service.residentStatusMine('society-1','resident-1','unit-1');
    expect(result.activeAssignmentCount).toBe(1);
    expect(result.checkedInCount).toBe(1);
    expect(result.onLeaveCount).toBe(0);
    expect(result.staff).toEqual([expect.objectContaining({name:'Maya',checkedInNow:true})]);
  });
});
