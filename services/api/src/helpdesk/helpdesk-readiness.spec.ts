import { describe, expect, it, vi } from 'vitest';
import { HelpdeskSlaService } from './helpdesk-sla.service';

describe('HelpdeskSlaService readiness', () => {
  it('reports assignment, tracking and breach escalation blockers', async () => {
    const prisma={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{
          id:'ticket-1',priority:'URGENT',status:'IN_PROGRESS',assignedToId:null,
          firstRespondedAt:null,firstResponseDueAt:new Date(Date.now()-60_000),
          resolutionDueAt:new Date(Date.now()+3_600_000),resolvedAt:null,
          slaState:'RESPONSE_BREACHED',escalationLevel:0,escalatedToId:null,
          resolutionCode:null,closureCode:null,computedSlaState:'RESPONSE_BREACHED',
        }])
        .mockResolvedValueOnce([{
          firstResponseMinutes:15,resolutionMinutes:120,escalationAfterMinutes:30,
          automaticEscalationEnabled:true,escalationTargetUserId:'user-2',escalationTargetName:'Manager',
        }]),
    };
    const service=new HelpdeskSlaService(prisma as never);
    const result=await service.readiness('society-1','ticket-1');

    expect(result).toEqual(expect.objectContaining({
      assigned:false,
      computedSlaState:'RESPONSE_BREACHED',
      firstResponded:false,
      escalated:false,
      critical:true,
      blockers:expect.arrayContaining(['ASSIGNEE_MISSING','BREACH_NOT_ESCALATED']),
      policy:expect.objectContaining({firstResponseMinutes:15,resolutionMinutes:120}),
    }));
    expect(result.nextActions.length).toBeGreaterThan(0);
  });

  it('reports untracked SLA when no due dates exist', async () => {
    const prisma={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{
          id:'ticket-1',priority:'NORMAL',status:'OPEN',assignedToId:'user-2',
          firstRespondedAt:null,firstResponseDueAt:null,resolutionDueAt:null,resolvedAt:null,
          slaState:'UNTRACKED',escalationLevel:0,escalatedToId:null,
          resolutionCode:null,closureCode:null,computedSlaState:'UNTRACKED',
        }])
        .mockResolvedValueOnce([]),
    };
    const service=new HelpdeskSlaService(prisma as never);
    const result=await service.readiness('society-1','ticket-1');
    expect(result.blockers).toContain('SLA_UNTRACKED');
    expect(result.policy).toBeNull();
    expect(result.critical).toBe(false);
  });

  it('treats clean terminal tickets as audit-ready', async () => {
    const prisma={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{
          id:'ticket-1',priority:'NORMAL',status:'CLOSED',assignedToId:'user-2',
          firstRespondedAt:new Date(),firstResponseDueAt:new Date(),resolutionDueAt:new Date(),
          resolvedAt:new Date(),slaState:'MET',escalationLevel:0,escalatedToId:null,
          resolutionCode:'FIXED',closureCode:'RESOLVED_CONFIRMED',computedSlaState:'MET',
        }])
        .mockResolvedValueOnce([]),
    };
    const service=new HelpdeskSlaService(prisma as never);
    const result=await service.readiness('society-1','ticket-1');
    expect(result.blockers).toEqual([]);
    expect(result.nextActions.join(' ')).toContain('closure evidence');
  });
});
