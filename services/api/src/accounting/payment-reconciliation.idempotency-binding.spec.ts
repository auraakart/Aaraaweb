import { describe, expect, it, vi } from 'vitest';
import { PaymentReconciliationService } from './payment-reconciliation.service';

const societyId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
const paymentId='33333333-3333-4333-8333-333333333333';

describe('PaymentReconciliationService gateway operation idempotency',()=>{
  it('rejects a reused key when the gateway operation request differs',async()=>{
    const tx={
      $executeRaw:vi.fn().mockResolvedValue(0),
      $queryRaw:vi.fn().mockResolvedValueOnce([{
        id:'operation-1',
        paymentId,
        operationType:'REFUND',
        provider:'gateway-adapter',
        amountPaise:'5000',
        requestedByUserId:userId,
      }]),
    };
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new PaymentReconciliationService(prisma as never);

    await expect(service.createOperation(
      societyId,userId,paymentId,
      {operationType:'REFUND',provider:'gateway-adapter',amountPaise:7000,idempotencyKey:'same-key'},
    )).rejects.toThrow('Idempotency key was already used for a different gateway operation request');

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns the original operation for an exact same-key retry',async()=>{
    const existing={
      id:'operation-1',
      paymentId,
      operationType:'STATUS_QUERY',
      provider:'gateway-adapter',
      amountPaise:null,
      requestedByUserId:userId,
    };
    const operation={...existing,status:'ACCEPTED',providerOperationId:null,failureCode:null,failureMessage:null,requestedAt:new Date(),settledAt:null};
    const tx={
      $executeRaw:vi.fn().mockResolvedValue(0),
      $queryRaw:vi.fn().mockResolvedValueOnce([existing]).mockResolvedValueOnce([operation]),
    };
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new PaymentReconciliationService(prisma as never);

    await expect(service.createOperation(
      societyId,userId,paymentId,
      {operationType:'STATUS_QUERY',provider:' gateway-adapter ',idempotencyKey:'same-key'},
    )).resolves.toEqual(operation);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
});


describe('PaymentReconciliationService gateway operation result invariants',()=>{
  it('protects settled gateway operation evidence from status regression',async()=>{
    const tx={
      $executeRaw:vi.fn(),
      $queryRaw:vi.fn().mockResolvedValueOnce([{status:'SETTLED',providerOperationId:'provider-op-1'}]),
    };
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new PaymentReconciliationService(prisma as never);

    await expect(service.recordOperationResult(
      societyId,'44444444-4444-4444-8444-444444444444',
      {status:'FAILED',failureCode:'LATE_FAILURE'},
    )).rejects.toThrow('Settled gateway operation cannot regress to a non-settled state');

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('does not allow the provider operation id to change once recorded',async()=>{
    const tx={
      $executeRaw:vi.fn(),
      $queryRaw:vi.fn().mockResolvedValueOnce([{status:'ACCEPTED',providerOperationId:'provider-op-1'}]),
    };
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new PaymentReconciliationService(prisma as never);

    await expect(service.recordOperationResult(
      societyId,'44444444-4444-4444-8444-444444444444',
      {status:'SETTLED',providerOperationId:'provider-op-2'},
    )).rejects.toThrow('Provider operation id cannot change once recorded');

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('preserves the first settlement timestamp on an idempotent settled replay',async()=>{
    const settledAt=new Date('2026-09-26T00:00:00.000Z');
    const operation={id:'44444444-4444-4444-8444-444444444444',paymentId,status:'SETTLED',provider:'gateway-adapter',providerOperationId:'provider-op-1',amountPaise:null,idempotencyKey:'same-key',failureCode:null,failureMessage:null,requestedAt:new Date(),settledAt};
    const tx={
      $executeRaw:vi.fn().mockResolvedValue(1),
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{status:'SETTLED',providerOperationId:'provider-op-1'}])
        .mockResolvedValueOnce([operation]),
    };
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new PaymentReconciliationService(prisma as never);

    await expect(service.recordOperationResult(
      societyId,operation.id,{status:'SETTLED',providerOperationId:'provider-op-1'},
    )).resolves.toEqual(operation);

    const sql=((tx.$executeRaw.mock.calls[0][0] as {strings?:readonly string[]}).strings??[]).join(' ');
    expect(sql).toContain('COALESCE("settledAt",CURRENT_TIMESTAMP)');
  });
});


describe('PaymentReconciliationService case refresh invariants',()=>{
  it('preserves unresolved reconciliation evidence on refresh',async()=>{
    const existingCase={
      id:'55555555-5555-4555-8555-555555555555',
      provider:'configured-http',
    };
    const refreshed={
      id:existingCase.id,
      paymentId,
      status:'MISMATCH',
      provider:'configured-http',
      expectedCapturedPaise:'10000',
      expectedRefundedPaise:'0',
      reason:'Expected CAPTURED / 10000 paise',
    };
    const tx={
      $executeRaw:vi.fn().mockResolvedValue(1),
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{id:paymentId,status:'CAPTURED',amountPaise:10000n}])
        .mockResolvedValueOnce([{total:0n}])
        .mockResolvedValueOnce([existingCase])
        .mockResolvedValueOnce([refreshed]),
    };
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new PaymentReconciliationService(prisma as never);

    await expect(service.openOrRefreshCase(societyId,paymentId,'configured-http')).resolves.toEqual(refreshed);

    const sql=((tx.$executeRaw.mock.calls[0][0] as {strings?:readonly string[]}).strings??[]).join(' ');
    expect(sql).toContain('ELSE "status"');
    expect(sql).toContain('ELSE "reason"');
    expect(sql).not.toContain('"status"=\'PENDING\',"reason"=NULL');
  });

  it('rejects switching provider on an unresolved reconciliation case',async()=>{
    const tx={
      $executeRaw:vi.fn(),
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{id:paymentId,status:'CAPTURED',amountPaise:10000n}])
        .mockResolvedValueOnce([{total:0n}])
        .mockResolvedValueOnce([{id:'55555555-5555-4555-8555-555555555555',provider:'configured-http'}]),
    };
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new PaymentReconciliationService(prisma as never);

    await expect(service.openOrRefreshCase(societyId,paymentId,'RAZORPAY'))
      .rejects.toThrow('Open reconciliation case is already bound to a different provider');

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
