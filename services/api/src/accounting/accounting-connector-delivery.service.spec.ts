import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AccountingConnectorDeliveryService } from './accounting-connector-delivery.service';

const base={id:'11111111-1111-4111-8111-111111111111',exportJobId:'22222222-2222-4222-8222-222222222222',provider:'GENERIC_HTTP',status:'FAILED',attemptCount:5,lastAttemptAt:new Date(),nextAttemptAt:null,providerReceiptId:null,failureCode:'DELIVERY_RETRY_EXHAUSTED',failureMessage:'timeout',createdAt:new Date(),updatedAt:new Date(),completedAt:new Date()};

describe('AccountingConnectorDeliveryService manual retry',()=>{
  it('records audit evidence and queues a fresh retry cycle',async()=>{
    const query=vi.fn().mockResolvedValueOnce([base]).mockResolvedValueOnce([{...base,status:'QUEUED',attemptCount:0,nextAttemptAt:new Date(),completedAt:null}]);
    const execute=vi.fn().mockResolvedValue(1);
    const prisma={ $transaction:vi.fn(async(cb:(tx:unknown)=>unknown)=>cb({$queryRaw:query,$executeRaw:execute})) };
    const service=new AccountingConnectorDeliveryService(prisma as never);
    const result=await service.retry('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',base.id);
    expect(result.status).toBe('QUEUED');
    expect(result.attemptCount).toBe(0);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects retry for a non-retryable delivery state',async()=>{
    const prisma={ $transaction:vi.fn(async(cb:(tx:unknown)=>unknown)=>cb({$queryRaw:vi.fn().mockResolvedValue([{...base,status:'DELIVERED'}]),$executeRaw:vi.fn()})) };
    await expect(new AccountingConnectorDeliveryService(prisma as never).retry('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',base.id)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not allow cross-tenant or missing delivery retries',async()=>{
    const prisma={ $transaction:vi.fn(async(cb:(tx:unknown)=>unknown)=>cb({$queryRaw:vi.fn().mockResolvedValue([]),$executeRaw:vi.fn()})) };
    await expect(new AccountingConnectorDeliveryService(prisma as never).retry('33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444',base.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
