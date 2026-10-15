import { describe, expect, it, vi } from 'vitest';
import { PaymentAvailabilityService } from './payment-availability.service';

describe('PaymentAvailabilityService',()=>{
  it('returns an empty summary when no captured cash is available',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([])};
    const service=new PaymentAvailabilityService(prisma as never);
    await expect(service.unappliedCashSummary('society-1')).resolves.toEqual({
      paymentCount:0,unappliedPaise:'0',partiallyAllocatedCount:0,unallocatedPaymentCount:0,oldestUnappliedDays:0,
    });
  });

  it('uses one reversal/refund-aware set-based calculation for unapplied captured cash',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{
      paymentCount:2,unappliedPaise:'75000',partiallyAllocatedCount:1,unallocatedPaymentCount:1,oldestUnappliedDays:9,
    }])};
    const service=new PaymentAvailabilityService(prisma as never);
    await expect(service.unappliedCashSummary('society-1')).resolves.toEqual({
      paymentCount:2,unappliedPaise:'75000',partiallyAllocatedCount:1,unallocatedPaymentCount:1,oldestUnappliedDays:9,
    });
    const sql=(prisma.$queryRaw.mock.calls[0][0] as {strings?:readonly string[]}).strings?.join('?')??'';
    expect(sql).toContain('WITH allocation_totals AS');
    expect(sql).toContain('reversal_totals AS');
    expect(sql).toContain('refund_totals AS');
    expect(sql).toContain('"ReceivableAllocationReversal"');
    expect(sql).toContain('"PaymentRefund"');
    expect(sql).toContain('"purposeType"=\'MAINTENANCE_INVOICE\'');
    expect(sql).not.toContain('SELECT SUM(a."amountPaise") FROM "ReceivableAllocation"');
  });
});
