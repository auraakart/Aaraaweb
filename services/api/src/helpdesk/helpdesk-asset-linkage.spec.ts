import { describe,expect,it,vi } from 'vitest';
import { HelpdeskService } from './helpdesk.service';

describe('V4.71 helpdesk facility-asset linkage',()=>{
  it('uses same-asset recurrence evidence when an asset is linked',async()=>{
    const prisma={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{
        id:'ticket-1',societyId:'society-1',unitId:'unit-1',createdById:'resident-1',idempotencyKey:null,
        title:'Lift vibration',description:'Lift is vibrating',category:'LIFT',priority:'HIGH',status:'OPEN',assignedToId:null,
        assetId:'asset-1',resolvedAt:null,closedAt:null,createdAt:new Date(),updatedAt:new Date(),unitNumber:'A-101',buildingName:'A',
        assetCode:'LIFT-A',assetName:'Tower A Lift',
      }])
      .mockResolvedValueOnce([{recurringCount:3,latestSimilarAt:new Date('2026-09-27T08:00:00Z')}])
      .mockResolvedValueOnce([{userId:'u1',name:'Asha',phone:'+911',openTickets:1}])};
    const service=new HelpdeskService(prisma as never);
    const result=await service.triageIntelligence('society-1','ticket-1');
    expect(result.asset).toMatchObject({id:'asset-1',code:'LIFT-A'});
    expect(result.recurring).toMatchObject({scope:'SAME_ASSET',similarLast90Days:3,sameAssetSimilarLast90Days:3,sameUnitSimilarLast90Days:0});
    expect(result.predictive).toBe(false);
  });

  it('rejects a cross-society or retired asset before changing the ticket',async()=>{
    const queryRaw=vi.fn().mockResolvedValueOnce([{id:'ticket-1',status:'OPEN',assetId:null}]).mockResolvedValueOnce([]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof queryRaw})=>Promise<unknown>)=>cb({$queryRaw:queryRaw}));
    const service=new HelpdeskService({$transaction:transaction} as never);
    await expect(service.linkAsset('society-1','actor-1','ticket-1','asset-other')).rejects.toThrow('facility asset');
  });
});
