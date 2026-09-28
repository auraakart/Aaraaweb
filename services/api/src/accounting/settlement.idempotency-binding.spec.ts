import { describe, expect, it, vi } from 'vitest';
import { SettlementService } from './settlement.service';

describe('SettlementService idempotency binding',()=>{
  it('rejects a reused key when allocation request parameters differ',async()=>{
    const tx={
      $executeRaw:vi.fn().mockResolvedValue(0),
      $queryRaw:vi.fn().mockResolvedValueOnce([{
        id:'allocation-1',
        receivableId:'receivable-old',
        paymentId:'payment-old',
        amountPaise:'1000',
        allocatedByUserId:'user-1',
      }]),
    };
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new SettlementService(prisma as never);

    await expect(service.allocate(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      {paymentId:'44444444-4444-4444-8444-444444444444',amountPaise:1000,idempotencyKey:'same-key'},
    )).rejects.toThrow('Idempotency key was already used for a different allocation request');

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
