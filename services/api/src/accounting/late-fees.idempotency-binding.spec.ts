import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { LateFeesService } from './late-fees.service';

const societyId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
const input={
  asOfDate:'2026-09-26',
  entryDate:'2026-09-26',
  idempotencyKey:'late-fee-2026-09-26',
  journalPrefix:'lf-20260926',
};

function hashFor(value= input){
  return createHash('sha256').update(JSON.stringify({
    userId,
    asOfDate:value.asOfDate.slice(0,10),
    entryDate:value.entryDate.slice(0,10),
    journalPrefix:value.journalPrefix.trim().toUpperCase(),
  })).digest('hex');
}

describe('LateFeesService idempotency request binding',()=>{
  it('rejects a reused key for a different late-fee request',async()=>{
    const tx={
      $executeRaw:vi.fn().mockResolvedValue(0),
      $queryRaw:vi.fn().mockResolvedValueOnce([{id:'batch-1',status:'APPLIED',requestHash:'0'.repeat(64)}]),
    };
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new LateFeesService(prisma as never,{unappliedCashSummary:vi.fn()} as never);

    await expect(service.apply(societyId,userId,input))
      .rejects.toThrow('Idempotency key was already used for a different late-fee request');

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a historical key has no request fingerprint',async()=>{
    const tx={
      $executeRaw:vi.fn().mockResolvedValue(0),
      $queryRaw:vi.fn().mockResolvedValueOnce([{id:'batch-legacy',status:'APPLIED',requestHash:null}]),
    };
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new LateFeesService(prisma as never,{unappliedCashSummary:vi.fn()} as never);

    await expect(service.apply(societyId,userId,input))
      .rejects.toThrow('Legacy late-fee idempotency key cannot be replayed safely; use a new key');
  });

  it('persists the normalized request fingerprint for a new batch',async()=>{
    const tx={
      $executeRaw:vi.fn().mockResolvedValue(0),
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{id:'period-1',status:'OPEN'}])
        .mockResolvedValueOnce([{id:'batch-1'}])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{id:'batch-1',status:'APPLIED'}]),
    };
    const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
    const service=new LateFeesService(prisma as never,{unappliedCashSummary:vi.fn()} as never);

    await service.apply(societyId,userId,input);

    const insert=(tx.$queryRaw.mock.calls[2][0] as {strings:readonly string[];values?:unknown[]});
    const sql=insert.strings.join(' ');
    expect(sql).toContain('"requestHash"');
    expect(insert.values).toContain(hashFor());
  });
});
