import { describe,expect,it,vi } from 'vitest';
import { AiCopilot } from './ai-copilot';

function setup(){
  const prisma={$queryRaw:vi.fn()};
  return {prisma,copilot:new AiCopilot(prisma as never)};
}

describe('V4.83.2 grounded operations copilot',()=>{
  it('plans only authorized domains for cross-domain questions',()=>{
    const {copilot}=setup();
    const plan=copilot.plan(
      'Why are lift facility work orders and helpdesk complaints increasing together?',
      ['HELPDESK_OPERATIONS','FACILITIES'],
    );
    expect(plan).toMatchObject({requested:true,multiDomain:true,selected:['HELPDESK_OPERATIONS','FACILITIES'],omitted:[]});
  });

  it('keeps mentioned but unauthorized domains out of the selected plan',()=>{
    const {copilot}=setup();
    const plan=copilot.plan('Compare finance overdue amounts with vendor procurement requests',['SOCIETY_FINANCE']);
    expect(plan.selected).toEqual(['SOCIETY_FINANCE']);
    expect(plan.omitted).toEqual(['VENDORS']);
    expect(plan.multiDomain).toBe(false);
  });

  it('grades evidence coverage separately from causal truth',()=>{
    const {copilot}=setup();
    expect(copilot.evidence(['HelpdeskTicket','FacilityWorkOrder'],{tickets:[{id:'1'}],workOrders:[{id:'2'}]}))
      .toEqual(expect.objectContaining({confidence:'HIGH',sourceCount:2,causalClaim:false}));
    expect(copilot.evidence([],{anything:true}))
      .toEqual(expect.objectContaining({confidence:'INSUFFICIENT',causalClaim:false}));
  });

  it('derives society-history baselines while preserving the gate safety default',async()=>{
    const {prisma,copilot}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([{
      helpdeskCurrent30:30,helpdeskPrevious30:20,
      facilitiesCorrectiveCurrent90:9,facilitiesCorrectivePrevious90:6,
      securityCurrent30:4,securityPrevious30:5,
      completedVisits30:40,visitorDwellP90Minutes:95,
    }]);
    const result=await copilot.societyBaselines('society-1');
    expect(result.helpdesk).toMatchObject({current:30,typical:20,changePercent:50,confidence:'HIGH'});
    expect(result.gate).toMatchObject({typical:95,sampleSize:40,confidence:'HIGH',fallbackSafetyThresholdMinutes:240});
    expect(result.gate.boundary).toContain('not relaxed');
  });

  it('produces explicit supporting and limiting evidence instead of causal claims',()=>{
    const {copilot}=setup();
    const result=copilot.hypotheses({
      HELPDESK_OPERATIONS:{breachedCount:3,unassignedCount:2},
      FACILITIES:{overdueWorkOrders:2,repeatedCorrectiveAssets90d:1},
      VENDORS:{submittedRequests:4},
    });
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({id:'helpdesk-facilities-coincidence',causalClaim:false,supportingEvidence:expect.any(Array),contradictingEvidence:expect.any(Array),nextVerification:expect.any(String)}),
      expect.objectContaining({id:'facilities-procurement-coincidence',causalClaim:false}),
    ]));
  });

  it('fingerprints recommendation evidence deterministically and changes when metrics change',()=>{
    const {copilot}=setup();
    const one=copilot.fingerprint({id:'helpdesk-sla',domain:'HELPDESK',metrics:{breachedCount:2,unassignedCount:1}});
    const same=copilot.fingerprint({id:'helpdesk-sla',domain:'HELPDESK',metrics:{unassignedCount:1,breachedCount:2}});
    const changed=copilot.fingerprint({id:'helpdesk-sla',domain:'HELPDESK',metrics:{breachedCount:3,unassignedCount:1}});
    expect(one).toBe(same);
    expect(one).not.toBe(changed);
  });
});
