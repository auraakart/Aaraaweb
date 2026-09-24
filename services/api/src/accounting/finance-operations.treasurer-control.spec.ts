import { describe, expect, it, vi } from 'vitest';
import { FinanceOperationsService } from './finance-operations.service';

describe('FinanceOperationsService treasurer control centre',()=>{
  it('aggregates current evidence without automatic posting or matching',async()=>{
    const prisma={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{unmatchedBank:2,unmatchedMovementPaise:'50000'}])
      .mockResolvedValueOnce([{unappliedCount:1,unappliedPaise:'25000'}])
      .mockResolvedValueOnce([{overrunLines:1,overrunPaise:'10000'}])
      .mockResolvedValueOnce([{gstEnabled:true,tdsEnabled:true,documentsMissingTaxEvidence:1}])
      .mockResolvedValueOnce([{refunds30d:1,refundedPaise30d:'5000'}])};
    const service=new FinanceOperationsService(prisma as never);
    vi.spyOn(service,'operationalReadiness').mockResolvedValue({status:'WATCH',blockers:['EXPENSES_APPROVED_NOT_POSTED'],nextActions:['Post approved expenses.']} as never);
    const result=await service.treasurerControlCentre('society-1');
    expect(result.status).toBe('ATTENTION');
    expect(result.bank.unmatchedBank).toBe(2);
    expect(result.automaticPosting).toBe(false);
    expect(result.automaticMatching).toBe(false);
    expect(result.boundary).toContain('does not post journals');
  });
});
