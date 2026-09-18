import { describe,expect,it,vi } from 'vitest';
import { ReportsAnalyticsService } from './reports-analytics.service';

function setup(){
  const prisma={$queryRaw:vi.fn()};
  return {prisma,service:new ReportsAnalyticsService(prisma as never)};
}

describe('V4.8 outcome analytics',()=>{
  it('derives operational KPIs without exposing finance amounts to non-finance readers',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{resolved:10,met:8,breached:2}])
      .mockResolvedValueOnce([{processed:12,avgProcessingSeconds:18.5,avgApprovalSeconds:42.0}])
      .mockResolvedValueOnce([{syncRuns:4,actionsConsidered:10,actionsSynced:8,actionsRetried:3,actionsUnresolved:2,reviewRequired:1}])
      .mockResolvedValueOnce([{activeAmenities:3,confirmedBookings:9,distinctUsers:6,bookingHours:12.5}])
      .mockResolvedValueOnce([{attempted:20,dispatched:18,retried:2}])
      .mockResolvedValueOnce([{bookings:5,completed:4,cancelled:1,distinctBookers:4}])
      .mockResolvedValueOnce([{eligibleResidents:20,activeResidents:15}])
      .mockResolvedValueOnce([{serviceDiscoverers:8,serviceBookers:4,propertySwitchers:3}]);

    const result=await service.outcomes('society-1','2026-09-01','2026-09-17',false);
    expect(result.finance).toBeNull();
    expect(result.helpdesk.slaCompliancePercent).toBe(80);
    expect(result.guardOfflineSync.unresolvedPercent).toBe(20);
    expect(result.notifications.deliverySuccessPercent).toBe(90);
    expect(result.services.discoveryToBookingPercent).toBe(50);
    expect(result.adoption.activationPercent).toBe(75);
    expect(result.evidence).toContain('pseudonymous');
  });

  it('includes finance outcomes only when finance access is explicitly enabled',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{billedPaise:1000000,collectedPaise:800000}])
      .mockResolvedValueOnce([{currentPaise:10000,days1To30Paise:20000,days31To60Paise:30000,days61To90Paise:40000,days90PlusPaise:50000}])
      .mockResolvedValueOnce([{open:2}])
      .mockResolvedValueOnce([{resolved:0,met:0,breached:0}])
      .mockResolvedValueOnce([{processed:0,avgProcessingSeconds:null,avgApprovalSeconds:null}])
      .mockResolvedValueOnce([{syncRuns:0,actionsConsidered:0,actionsSynced:0,actionsRetried:0,actionsUnresolved:0,reviewRequired:0}])
      .mockResolvedValueOnce([{activeAmenities:0,confirmedBookings:0,distinctUsers:0,bookingHours:0}])
      .mockResolvedValueOnce([{attempted:0,dispatched:0,retried:0}])
      .mockResolvedValueOnce([{bookings:0,completed:0,cancelled:0,distinctBookers:0}])
      .mockResolvedValueOnce([{eligibleResidents:0,activeResidents:0}])
      .mockResolvedValueOnce([{serviceDiscoverers:0,serviceBookers:0,propertySwitchers:0}]);

    const result=await service.outcomes('society-1','2026-09-01','2026-09-17',true);
    expect(result.finance).toEqual(expect.objectContaining({
      billedPaise:1000000,collectedPaise:800000,collectionPercent:80,reconciliationExceptions:2,
    }));
    expect(result.finance?.outstandingAgeingPaise.days90Plus).toBe(50000);
  });

  it('reports independent-home engagement only from platform consumer evidence',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{homeBookings:10,completed:7,cancelled:2,distinctUsers:8}])
      .mockResolvedValueOnce([{independentHomeEntrants:20}]);
    const result=await service.platformOutcomes('2026-09-01','2026-09-17');
    expect(result.independentHome).toEqual(expect.objectContaining({
      homeBookings:10,distinctUsers:8,bookingEngagementPercent:40,completionPercent:70,cancellationPercent:20,
    }));
  });
});
