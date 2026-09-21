import { describe, expect, it, vi } from 'vitest';
import { OccupancyLifecycleService } from './occupancy-lifecycle.service';

describe('OccupancyLifecycleService readiness evidence', () => {
  it('summarizes tenant-scoped checklist, documents and handover signals', async () => {
    const row={
      id:'11111111-1111-1111-1111-111111111111',
      societyId:'22222222-2222-2222-2222-222222222222',
      unitId:'33333333-3333-3333-3333-333333333333',
      userId:'44444444-4444-4444-4444-444444444444',
      occupancyId:'55555555-5555-5555-5555-555555555555',
      kind:'MOVE_OUT',relation:'TENANT',status:'APPROVED',
      effectiveAt:new Date('2026-09-20T00:00:00.000Z'),reason:null,
    };
    const prisma={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([{total:3n,required:3n,completedRequired:2n}])
        .mockResolvedValueOnce([{total:2n,verified:1n}])
        .mockResolvedValueOnce([{count:1n}]),
      household:{findFirst:vi.fn().mockResolvedValue({id:'66666666-6666-6666-6666-666666666666'})},
      unitOccupancy:{findFirst:vi.fn().mockResolvedValue({id:row.occupancyId,primaryGateContact:true,gateApprovalEnabled:true,gateNotificationEnabled:true})},
      householdVehicle:{count:vi.fn().mockResolvedValue(2)},
      workforceAssignment:{count:vi.fn().mockResolvedValue(1)},
    };
    const service=new OccupancyLifecycleService(prisma as never);
    const result=await service.readiness(row.societyId,row.id);
    expect(result).toEqual(expect.objectContaining({
      requestId:row.id,
      kind:'MOVE_OUT',
      checklist:{total:3,required:3,completedRequired:2,mandatoryReady:false},
      documents:{total:2,verified:1},
      handover:expect.objectContaining({
        activeVehicles:2,
        activeWorkforceAssignments:1,
        activeParkingAllocations:1,
        gateAuthority:{primaryGateContact:true,gateApprovalEnabled:true,gateNotificationEnabled:true},
      }),
    }));
    expect(prisma.household.findFirst).toHaveBeenCalledWith({
      where:{societyId:row.societyId,unitId:row.unitId},
      select:{id:true},
    });
  });

  it('returns zero handover counts when the unit has no household record', async () => {
    const row={
      id:'11111111-1111-1111-1111-111111111111',
      societyId:'22222222-2222-2222-2222-222222222222',
      unitId:'33333333-3333-3333-3333-333333333333',
      userId:'44444444-4444-4444-4444-444444444444',
      occupancyId:null,kind:'MOVE_IN',relation:'TENANT',status:'REQUESTED',
      effectiveAt:new Date('2026-09-20T00:00:00.000Z'),reason:null,
    };
    const prisma={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([row])
        .mockResolvedValueOnce([{total:3n,required:3n,completedRequired:3n}])
        .mockResolvedValueOnce([{total:0n,verified:0n}]),
      household:{findFirst:vi.fn().mockResolvedValue(null)},
      unitOccupancy:{findFirst:vi.fn().mockResolvedValue(null)},
      householdVehicle:{count:vi.fn()},
      workforceAssignment:{count:vi.fn()},
    };
    const service=new OccupancyLifecycleService(prisma as never);
    const result=await service.readiness(row.societyId,row.id);
    expect(result.handover).toEqual({
      activeVehicles:0,
      activeWorkforceAssignments:0,
      activeParkingAllocations:0,
      gateAuthority:null,
    });
    expect(prisma.householdVehicle.count).not.toHaveBeenCalled();
    expect(prisma.workforceAssignment.count).not.toHaveBeenCalled();
  });
});
