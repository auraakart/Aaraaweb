import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingConnectorDeliveryRunner } from './accounting-connector-delivery.runner';
import { ConfiguredHttpAccountingConnectorAdapter } from './configured-http-accounting-connector.adapter';

describe('AccountingConnectorDeliveryRunner',()=>{
  it('seeds completed exports, claims work and delivers immutable artifact bytes',async()=>{
    const job={id:'22222222-2222-2222-2222-222222222222',societyId:'11111111-1111-1111-1111-111111111111',exportJobId:'33333333-3333-3333-3333-333333333333',provider:'bridge-a',idempotencyKey:'accounting-export:33333333-3333-3333-3333-333333333333:bridge-a',attemptCount:1};
    const artifact={contractVersion:'aaraagate.accounting.journal.v1',format:'CSV' as const,filename:'journal.csv',contentType:'text/csv; charset=utf-8',sha256:'a'.repeat(64),content:'a,b\n1,2\n'};
    const executeRaw=vi.fn().mockResolvedValue(1);
    const queryRaw=vi.fn().mockResolvedValue([artifact]);
    const tx={$queryRaw:vi.fn().mockResolvedValue([job])};
    const prisma={$executeRaw:executeRaw,$queryRaw:queryRaw,$transaction:vi.fn(async(callback)=>(callback as (value:typeof tx)=>unknown)(tx))} as unknown as PrismaService;
    const deliver=vi.fn().mockResolvedValue({status:'DELIVERED' as const,providerReceiptId:'receipt-1'});
    const adapter={provider:'bridge-a',deliver} as unknown as ConfiguredHttpAccountingConnectorAdapter;

    await new AccountingConnectorDeliveryRunner(prisma,adapter).runOnce();

    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({societyId:job.societyId,exportJobId:job.exportJobId,idempotencyKey:job.idempotencyKey,sha256:artifact.sha256,content:Buffer.from(artifact.content)}));
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  it('does not overlap cycles on the same process',async()=>{
    let release:()=>void=()=>undefined;
    const blocked=new Promise<void>(resolve=>{release=resolve});
    const prisma={$executeRaw:vi.fn(()=>blocked),$transaction:vi.fn()} as unknown as PrismaService;
    const adapter={provider:'bridge-a',deliver:vi.fn()} as unknown as ConfiguredHttpAccountingConnectorAdapter;
    const runner=new AccountingConnectorDeliveryRunner(prisma,adapter);
    const first=runner.runOnce();
    await Promise.resolve();
    await runner.runOnce();
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    release();await first;
  });
});
