import { describe, expect, it, vi } from 'vitest';
import { FinanceOperationsService } from './finance-operations.service';

describe('FinanceOperationsService treasurer control centre',()=>{
  it('uses canonical payment availability and keeps all finance mutations explicit',async()=>{
    const prisma={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{unmatchedBank:2,unmatchedMovementPaise:'50000'}])
      .mockResolvedValueOnce([{overrunLines:1,overrunPaise:'10000'}])
      .mockResolvedValueOnce([{gstEnabled:true,tdsEnabled:true,documentsMissingTaxEvidence:1}])
      .mockResolvedValueOnce([{refunds30d:1,refundedPaise30d:'5000'}])};
    const availability={unappliedCashSummary:vi.fn().mockResolvedValue({paymentCount:1,unappliedPaise:'25000'})};
    const service=new FinanceOperationsService(prisma as never,availability as never);
    vi.spyOn(service,'operationalReadiness').mockResolvedValue({
      status:'WATCH',
      blockers:['EXPENSES_APPROVED_NOT_POSTED'],
      nextActions:['Post approved expenses.'],
      resolutionActions:[{code:'EXPENSES_APPROVED_NOT_POSTED',label:'Post approved expenses',detail:'Complete the existing explicit expense-posting workflow before period close.',href:'/finance/operations'}],
    } as never);
    const result=await service.treasurerControlCentre('society-1');
    expect(availability.unappliedCashSummary).toHaveBeenCalledWith('society-1');
    expect(result.cash).toEqual({unappliedCount:1,unappliedPaise:'25000'});
    expect(result.status).toBe('ATTENTION');
    expect(result.bank.unmatchedBank).toBe(2);
    expect(result.resolutionActions).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'BANK_UNMATCHED',href:'/finance/bank-reconciliation'}),
      expect.objectContaining({code:'CASH_UNAPPLIED',href:'/finance#payment-allocation'}),
      expect.objectContaining({code:'BUDGET_OVERRUN',href:'/finance/operations'}),
      expect.objectContaining({code:'TAX_EVIDENCE_MISSING',href:'/finance/tax'}),
      expect.objectContaining({code:'EXPENSES_APPROVED_NOT_POSTED',href:'/finance/operations'}),
    ]));
    expect(new Set(result.resolutionActions.map(action=>action.code)).size).toBe(result.resolutionActions.length);
    expect(result.automaticPosting).toBe(false);
    expect(result.automaticMatching).toBe(false);
    expect(result.boundary).toContain('do not post journals');
  });
});
