import { describe, expect, it, vi } from 'vitest';
import { GuardShiftHandoverService } from './guard-shift-handover.service';

describe('GuardShiftHandoverService V4.54 continuity',()=>{
  it('surfaces supervisor attention and multi-gate evidence without automatic access mutation',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{openHandovers:2,handoverOlder30m:1,openIncidents:3,criticalIncidents:1,criticalIncidentOlder30m:1,gatesWithOpenIncidents:2,overstays:0,stalePatrol:0,activeDenyWatchlist:0}])};
    const service=new GuardShiftHandoverService(prisma as never);
    const result=await service.commandSummary('society-1');
    expect(result.continuityStatus).toBe('SUPERVISOR_ATTENTION');
    expect(result.multiGateAttention).toBe(true);
    expect(result.clientOfflineQueueVisibility).toBe('DEVICE_LOCAL_ONLY');
    expect(result.fallbackPolicy.automaticAccessGrant).toBe(false);
  });
});
