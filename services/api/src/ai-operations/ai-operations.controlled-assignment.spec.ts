import { describe, expect, it, vi } from 'vitest';
import { AiOperationsService } from './ai-operations.service';

describe('AiOperationsService controlled Helpdesk assignment',()=>{
  it('previews before creating an allow-listed proposal',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{id:'proposal-1',status:'PROPOSED',payload:{},createdAt:new Date()}]),$executeRaw:vi.fn()};
    const helpdesk={assignmentPreview:vi.fn().mockResolvedValue({ticketId:'ticket-1',title:'Lift issue',priority:'HIGH',property:'A · 101',currentAssigneeName:null,targetAssigneeName:'Operator',expectedUpdatedAt:'2026-09-24T08:00:00.000Z',impact:'Assign accountability',confirmationRequired:true,mutationPerformed:false})};
    const service=new AiOperationsService(prisma as never,helpdesk as never,{} as never,{} as never);
    const result=await service.proposeHelpdeskAssignment('society-1','actor-1',{ticketId:'ticket-1',assignedToId:'operator-1'});
    expect(helpdesk.assignmentPreview).toHaveBeenCalledWith('society-1','ticket-1','operator-1');
    expect(result).toMatchObject({action:'ASSIGN_HELPDESK_TICKET',requiresConfirmation:true,permissionChecked:true,autonomousExecution:false});
  });

  it('confirms with the preview version and returns a stable proposal identifier',async()=>{
    const payload={ticketId:'ticket-1',assignedToId:'operator-1',expectedUpdatedAt:'2026-09-24T08:00:00.000Z'};
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{id:'proposal-1',action:'ASSIGN_HELPDESK_TICKET',payload,status:'EXECUTING',result:null}]),$executeRaw:vi.fn().mockResolvedValue(1)};
    const helpdesk={assign:vi.fn().mockResolvedValue({id:'ticket-1'})};
    const service=new AiOperationsService(prisma as never,helpdesk as never,{} as never,{} as never);
    const result=await service.confirmHelpdeskAssignment('society-1','actor-1','proposal-1');
    expect(helpdesk.assign).toHaveBeenCalledWith('society-1','actor-1','ticket-1','operator-1',payload.expectedUpdatedAt);
    expect(result).toMatchObject({id:'proposal-1',proposalId:'proposal-1',status:'EXECUTED'});
  });

  it('returns the nested visitor-pass identifier without exposing the credential',async()=>{
    const payload={unitId:'unit-1',name:'Guest',phone:'9999999999',validFrom:'2026-09-25T10:00:00.000Z',validUntil:'2026-09-25T12:00:00.000Z'};
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{id:'proposal-2',action:'CREATE_VISITOR_PASS',payload,status:'EXECUTING',result:null}]),$executeRaw:vi.fn().mockResolvedValue(1)};
    const visitors={createPass:vi.fn().mockResolvedValue({visitor:{id:'visitor-1'},pass:{id:'pass-1'},credential:'raw-secret'})};
    const service=new AiOperationsService(prisma as never,{} as never,{} as never,visitors as never);
    const result=await service.confirmVisitor('society-1','actor-1','proposal-2');
    expect(result.result).toEqual({visitorPassId:'pass-1'});
    expect(JSON.stringify(result)).not.toContain('raw-secret');
  });

  it('blocks replay when the domain action succeeded but completion persistence is uncertain',async()=>{
    const payload={ticketId:'ticket-1',assignedToId:'operator-1',expectedUpdatedAt:'2026-09-24T08:00:00.000Z'};
    const prisma={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{id:'proposal-3',action:'ASSIGN_HELPDESK_TICKET',payload,status:'EXECUTING',result:null}])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{id:'proposal-3',action:'ASSIGN_HELPDESK_TICKET',payload,status:'EXECUTING',result:null}]),
      $executeRaw:vi.fn()
        .mockRejectedValueOnce(new Error('completion write failed'))
        .mockResolvedValueOnce(1),
    };
    const helpdesk={assign:vi.fn().mockResolvedValue({id:'ticket-1'})};
    const service=new AiOperationsService(prisma as never,helpdesk as never,{} as never,{} as never);

    await expect(service.confirmHelpdeskAssignment('society-1','actor-1','proposal-3'))
      .rejects.toThrow('AI operation outcome requires reconciliation before retry');
    await expect(service.confirmHelpdeskAssignment('society-1','actor-1','proposal-3'))
      .rejects.toThrow('AI operation proposal is executing');
    expect(helpdesk.assign).toHaveBeenCalledTimes(1);
  });
});
