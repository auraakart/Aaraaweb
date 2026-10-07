import { BadRequestException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { ReportsAnalyticsService } from './reports-analytics.service';

function setup(){
  const prisma={$queryRaw:vi.fn()};
  return {prisma,service:new ReportsAnalyticsService(prisma as never)};
}

describe('ReportsAnalyticsService',()=>{
  it('returns resident/guard journey funnels from authoritative domain aggregates',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{requested:10,approved:8,entered:7,exited:6}])
      .mockResolvedValueOnce([{created:5,resolved:3,closed:2}])
      .mockResolvedValueOnce([{requested:9,confirmed:7,inProgress:5,completed:4}])
      .mockResolvedValueOnce([{created:6,captured:5,failed:1}]);
    const result=await service.journeyFunnel('society-1','2026-09-01T00:00:00.000Z','2026-09-17T00:00:00.000Z');
    expect(result).toEqual(expect.objectContaining({
      visitor:{requested:10,approved:8,entered:7,exited:6},
      helpdesk:{created:5,resolved:3,closed:2},
      services:{requested:9,confirmed:7,inProgress:5,completed:4},
      payments:{created:6,captured:5,failed:1},
      source:'authoritative-domain-records',
    }));
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
  });

  it('returns SLA, facilities and emergency incident operations aggregates',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{open:12,responseBreached:2,resolutionBreached:1,resolvedInRange:8}])
      .mockResolvedValueOnce([{open:4,inProgress:3,completedInRange:7,overdue:2,criticalOpen:1}])
      .mockResolvedValueOnce([{active:2,acknowledged:1,criticalOpen:1,resolvedInRange:3,createdInRange:6}]);
    await expect(service.operationsDashboard('society-1','2026-09-01','2026-09-17')).resolves.toEqual(expect.objectContaining({
      helpdesk:expect.objectContaining({responseBreached:2}),
      facilities:expect.objectContaining({overdue:2}),
      incidents:expect.objectContaining({criticalOpen:1}),
      source:'authoritative-domain-records',
    }));
  });

  it('includes aggregate gate fallback and resident activation pilot evidence',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{resolved:8,met:7,breached:1}])
      .mockResolvedValueOnce([{processed:20,avgProcessingSeconds:42,avgApprovalSeconds:18}])
      .mockResolvedValueOnce([{pushQueued:10,ivrSimulated:2,manualRequired:1,missingPhone:1}])
      .mockResolvedValueOnce([{syncRuns:2,actionsConsidered:10,actionsSynced:9,actionsRetried:1,actionsUnresolved:1,reviewRequired:1}])
      .mockResolvedValueOnce([{activeAmenities:2,confirmedBookings:4,distinctUsers:3,bookingHours:6}])
      .mockResolvedValueOnce([{attempted:10,dispatched:9,retried:1}])
      .mockResolvedValueOnce([{bookings:5,completed:4,cancelled:1,distinctBookers:3}])
      .mockResolvedValueOnce([{eligibleResidents:10,activeResidents:6}])
      .mockResolvedValueOnce([{serviceDiscoverers:5,serviceBookers:3,propertySwitchers:2}]);
    const result=await service.outcomes('society-1','2026-09-01','2026-09-17',false);
    expect(result.gateFallback).toMatchObject({pushQueued:10,ivrSimulated:2,manualRequired:1,missingPhone:1,fallbackRequiredPercent:7.69});
    expect(result.adoption).toMatchObject({eligibleResidents:10,activeResidents:6,activationPercent:60,propertySwitchers:2});
    expect(result.gateFallback.boundary).toContain('delivery evidence only');
  });

  it('rejects invalid or excessive report ranges',async()=>{
    const {service}=setup();
    await expect(service.journeyFunnel('society-1','not-a-date','2026-09-17')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.operationsDashboard('society-1','2024-01-01','2026-09-17')).rejects.toBeInstanceOf(BadRequestException);
  });
});
