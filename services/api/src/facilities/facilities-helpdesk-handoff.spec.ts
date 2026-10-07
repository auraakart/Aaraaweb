import { ConflictException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { FacilitiesController } from './facilities.controller';

describe('V4.72 Helpdesk to Facilities handoff',()=>{
  it('previews an active Helpdesk ticket without mutation',async()=>{
    const prisma={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{id:'t1',title:'Lift vibration',description:'Noise',priority:'HIGH',status:'IN_PROGRESS',assetId:'a1',assetCode:'LIFT-A',assetName:'Tower A Lift',updatedAt:new Date('2026-10-07T08:00:00.000Z')}])
      .mockResolvedValueOnce([])};
    const controller=new FacilitiesController(prisma as never);
    const result=await controller.previewHelpdeskHandoff('s1','t1');
    expect(result).toMatchObject({suggested:{workType:'CORRECTIVE',priority:'HIGH'},blockers:[],expectedTicketUpdatedAt:'2026-10-07T08:00:00.000Z',confirmationRequired:true,mutationPerformed:false});
    expect(result.asset).toMatchObject({id:'a1',code:'LIFT-A'});
  });

  it('creates one corrective work order and writes evidence in both domains',async()=>{
    const queryRaw=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:'t1',title:'Lift vibration',description:'Noise',priority:'URGENT',status:'IN_PROGRESS',assetId:'a1'}])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:'w1',status:'OPEN',priority:'CRITICAL'}]);
    const executeRaw=vi.fn().mockResolvedValue(1);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof queryRaw;$executeRaw:typeof executeRaw})=>Promise<unknown>)=>cb({$queryRaw:queryRaw,$executeRaw:executeRaw}));
    const controller=new FacilitiesController({$transaction:transaction} as never);
    const result=await controller.createHelpdeskWorkOrder('s1','u1','t1',{});
    expect(result).toMatchObject({id:'w1',priority:'CRITICAL'});
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it('rejects a second active work order for the same ticket',async()=>{
    const queryRaw=vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:'t1',title:'Leak',description:'Pipe',priority:'HIGH',status:'OPEN',assetId:null}])
      .mockResolvedValueOnce([{id:'w-existing'}]);
    const executeRaw=vi.fn();
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof queryRaw;$executeRaw:typeof executeRaw})=>Promise<unknown>)=>cb({$queryRaw:queryRaw,$executeRaw:executeRaw}));
    const controller=new FacilitiesController({$transaction:transaction} as never);
    await expect(controller.createHelpdeskWorkOrder('s1','u1','t1',{})).rejects.toBeInstanceOf(ConflictException);
  });
});
