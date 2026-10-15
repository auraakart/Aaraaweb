import { describe,expect,it,vi } from 'vitest';
import { ReportsAnalyticsService } from './reports-analytics.service';

describe('V4.70 field experience telemetry',()=>{
  it('combines privacy-minimal start signals with authoritative domain outcomes',async()=>{
    const prisma={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{amenityStarters:10,paymentStarters:8,helpdeskStarters:6}])
      .mockResolvedValueOnce([{bookers:7,bookings:9}])
      .mockResolvedValueOnce([{orderCreators:6,orders:7,capturedUsers:5}])
      .mockResolvedValueOnce([{submitters:5,tickets:6,resolvedUsers:4}])};
    const service=new ReportsAnalyticsService(prisma as never);
    const result=await service.experienceFunnel('society-1','2026-09-01','2026-09-28');
    expect(result.amenity).toMatchObject({startedUsers:10,completedUsers:7,completionPercent:70,coverageState:'TRACKED'});
    expect(result.payment).toMatchObject({startedUsers:8,completedUsers:6,completionPercent:75,capturedUsers:5});
    expect(result.helpdesk).toMatchObject({startedUsers:6,completedUsers:5,resolvedUsers:4});
    expect(result.privacy.rawInteractionTraceStored).toBe(false);
    expect(result.evidence).toContain('pseudonymous');
  });

  it('labels legacy/client rollout gaps instead of pretending missing start telemetry is abandonment',async()=>{
    const prisma={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{amenityStarters:1,paymentStarters:0,helpdeskStarters:0}])
      .mockResolvedValueOnce([{bookers:3,bookings:4}])
      .mockResolvedValueOnce([{orderCreators:2,orders:2,capturedUsers:2}])
      .mockResolvedValueOnce([{submitters:2,tickets:2,resolvedUsers:1}])};
    const service=new ReportsAnalyticsService(prisma as never);
    const result=await service.experienceFunnel('society-1','2026-09-01','2026-09-28');
    expect(result.amenity.coverageState).toBe('PARTIAL_CLIENT_COVERAGE');
    expect(result.payment.coverageState).toBe('PARTIAL_CLIENT_COVERAGE');
    expect(result.boundary).toContain('Partial coverage');
  });
});
