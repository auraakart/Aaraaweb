import { describe, expect, it, vi } from 'vitest';
import { BillingService } from './billing.service';

describe('V4.79.2 amenity refundable-deposit checkout',()=>{
  it('creates a purpose-bound gateway payment for exactly the snapshotted booking deposit',async()=>{
    const future=new Date(Date.now()+60*60*1000);
    const tx={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{id:'booking-1',userId:'user-1',status:'CONFIRMED',depositPaise:25000,depositStatus:'PAYMENT_REQUIRED',depositDueAt:future,paymentOpen:true}])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{id:'payment-1',purposeType:'AMENITY_DEPOSIT',amenityBookingId:'booking-1',amountPaise:25000}]),
      $executeRaw:vi.fn().mockResolvedValue(1),
    };
    const prisma={$transaction:vi.fn((cb:(client:typeof tx)=>unknown)=>cb(tx))};
    const service=new BillingService(prisma as never);
    await expect(service.createAmenityDepositPayment('society-1','user-1','booking-1','deposit-key-1'))
      .resolves.toMatchObject({id:'payment-1',purposeType:'AMENITY_DEPOSIT',amountPaise:25000});
    const insert=(tx.$queryRaw.mock.calls[3][0] as {strings?:readonly string[]}).strings?.join('?')??'';
    expect(insert).toContain("'AMENITY_DEPOSIT'");
    expect(insert).toContain('"amenityBookingId"');
    expect(insert).not.toContain('"invoiceId"');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('does not create an order after the server deposit deadline',async()=>{
    const tx={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{id:'booking-1',userId:'user-1',status:'CONFIRMED',depositPaise:25000,depositStatus:'PAYMENT_REQUIRED',depositDueAt:new Date(Date.now()-1000),paymentOpen:false}])
        .mockResolvedValueOnce([]),
      $executeRaw:vi.fn(),
    };
    const prisma={$transaction:vi.fn((cb:(client:typeof tx)=>unknown)=>cb(tx))};
    const service=new BillingService(prisma as never);
    await expect(service.createAmenityDepositPayment('society-1','user-1','booking-1','deposit-key-2'))
      .rejects.toThrow('deadline has elapsed');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
