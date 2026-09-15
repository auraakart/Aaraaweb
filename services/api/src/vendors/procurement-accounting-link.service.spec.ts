import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProcurementAccountingLinkService } from './procurement-accounting-link.service';

describe('ProcurementAccountingLinkService', () => {
  function setup() {
    const tx = { $queryRaw: vi.fn(), $executeRaw: vi.fn() };
    const prisma = { $transaction: vi.fn(async (cb: (value: typeof tx) => Promise<unknown>) => cb(tx)), $queryRaw: vi.fn() };
    return { tx, prisma, service: new ProcurementAccountingLinkService(prisma as never) };
  }

  it('requires an issued purchase order before creating accounting state', async () => {
    const { tx, service } = setup();
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.createExpenseDraftFromPurchaseOrder('society-1','actor-1','11111111-1111-1111-1111-111111111111',{
      expenseNumber:'EXP-1',expenseDate:'2026-09-14',expenseAccountId:'22222222-2222-2222-2222-222222222222'
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    const sql = (tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain('po."status"=\'ISSUED\'');
  });

  it('rejects duplicate accounting linkage for the same PO', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id:'po-1',requestId:'req-1',vendorId:'vendor-1',poNumber:'PO-1',amountPaise:1000n,vendorName:'Vendor A' }])
      .mockResolvedValueOnce([{ expenseId:'expense-1' }]);
    await expect(service.createExpenseDraftFromPurchaseOrder('society-1','actor-1','11111111-1111-1111-1111-111111111111',{
      expenseNumber:'EXP-1',expenseDate:'2026-09-14',expenseAccountId:'22222222-2222-2222-2222-222222222222'
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates the existing SocietyExpense draft and linkage in one transaction', async () => {
    const { tx, service } = setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{ id:'po-1',requestId:'req-1',vendorId:'vendor-1',poNumber:'PO-1',amountPaise:1000n,vendorName:'Vendor A' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id:'expense-1',expenseNumber:'EXP-1',status:'DRAFT',amountPaise:1000n }]);

    await expect(service.createExpenseDraftFromPurchaseOrder('society-1','actor-1','11111111-1111-1111-1111-111111111111',{
      expenseNumber:'EXP-1',expenseDate:'2026-09-14',expenseAccountId:'22222222-2222-2222-2222-222222222222'
    })).resolves.toMatchObject({ expenseId:'expense-1',status:'DRAFT',amountPaise:'1000' });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
