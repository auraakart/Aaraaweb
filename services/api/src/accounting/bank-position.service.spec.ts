import { describe, expect, it, vi } from 'vitest';
import { BankPositionService } from './bank-position.service';

describe('BankPositionService closing position',()=>{
  it('computes statement and ledger closing balances plus the reconciliation difference',async()=>{
    const prisma={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{ledgerAccountId:'ledger-bank',openingBalancePaise:10000n}])
      .mockResolvedValueOnce([{movement:2500n,unmatchedCount:1n}])
      .mockResolvedValueOnce([{balance:12000n}])};
    const service=new BankPositionService(prisma as never);
    await expect(service.position('society-a','bank-1','2026-09-18')).resolves.toEqual({
      bankAccountId:'bank-1',asOf:'2026-09-18',openingBalancePaise:'10000',statementMovementPaise:'2500',statementClosingPaise:'12500',ledgerClosingPaise:'12000',differencePaise:'500',unmatchedCount:1,balanced:false,
    });
  });

  it('marks the position balanced when bank statement and ledger closing agree',async()=>{
    const prisma={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{ledgerAccountId:'ledger-bank',openingBalancePaise:10000n}])
      .mockResolvedValueOnce([{movement:-2000n,unmatchedCount:0n}])
      .mockResolvedValueOnce([{balance:8000n}])};
    const service=new BankPositionService(prisma as never);
    const result=await service.position('society-a','bank-1','2026-09-18');
    expect(result.balanced).toBe(true);expect(result.differencePaise).toBe('0');
  });
});
