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

  it('confirms with the preview version so stale tickets fail in Helpdesk controls',async()=>{
    const payload={ticketId:'ticket-1',assignedToId:'operator-1',expectedUpdatedAt:'2026-09-24T08:00:00.000Z'};
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{id:'proposal-1',action:'ASSIGN_HELPDESK_TICKET',payload,status:'EXECUTING',result:null}]),$executeRaw:vi.fn().mockResolvedValue(1)};
    const helpdesk={assign:vi.fn().mockResolvedValue({id:'ticket-1'})};
    const service=new AiOperationsService(prisma as never,helpdesk as never,{} as never,{} as never);
    const result=await service.confirmHelpdeskAssignment('society-1','actor-1','proposal-1');
    expect(helpdesk.assign).toHaveBeenCalledWith('society-1','actor-1','ticket-1','operator-1',payload.expectedUpdatedAt);
    expect(result.status).toBe('EXECUTED');
  });
});
