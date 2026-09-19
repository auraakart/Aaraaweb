import { describe, expect, it, vi } from 'vitest';
import { PrivacyService } from './privacy.service';

describe('PrivacyService case readiness', () => {
  it('summarizes operational blockers and privacy-program context', async () => {
    const dueAt=new Date(Date.now()-60_000);
    const prisma={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{
          id:'case-1',societyId:'society-1',subjectUserId:'user-1',requestType:'ERASURE',status:'IN_REVIEW',
          requestSummary:'Erase data',assignedToUserId:null,legalHold:true,retentionReason:'Dispute',
          retentionDecision:'BLOCK',retentionDecisionReason:'Financial evidence',retentionReviewedAt:null,
          retentionReviewedByUserId:null,dueAt,closedAt:null,createdByUserId:'actor-1',
          createdAt:new Date(),updatedAt:new Date(),
        }])
        .mockResolvedValueOnce([{count:4}])
        .mockResolvedValueOnce([{count:2}])
        .mockResolvedValueOnce([{count:1}])
        .mockResolvedValueOnce([{active:true}])
    };
    const service=new PrivacyService(prisma as never);
    const result=await service.caseReadiness('society-1','case-1');

    expect(result).toEqual(expect.objectContaining({
      requestType:'ERASURE',
      assigned:false,
      overdue:true,
      blockers:expect.arrayContaining([
        'ASSIGNEE_MISSING','CASE_OVERDUE','LEGAL_HOLD_ACTIVE','RETENTION_REVIEW_NOT_ALLOWED',
      ]),
      privacyProgramContext:{
        activeDataCategories:4,
        activeProcessors:2,
        openSecurityIncidents:1,
        grievanceContactActive:true,
      },
    }));
    expect(result.nextActions.length).toBeGreaterThan(0);
  });

  it('does not report active-case blockers for a completed request', async () => {
    const prisma={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{
          id:'case-1',societyId:'society-1',subjectUserId:'user-1',requestType:'ACCESS',status:'COMPLETED',
          requestSummary:'Access data',assignedToUserId:null,legalHold:false,retentionReason:null,
          retentionDecision:null,retentionDecisionReason:null,retentionReviewedAt:null,
          retentionReviewedByUserId:null,dueAt:new Date(Date.now()-60_000),closedAt:new Date(),
          createdByUserId:'actor-1',createdAt:new Date(),updatedAt:new Date(),
        }])
        .mockResolvedValueOnce([{count:1}])
        .mockResolvedValueOnce([{count:1}])
        .mockResolvedValueOnce([{count:0}])
        .mockResolvedValueOnce([])
    };
    const service=new PrivacyService(prisma as never);
    const result=await service.caseReadiness('society-1','case-1');
    expect(result.blockers).toEqual([]);
    expect(result.overdue).toBe(false);
  });
});
