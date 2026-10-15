import { describe,expect,it,vi } from 'vitest';
import { ReportsAnalyticsService } from './reports-analytics.service';

describe('V4.75 platform portfolio outcome depth',()=>{
  it('returns aggregate cross-society outcomes without resident or unit records',async()=>{
    const queryRaw=vi.fn()
      .mockResolvedValueOnce([{
        societyId:'s1',societyName:'Alpha',societyCode:'ALPHA',societyStatus:'ACTIVE',productTier:'PREMIUM',
        openHelpdesk:2,breachedHelpdesk:0,pendingGateApprovals:1,activeSos:0,
        criticalFacilityWork:0,overdueFacilityWork:0,overdueInvoices:1,activeResidents:40,contractsExpiring30d:2,
      }])
      .mockResolvedValueOnce([{
        societyId:'s1',billedPaise:1000000n,collectedPaise:800000n,
        resolvedHelpdesk:4,slaMet:3,slaBreached:1,gateProcessed:120,avgGateProcessingSeconds:24.5,
        noticeAttempted:100,noticeDispatched:95,
      }]);
    const service=new ReportsAnalyticsService({$queryRaw:queryRaw} as never);
    const result=await service.platformPortfolioCommandCentre('2026-09-01T00:00:00.000Z','2026-09-30T23:59:59.000Z');

    expect(result.summary.outcomes.finance.collectionPercent).toBe(80);
    expect(result.summary.outcomes.helpdesk.slaCompliancePercent).toBe(75);
    expect(result.summary.outcomes.notifications.deliverySuccessPercent).toBe(95);
    expect(result.summary.outcomes.contractsExpiring30d).toBe(2);
    expect(result.societies[0]).toMatchObject({
      attentionLevel:'HIGH',
      contractsExpiring30d:2,
      outcomes:{
        finance:{billedPaise:1000000,collectedPaise:800000,collectionPercent:80},
        gate:{processed:120,avgProcessingSeconds:24.5},
      },
    });
    expect(result).toMatchObject({predictive:false,mutationPerformed:false,aggregateOnly:true});
    expect(JSON.stringify(result)).not.toContain('unitNumber');
    expect(JSON.stringify(result)).not.toContain('residentUserId');
  });
});
