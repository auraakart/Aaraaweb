import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceOperationsService } from './finance-operations.service';

const societyId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
const expenseId='33333333-3333-4333-8333-333333333333';

describe('FinanceOperationsService account semantics',()=>{
  it('rejects a non-expense or inactive ledger account before creating an expense',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([])};
    const service=new FinanceOperationsService(prisma as unknown as PrismaService,{unappliedCashSummary:vi.fn()} as never);

    await expect(service.createExpense(societyId,userId,{
      expenseNumber:'EXP-1',vendorName:'Vendor',expenseDate:'2026-09-25',description:'Test expense',
      amountPaise:1000,expenseAccountId:'44444444-4444-4444-8444-444444444444',
    })).rejects.toThrow('Expense account must be an active EXPENSE ledger account');

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const sql=(prisma.$queryRaw.mock.calls[0][0] as {strings:readonly string[]}).strings.join(' ');
    expect(sql).toContain('"type"=\'EXPENSE\'');
    expect(sql).toContain('"active"=true');
  });

  it('rejects a non-liability or inactive payable account before approving an expense',async()=>{
    const tx={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{id:expenseId,status:'DRAFT',amountPaise:1000n,dueDate:null}])
        .mockResolvedValueOnce([]),
      $executeRaw:vi.fn(),
    };
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new FinanceOperationsService(prisma as unknown as PrismaService,{unappliedCashSummary:vi.fn()} as never);

    await expect(service.approveExpense(societyId,userId,expenseId,{
      payableAccountId:'55555555-5555-4555-8555-555555555555',
    })).rejects.toThrow('Payable account must be an active LIABILITY ledger account');

    expect(tx.$executeRaw).not.toHaveBeenCalled();
    const sql=(tx.$queryRaw.mock.calls[1][0] as {strings:readonly string[]}).strings.join(' ');
    expect(sql).toContain('"type"=\'LIABILITY\'');
    expect(sql).toContain('"active"=true');
  });
});
