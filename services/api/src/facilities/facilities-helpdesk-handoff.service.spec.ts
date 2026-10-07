import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FacilitiesHelpdeskHandoffService } from './facilities-helpdesk-handoff.service';

describe('FacilitiesHelpdeskHandoffService',()=>{
  it('returns a non-mutating handoff preview with a stale-check version',async()=>{
    const prisma={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{
        id:'ticket-1',title:'Lift issue',description:'Lift stops',priority:'HIGH',status:'OPEN',
        assetId:'asset-1',assetCode:'LIFT-A',assetName:'Tower A lift',updatedAt:new Date('2026-10-07T08:00:00.000Z'),
      }])
      .mockResolvedValueOnce([])};
    const service=new FacilitiesHelpdeskHandoffService(prisma as never);
    await expect(service.preview('society-1','ticket-1')).resolves.toEqual(expect.objectContaining({
      expectedTicketUpdatedAt:'2026-10-07T08:00:00.000Z',
      blockers:[],
      suggested:expect.objectContaining({workType:'CORRECTIVE',priority:'HIGH'}),
      confirmationRequired:true,
      mutationPerformed:false,
    }));
  });

  it('fails closed when the Helpdesk ticket changed after the preview',async()=>{
    const tx={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id:'ticket-1',title:'Lift issue',description:'Lift stops',priority:'HIGH',status:'OPEN',
          assetId:'asset-1',updatedAt:new Date('2026-10-07T08:05:00.000Z'),
        }]),
      $executeRaw:vi.fn(),
    };
    const prisma={$queryRaw:vi.fn(),$transaction:vi.fn((fn:(value:typeof tx)=>unknown)=>fn(tx))};
    const service=new FacilitiesHelpdeskHandoffService(prisma as never);
    await expect(service.create('society-1','actor-1','ticket-1',{
      expectedTicketUpdatedAt:'2026-10-07T08:00:00.000Z',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
