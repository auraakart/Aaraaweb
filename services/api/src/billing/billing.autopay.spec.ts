import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';

describe('BillingService AutoPay preference',()=>{
  it('returns a provider-unbound default only for a current owner or tenant',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValueOnce([{id:'unit-1'}]).mockResolvedValueOnce([])};
    const service=new BillingService(prisma as unknown as PrismaService);
    await expect(service.getAutopayPreference('society-1','user-1','unit-1')).resolves.toMatchObject({
      unitId:'unit-1',enabled:false,executionState:'PROVIDER_UNBOUND',automaticDebitAvailable:false,
    });
  });
  it('saves preference without claiming an executable automatic debit',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValueOnce([{id:'unit-1'}]).mockResolvedValueOnce([{
      enabled:true,maxAmountPaise:500000,debitDaysBefore:2,provider:null,providerMandateId:null,providerMandateStatus:null,updatedAt:new Date()
    }])};
    const service=new BillingService(prisma as unknown as PrismaService);
    await expect(service.setAutopayPreference('society-1','user-1',{unitId:'unit-1',enabled:true,maxAmountPaise:500000,debitDaysBefore:2}))
      .resolves.toMatchObject({enabled:true,maxAmountPaise:500000,debitDaysBefore:2,executionState:'PROVIDER_UNBOUND',automaticDebitAvailable:false});
  });
});
