import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountingConnectorDeliveryService } from './accounting-connector-delivery.service';

const base={id:'11111111-1111-4111-8111-111111111111',exportJobId:'22222222-2222-4222-8222-222222222222',provider:'GENERIC_HTTP',status:'FAILED',attemptCount:5,lastAttemptAt:new Date(),nextAttemptAt:null,providerReceiptId:null,failureCode:'DELIVERY_RETRY_EXHAUSTED',failureMessage:'timeout',createdAt:new Date(),updatedAt:new Date(),completedAt:new Date()};
const connector=(configured=true)=>({readiness:()=>({provider:'GENERIC_HTTP',bridgeConfigured:configured,apiKeyConfigured:false})});

describe('AccountingConnectorDeliveryService',()=>{
  afterEach(()=>{delete process.env.ACCOUNTING_CONNECTOR_AUTO_DELIVER});

  it('returns safe readiness without connector URL or credential material',()=>{
    process.env.ACCOUNTING_CONNECTOR_AUTO_DELIVER='true';
    const service=new AccountingConnectorDeliveryService({} as never,connector() as never);
    expect(service.readiness()).toEqual({provider:'GENERIC_HTTP',bridgeConfigured:true,apiKeyConfigured:false,autoDeliveryEnabled:true,state:'ACTIVE',networkCheckPerformed:false});
    expect(JSON.stringify(service.readiness())).not.toContain('http');
  });

  it('distinguishes an unconfigured connector from an explicitly disabled ready bridge',()=>{
    expect(new AccountingConnectorDeliveryService({} as never,connector(false) as never).readiness().state).toBe('NOT_CONFIGURED');
    expect(new AccountingConnectorDeliveryService({} as never,connector(true) as never).readiness().state).toBe('READY_DISABLED');
  });

  it('records audit evidence and queues a fresh retry cycle',async()=>{
    const query=vi.fn().mockResolvedValueOnce([base]).mockResolvedValueOnce([{...base,status:'QUEUED',attemptCount:0,nextAttemptAt:new Date(),completedAt:null}]);
    const execute=vi.fn().mockResolvedValue(1);
    const prisma={ $transaction:vi.fn(async(cb:(tx:unknown)=>unknown)=>cb({$queryRaw:query,$executeRaw:execute})) };
    const service=new AccountingConnectorDeliveryService(prisma as never,connector() as never);
    const result=await service.retry('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',base.id);
    expect(result.status).toBe('QUEUED');
    expect(result.attemptCount).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects retry for a non-retryable delivery state',async()=>{
    const prisma={ $transaction:vi.fn(async(cb:(tx:unknown)=>unknown)=>cb({$queryRaw:vi.fn().mockResolvedValue([{...base,status:'DELIVERED'}]),$executeRaw:vi.fn()})) };
    await expect(new AccountingConnectorDeliveryService(prisma as never,connector() as never).retry('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',base.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not allow cross-tenant or missing delivery retries',async()=>{
    const prisma={ $transaction:vi.fn(async(cb:(tx:unknown)=>unknown)=>cb({$queryRaw:vi.fn().mockResolvedValue([]),$executeRaw:vi.fn()})) };
    await expect(new AccountingConnectorDeliveryService(prisma as never,connector() as never).retry('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',base.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
