import { describe, expect, it, vi } from 'vitest';
import { LateFeesService } from './late-fees.service';

describe('LateFeesService reversal-aware balances',()=>{
  it('uses net receivable allocations when loading late-fee candidates',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{
      receivableId:'receivable-1',chargeRuleId:'rule-1',unitId:'unit-1',receivableNumber:'R-1',
      dueDate:new Date('2026-09-20T00:00:00.000Z'),receivableAccountId:'ar-1',incomeAccountId:'income-1',
      fundId:null,lateFeeMode:'PERCENTAGE',lateFeeFixedPaise:null,lateFeeBasisPoints:1000,baseOutstandingPaise:10000n,
    }])};
    const service=new LateFeesService(prisma as never,{unappliedCashSummary:vi.fn()} as never);

    const result=await service.preview('11111111-1111-4111-8111-111111111111','2026-09-26');
    expect(result.assessments[0]).toMatchObject({
      receivableId:'receivable-1',
      receivableNumber:'R-1',
      dueDate:new Date('2026-09-20T00:00:00.000Z'),
      baseOutstandingPaise:'10000',
      feePaise:'1000',
    });

    const sql=(prisma.$queryRaw.mock.calls[0][0] as {strings:readonly string[]}).strings.join(' ');
    expect(sql).toContain('"ReceivableAllocation"');
    expect(sql).toContain('"ReceivableAllocationReversal"');
    expect(sql).toContain('x."id"=rv."allocationId"');
    expect(sql).toContain('x."receivableId" = r."id"');
  });
});
