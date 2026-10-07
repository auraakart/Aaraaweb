import { describe, expect, it, vi } from 'vitest';
import { GuardShiftHandoverService } from './guard-shift-handover.service';

describe('GuardShiftHandoverService command summary',()=>{
  it('raises advisory emergency attention from current critical incident evidence without changing access state',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{
      openHandovers:1,handoverOlder30m:0,oldestOpenHandoverMinutes:12,openIncidents:2,criticalIncidents:1,criticalIncidentOlder30m:0,oldestCriticalIncidentMinutes:8,gatesWithOpenIncidents:1,overstays:1,activeEntries:3,oldestActiveEntryMinutes:265,pendingApprovalsOlder10m:0,stalePatrol:1,activeDenyWatchlist:1,
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

  it('surfaces ageing resident approvals and shift continuity without granting access',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{
      openHandovers:1,handoverOlder30m:1,oldestOpenHandoverMinutes:47,
      openIncidents:0,criticalIncidents:0,criticalIncidentOlder30m:0,oldestCriticalIncidentMinutes:0,gatesWithOpenIncidents:0,
      overstays:0,activeEntries:2,oldestActiveEntryMinutes:36,pendingApprovalsOlder10m:3,
      stalePatrol:0,activeDenyWatchlist:0,
    }])};
    const service=new GuardShiftHandoverService(prisma as unknown as ConstructorParameters<typeof GuardShiftHandoverService>[0]);
    const result=await service.commandSummary('11111111-1111-4111-8111-111111111111');
    expect(result.priority).toBe('ELEVATED');
    expect(result.continuityStatus).toBe('HANDOVER_DUE');
    expect(result.pendingApprovalsOlder10m).toBe(3);
    expect(result.activeEntries).toBe(2);
    expect(result.oldestActiveEntryMinutes).toBe(36);
    expect(result.automaticModeChange).toBe(false);
    expect(result.fallbackPolicy.automaticAccessGrant).toBe(false);
    expect(result.nextActions).toContain('Follow up waiting resident approvals older than 10 minutes; do not grant access automatically.');
    expect(result.boundary).toContain('not access decisions');
  });
});
