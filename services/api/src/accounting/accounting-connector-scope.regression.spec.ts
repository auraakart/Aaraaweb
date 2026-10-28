import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountingConnectorDeliveryRunner } from './accounting-connector-delivery.runner';
import { ConfiguredHttpAccountingConnectorAdapter } from './configured-http-accounting-connector.adapter';

const society='11111111-1111-4111-8111-111111111111';
const job={id:'22222222-2222-4222-8222-222222222222',societyId:society,
  exportJobId:'33333333-3333-4333-8333-333333333333',provider:'bridge-a',idempotencyKey:'stored-export-key',attemptCount:1};
const artifact={contractVersion:'aaraagate.accounting.journal.v1',format:'CSV',filename:'journal.csv',
  contentType:'text/csv; charset=utf-8',sha256:'a'.repeat(64),content:'a,b\n1,2\n'};

function fixture(jobs=[job]){
  const tx={$queryRaw:vi.fn().mockResolvedValue([artifact]),$executeRaw:vi.fn().mockResolvedValue(1)};
  const claims={$queryRaw:vi.fn().mockResolvedValue(jobs)};
  const prisma={
    // Explicitly retained global seeding/claim handoff; no root artifact read.
    $executeRaw:vi.fn().mockResolvedValue(0),
    $transaction:vi.fn((run:(client:typeof claims)=>unknown)=>run(claims)),
    $queryRaw:vi.fn(async()=>{throw new Error('Unscoped artifact read');}),
    withTenantContext:vi.fn((_scope:string,run:(client:typeof tx)=>unknown)=>run(tx)),
  };
  const adapter={provider:'bridge-a',deliver:vi.fn().mockResolvedValue({status:'DELIVERED',providerReceiptId:'receipt-1'})};
  return {tx,prisma,adapter,runner:new AccountingConnectorDeliveryRunner(prisma as never,adapter as never)};
}

describe('Accounting connector per-job tenant and exception boundary',()=>{
  afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});

  it('reads immutable bytes and writes the result only in the claimed society',async()=>{
    const {runner,prisma,tx,adapter}=fixture();
    await runner.runOnce();
    expect(prisma.withTenantContext.mock.calls.map(([scope])=>scope)).toEqual([society,society]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(adapter.deliver).toHaveBeenCalledWith(expect.objectContaining({societyId:society,
      exportJobId:job.exportJobId,idempotencyKey:job.idempotencyKey,sha256:artifact.sha256,content:Buffer.from(artifact.content)}));
  });

  it('does not deliver a missing/foreign artifact and scopes retry evidence',async()=>{
    const {runner,prisma,tx,adapter}=fixture();
    tx.$queryRaw.mockResolvedValue([]);
    await runner.runOnce();
    expect(adapter.deliver).not.toHaveBeenCalled();
    expect(prisma.withTenantContext.mock.calls.map(([scope])=>scope)).toEqual([society,society]);
    const sql=tx.$executeRaw.mock.calls[0][0] as {values:unknown[]};
    expect(sql.values).toContain('DELIVERY_RETRY');
    expect(sql.values).toContain('Error');
    expect(sql.values).toContain(society);
  });

  it('never persists or logs raw provider exception payloads',async()=>{
    const {prisma,tx}=fixture();
    vi.stubEnv('ACCOUNTING_CONNECTOR_PROVIDER','bridge-a');
    vi.stubEnv('ACCOUNTING_CONNECTOR_BASE_URL','https://bridge.example.test');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({message:'Bearer private-token resident-phone csv-content'}),{status:503})));
    const logger=vi.spyOn(Logger.prototype,'error').mockImplementation(()=>undefined);
    await new AccountingConnectorDeliveryRunner(prisma as never,new ConfiguredHttpAccountingConnectorAdapter()).runOnce();
    const values=(tx.$executeRaw.mock.calls[0][0] as {values:unknown[]}).values;
    expect(values).toContain('Error');
    expect(JSON.stringify(values)).not.toMatch(/private-token|resident-phone|csv-content/);
    expect(JSON.stringify(logger.mock.calls)).not.toMatch(/private-token|resident-phone|csv-content/);
  });

  it('sanitizes cycle failures and resets the running guard',async()=>{
    const {runner,prisma}=fixture([]);
    prisma.$executeRaw.mockRejectedValueOnce(new Error('database URL contains password'));
    const logger=vi.spyOn(Logger.prototype,'error').mockImplementation(()=>undefined);
    await runner.runOnce();
    expect(logger).toHaveBeenCalledWith('Accounting connector cycle failed: Error');
    await runner.runOnce();
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('marks exhausted uncertain deliveries without leaking the exception',async()=>{
    vi.stubEnv('ACCOUNTING_CONNECTOR_MAX_ATTEMPTS','5');
    const {runner,tx,adapter}=fixture([{...job,attemptCount:5}]);
    adapter.deliver.mockRejectedValueOnce(new Error('private transport payload'));
    await runner.runOnce();
    const values=(tx.$executeRaw.mock.calls[0][0] as {values:unknown[]}).values;
    expect(values).toContain('FAILED');
    expect(values).toContain('DELIVERY_RETRY_EXHAUSTED');
    expect(values).toContain('Error');
    expect(JSON.stringify(values)).not.toContain('private transport payload');
  });

  it('fails closed when tenant context is unavailable without a root read fallback',async()=>{
    const {runner,prisma,adapter,tx}=fixture();
    prisma.withTenantContext.mockRejectedValue(new Error('context unavailable'));
    vi.spyOn(Logger.prototype,'error').mockImplementation(()=>undefined);
    await runner.runOnce();
    expect(adapter.deliver).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
  });

  it('records unsupported-provider failure in its own society without sending bytes',async()=>{
    const {runner,prisma,adapter,tx}=fixture([{...job,provider:'other-provider'}]);
    await runner.runOnce();
    expect(adapter.deliver).not.toHaveBeenCalled();
    expect(prisma.withTenantContext.mock.calls.map(([scope])=>scope)).toEqual([society]);
    expect((tx.$executeRaw.mock.calls[0][0] as {values:unknown[]}).values).toContain('UNSUPPORTED_PROVIDER');
  });
});
