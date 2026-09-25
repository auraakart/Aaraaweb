import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceOperationsService } from './finance-operations.service';

const societyId='11111111-1111-4111-8111-111111111111';
const userId='22222222-2222-4222-8222-222222222222';
const payableId='33333333-3333-4333-8333-333333333333';
const journalEntryId='44444444-4444-4444-8444-444444444444';

function serviceWith(tx:{$queryRaw:ReturnType<typeof vi.fn>;$executeRaw:ReturnType<typeof vi.fn>}) {
  const prisma={$transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx))};
  return new FinanceOperationsService(prisma as unknown as PrismaService,{unappliedCashSummary:vi.fn()} as never);
}

describe('FinanceOperationsService payable settlement integrity',()=>{
  it('writes the migrated settledOn column and closes an exactly settled payable',async()=>{
    const tx={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{id:payableId,originalAmountPaise:1000n,status:'OPEN'}])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{settled:0n}])
        .mockResolvedValueOnce([{id:journalEntryId,status:'POSTED'}])
        .mockResolvedValueOnce([{settled:1000n}]),
      $executeRaw:vi.fn().mockResolvedValue(1),
    };
    const service=serviceWith(tx);
    await expect(service.settlePayable(societyId,userId,payableId,{
      amountPaise:1000,settlementDate:'2026-09-25',journalEntryId,idempotencyKey:'settlement-attempt-1',
    })).resolves.toEqual({payableId,status:'PAID',settledPaise:'1000',idempotent:false});

    const insertSql=(tx.$executeRaw.mock.calls[0][0] as {strings:readonly string[]}).strings.join(' ');
    expect(insertSql).toContain('"settledOn"');
    expect(insertSql).not.toContain('"settlementDate"');
  });

  it('rejects an amount above the locked outstanding balance before inserting',async()=>{
    const tx={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{id:payableId,originalAmountPaise:1000n,status:'PARTIALLY_PAID'}])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{settled:800n}]),
      $executeRaw:vi.fn(),
    };
    const service=serviceWith(tx);
    await expect(service.settlePayable(societyId,userId,payableId,{
      amountPaise:300,settlementDate:'2026-09-25',journalEntryId,idempotencyKey:'settlement-attempt-2',
    })).rejects.toThrow('Settlement exceeds outstanding payable amount');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('replays the same settlement by idempotency key or payment journal even after the payable is paid',async()=>{
    const existing={
      payableId,amountPaise:1000n,settledOn:new Date('2026-09-25T00:00:00.000Z'),
      journalEntryId,idempotencyKey:'settlement-attempt-3',reference:null,
    };
    const tx={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{id:payableId,originalAmountPaise:1000n,status:'PAID'}])
        .mockResolvedValueOnce([existing])
        .mockResolvedValueOnce([{settled:1000n}]),
      $executeRaw:vi.fn(),
    };
    const service=serviceWith(tx);
    await expect(service.settlePayable(societyId,userId,payableId,{
      amountPaise:1000,settlementDate:'2026-09-25',journalEntryId,idempotencyKey:'replacement-client-key',
    })).resolves.toEqual({payableId,status:'PAID',settledPaise:'1000',idempotent:true});
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects idempotency-key reuse with a different settlement payload',async()=>{
    const existing={
      payableId,amountPaise:500n,settledOn:new Date('2026-09-25T00:00:00.000Z'),
      journalEntryId:'55555555-5555-4555-8555-555555555555',idempotencyKey:'settlement-attempt-4',reference:null,
    };
    const tx={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{id:payableId,originalAmountPaise:1000n,status:'PARTIALLY_PAID'}])
        .mockResolvedValueOnce([existing]),
      $executeRaw:vi.fn(),
    };
    const service=serviceWith(tx);
    await expect(service.settlePayable(societyId,userId,payableId,{
      amountPaise:500,settlementDate:'2026-09-25',journalEntryId,idempotencyKey:'settlement-attempt-4',
    })).rejects.toThrow('Idempotency key is already used for another payable settlement');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
