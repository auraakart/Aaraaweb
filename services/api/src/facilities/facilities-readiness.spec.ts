import { describe, expect, it, vi } from 'vitest';
import { FacilitiesController } from './facilities.controller';

describe('FacilitiesController readiness', () => {
  it('prioritizes critical, overdue, unassigned and asset-state signals without changing lifecycle state', async () => {
    const dueAt=new Date(Date.now()-60_000);
    const prisma={$queryRaw:vi.fn().mockResolvedValue([
      {
        id:'work-1',title:'Lift breakdown',priority:'CRITICAL',status:'OPEN',dueAt,
        assetId:'asset-1',assetCode:'LIFT-1',assetName:'Tower lift',assetStatus:'OUT_OF_SERVICE',
        assignedUserId:null,assignedUserName:null,evidenceCount:0,verifiedEvidenceCount:0,
      },
      {
        id:'work-2',title:'Pump inspection',priority:'MEDIUM',status:'IN_PROGRESS',dueAt:null,
        assetId:'asset-2',assetCode:'PUMP-1',assetName:'Main pump',assetStatus:'ACTIVE',
        assignedUserId:'user-1',assignedUserName:'Facility User',evidenceCount:2,verifiedEvidenceCount:1,
      },
    ])};
    const controller=new FacilitiesController(prisma as never);
    const result=await controller.readiness('society-1');

    expect(result.summary).toEqual({
      activeWorkOrders:2,
      criticalActive:1,
      overdue:1,
      unassigned:1,
      outOfServiceAssetWork:1,
    });
    expect(result.items[0]).toEqual(expect.objectContaining({
      id:'work-1',
      overdue:true,
      signals:expect.arrayContaining(['PRIORITY_CRITICAL','WORK_ORDER_OVERDUE','ASSIGNEE_MISSING','ASSET_OUT_OF_SERVICE']),
      evidenceCount:0,
      verifiedEvidenceCount:0,
    }));
    expect(result.items[0].nextActions.length).toBeGreaterThan(0);
    expect(result.items[1].signals).toEqual([]);
  });
});
