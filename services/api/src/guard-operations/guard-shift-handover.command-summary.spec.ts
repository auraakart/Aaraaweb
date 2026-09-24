import { describe, expect, it, vi } from 'vitest';
import { GuardShiftHandoverService } from './guard-shift-handover.service';

describe('GuardShiftHandoverService command summary',()=>{
  it('raises advisory emergency attention from current critical incident evidence without changing access state',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{
      openHandovers:1,openIncidents:2,criticalIncidents:1,overstays:1,stalePatrol:1,activeDenyWatchlist:1,
    }])};
    const service=new GuardShiftHandoverService(prisma as unknown as ConstructorParameters<typeof GuardShiftHandoverService>[0]);
    const result=await service.commandSummary('11111111-1111-4111-8111-111111111111');
    expect(result.priority).toBe('CRITICAL');
    expect(result.operatingMode).toBe('EMERGENCY_ATTENTION');
    expect(result.automaticModeChange).toBe(false);
    expect(result.fallbackPolicy.automaticAccessGrant).toBe(false);
    expect(result.nextActions).toEqual(expect.arrayContaining([
      'Review critical incidents first and record the supervisor response.',
      'Incoming guard must review and acknowledge open shift handovers.',
    ]));
  });
});
