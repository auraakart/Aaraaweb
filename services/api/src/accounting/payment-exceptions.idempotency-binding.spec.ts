import { describe, expect, it, vi } from 'vitest';
import { PaymentExceptionsService } from './payment-exceptions.service';

const societyId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';

describe('PaymentExceptionsService idempotency binding',()=>{
  it('rejects a reused reversal key for another allocation request',async()=>{
    const tx={
      $executeRaw:vi.fn().mockResolvedValue(0),
      $queryRaw:vi.fn().mockResolvedValueOnce([{
        id:'reversal-1',
        allocationId:'33333333-3333-4333-8333-333333333333',
        amountPaise:'500',
        reason:'Original reason',
        reversedByUserId:userId,
      }]),
    };
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new PaymentExceptionsService(prisma as never);

    await expect(service.reverseAllocation(
      societyId,userId,'44444444-4444-4444-8444-444444444444',
      {amountPaise:500,reason:'Original reason',idempotencyKey:'same-key'},
    )).rejects.toThrow('Idempotency key was already used for a different allocation reversal request');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects a reused refund key when payment or request evidence differs',async()=>{
    const tx={
      $executeRaw:vi.fn().mockResolvedValue(0),
      $queryRaw:vi.fn().mockResolvedValueOnce([{
        id:'refund-1',
        paymentId:'55555555-5555-4555-8555-555555555555',
        amountPaise:'700',
        reason:'Original refund',
        providerReference:'provider-ref-1',
        refundedByUserId:userId,
      }]),
    };
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new PaymentExceptionsService(prisma as never);

    await expect(service.recordRefund(
      societyId,userId,'66666666-6666-4666-8666-666666666666',
      {amountPaise:700,reason:'Original refund',providerReference:'provider-ref-1',idempotencyKey:'same-key'},
    )).rejects.toThrow('Idempotency key was already used for a different refund request');

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
