import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { WaiverApprovalService } from './waiver-approval.service';

const transactional=(tx:Record<string,unknown>)=>({$transaction:vi.fn(async(work:(client:unknown)=>Promise<unknown>)=>work(tx))});

describe('WaiverApprovalService maker-checker invariants',()=>{
  it('prevents a requester from approving their own waiver',async()=>{
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([{id:'w1',periodId:'p1',description:'Waive interest',status:'DRAFT',sourceType:'WAIVER_REQUEST',sourceId:'k1',externalReference:'r1|5000',createdByUserId:'user-maker'}]),$executeRaw:vi.fn()};
    const service=new WaiverApprovalService(transactional(tx) as never);
    await expect(service.approve('society-a','user-maker','w1')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('posts an approved waiver only after a different finance reviewer approves it',async()=>{
    const tx={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{id:'w1',periodId:'p1',description:'Waive interest',status:'DRAFT',sourceType:'WAIVER_REQUEST',sourceId:'k1',externalReference:'r1|5000',createdByUserId:'user-maker'}])
      .mockResolvedValueOnce([{status:'OPEN'}]),$executeRaw:vi.fn().mockResolvedValue(1)};
    const service=new WaiverApprovalService(transactional(tx) as never);
    await expect(service.approve('society-a','user-checker','w1')).resolves.toEqual({requestId:'w1',status:'APPROVED',approvedByUserId:'user-checker'});
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('rejects changed content when an idempotency request key is reused',async()=>{
    const tx={$executeRaw:vi.fn().mockResolvedValue(1),$queryRaw:vi.fn().mockResolvedValueOnce([{id:'w1',externalReference:'r1|5000',status:'DRAFT'}])};
    const service=new WaiverApprovalService(transactional(tx) as never);
    await expect(service.request('society-a','maker',{receivableId:'r1',amountPaise:6000,reason:'changed',entryDate:'2026-09-18',journalEntryNumber:'WV-1',requestKey:'stable-key'})).rejects.toBeInstanceOf(ConflictException);
  });
});
