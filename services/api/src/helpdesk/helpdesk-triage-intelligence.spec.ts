import { describe,expect,it,vi } from 'vitest';
import { HelpdeskService } from './helpdesk.service';

describe('V4.70 helpdesk triage intelligence',()=>{
  it('suggests a deterministic category, surfaces recurrence, and recommends only a unique lowest workload',async()=>{
    const prisma={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{
        id:'ticket-1',societyId:'society-1',unitId:'unit-1',createdById:'resident-1',idempotencyKey:null,
        title:'Water leak near kitchen',description:'Pipe below sink is leaking',category:null,priority:'HIGH',status:'OPEN',
        assignedToId:null,resolvedAt:null,closedAt:null,createdAt:new Date(),updatedAt:new Date(),unitNumber:'A-101',buildingName:'A Block',
      }])
      .mockResolvedValueOnce([{recurringCount:2,latestSimilarAt:new Date('2026-09-20T10:00:00Z')}])
      .mockResolvedValueOnce([
        {userId:'u1',name:'Asha',phone:'+911',openTickets:1},
        {userId:'u2',name:'Bala',phone:'+912',openTickets:3},
      ])};
    const service=new HelpdeskService(prisma as never);
    const result=await service.triageIntelligence('society-1','ticket-1');
    expect(result.suggestedCategory).toBe('PLUMBING');
    expect(result.classificationSignals).toContain('KEYWORD:WATER');
    expect(result.recurring).toMatchObject({sameUnitSimilarLast90Days:2,recurring:true});
    expect(result.assignment.recommendedAssignee).toMatchObject({userId:'u1',openTickets:1});
    expect(result.classificationApplied).toBe(false);
    expect(result.assignmentApplied).toBe(false);
    expect(result.predictive).toBe(false);
  });

  it('does not invent an assignee when lowest workload is tied',async()=>{
    const prisma={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{
        id:'ticket-2',societyId:'society-1',unitId:'unit-2',createdById:'resident-2',idempotencyKey:null,
        title:'Other request',description:'General request',category:'GENERAL',priority:'NORMAL',status:'OPEN',
        assignedToId:null,resolvedAt:null,closedAt:null,createdAt:new Date(),updatedAt:new Date(),unitNumber:'B-201',buildingName:'B Block',
      }])
      .mockResolvedValueOnce([{recurringCount:0,latestSimilarAt:null}])
      .mockResolvedValueOnce([
        {userId:'u1',name:'Asha',phone:'+911',openTickets:0},
        {userId:'u2',name:'Bala',phone:'+912',openTickets:0},
      ])};
    const service=new HelpdeskService(prisma as never);
    const result=await service.triageIntelligence('society-1','ticket-2');
    expect(result.assignment.recommendedAssignee).toBeNull();
    expect(result.classificationSignals).toEqual(['EXISTING_CATEGORY_RETAINED']);
  });
});
