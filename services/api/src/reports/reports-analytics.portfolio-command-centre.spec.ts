import { describe,expect,it,vi } from 'vitest';
import { ReportsAnalyticsService } from './reports-analytics.service';

describe('V4.70 portfolio command centre',()=>{
  it('derives attention from authoritative cross-society current state without predictive scoring',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([
      {societyId:'s1',societyName:'Alpha',societyCode:'ALPHA',societyStatus:'ACTIVE',productTier:'PREMIUM',openHelpdesk:4,breachedHelpdesk:1,pendingGateApprovals:2,activeSos:0,criticalFacilityWork:0,overdueFacilityWork:1,overdueInvoices:3,activeResidents:100},
      {societyId:'s2',societyName:'Beta',societyCode:'BETA',societyStatus:'ACTIVE',productTier:'PROFESSIONAL',openHelpdesk:1,breachedHelpdesk:0,pendingGateApprovals:0,activeSos:1,criticalFacilityWork:0,overdueFacilityWork:0,overdueInvoices:0,activeResidents:80},
      {societyId:'s3',societyName:'Gamma',societyCode:'GAMMA',societyStatus:'ACTIVE',productTier:'STARTER',openHelpdesk:0,breachedHelpdesk:0,pendingGateApprovals:0,activeSos:0,criticalFacilityWork:0,overdueFacilityWork:0,overdueInvoices:0,activeResidents:25},
    ])};
    const service=new ReportsAnalyticsService(prisma as never);
    const result=await service.platformPortfolioCommandCentre();
    expect(result.summary).toMatchObject({societies:3,critical:1,high:1,watch:0});
    expect(result.societies.find(row=>row.societyId==='s2')).toMatchObject({attentionLevel:'CRITICAL',reasons:['ACTIVE_SOS']});
    expect(result.societies.find(row=>row.societyId==='s1')?.reasons).toEqual(expect.arrayContaining(['HELPDESK_SLA_BREACH','OVERDUE_MAINTENANCE']));
    expect(result.predictive).toBe(false);
    expect(result.mutationPerformed).toBe(false);
  });
});
