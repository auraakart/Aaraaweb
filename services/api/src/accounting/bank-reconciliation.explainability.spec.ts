import { describe,expect,it,vi } from 'vitest';
import { BankReconciliationService } from './bank-reconciliation.service';

describe('V4.70 bank suggestion explainability',()=>{
  it('explains deterministic candidate signals and never auto-matches',async()=>{
    const prisma={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{
        id:'tx-1',status:'UNMATCHED',transactionDate:new Date('2026-09-20T00:00:00.000Z'),
        direction:'CREDIT',amountPaise:50000n,ledgerAccountId:'ledger-1',bankCode:'BANK',
      }])
      .mockResolvedValueOnce([{
        journalEntryId:'je-1',entryNumber:'JE-1',entryDate:new Date('2026-09-20T00:00:00.000Z'),
        description:'Maintenance receipt',externalReference:'UTR-1',bankMovementPaise:'50000',dateDistanceDays:0,
      }])};
    const service=new BankReconciliationService(prisma as never);
    const result=await service.suggestions('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
    expect(result.autoMatched).toBe(false);
    expect(result.confirmationRequired).toBe(true);
    expect(result.candidates[0].matchSignals).toEqual(expect.arrayContaining(['EXACT_BANK_MOVEMENT','SAME_DATE']));
    expect(result.candidates[0].explanation).toContain('exactly matches');
  });
});
