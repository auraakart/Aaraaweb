import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BankReconciliationService } from './bank-reconciliation.service';

type RawMock = ReturnType<typeof vi.fn>;

function serviceWith(prisma: Record<string, unknown>) {
  return new BankReconciliationService(prisma as never);
}

function transactionalPrisma(tx: Record<string, unknown>) {
  return {
    $transaction: vi.fn(async (work: (client: unknown) => Promise<unknown>) => work(tx)),
  };
}

describe('BankReconciliationService invariants', () => {
  it('treats a duplicate external bank key as an idempotent import', async () => {
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([{ id: 'bank-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'tx-1', bankAccountId: 'bank-1', externalKey: 'EXT-1', transactionDate:'2026-09-17', direction:'CREDIT', amountPaise:'12500', status: 'UNMATCHED' }]);
    const service = serviceWith({ $queryRaw: queryRaw });

    const result = await service.importTransaction('society-a', 'user-a', {
      bankAccountId: 'bank-1', externalKey: 'EXT-1', transactionDate: '2026-09-17', direction: 'CREDIT', amountPaise: 12500,
    });

    expect(result).toMatchObject({ id: 'tx-1', externalKey: 'EXT-1', status: 'UNMATCHED' });
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });

  it('rejects an external key reused with different statement data', async () => {
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([{ id: 'bank-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id:'tx-1',bankAccountId:'bank-1',externalKey:'EXT-1',transactionDate:'2026-09-17',direction:'CREDIT',amountPaise:'12500',status:'UNMATCHED' }]);
    const service=serviceWith({$queryRaw:queryRaw});
    await expect(service.importTransaction('society-a','user-a',{
      bankAccountId:'bank-1',externalKey:'EXT-1',transactionDate:'2026-09-18',direction:'CREDIT',amountPaise:12500,
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('previews statement rows and classifies database and in-batch duplicates without mutation', async () => {
    const queryRaw=vi.fn()
      .mockResolvedValueOnce([{id:'bank-1'}])
      .mockResolvedValueOnce([{externalKey:'EXT-OLD',transactionDate:'2026-09-17',direction:'CREDIT',amountPaise:12500n}]);
    const executeRaw=vi.fn();
    const service=serviceWith({$queryRaw:queryRaw,$executeRaw:executeRaw});
    const preview=await service.previewImport('society-a','bank-1',[
      {externalKey:'EXT-NEW',transactionDate:'2026-09-18',direction:'DEBIT',amountPaise:5000},
      {externalKey:'EXT-OLD',transactionDate:'2026-09-17',direction:'CREDIT',amountPaise:12500},
      {externalKey:'EXT-NEW',transactionDate:'2026-09-18',direction:'DEBIT',amountPaise:5000},
    ]);
    expect(preview).toMatchObject({totalCount:3,newCount:1,alreadyImportedCount:1,duplicateInBatchCount:1,conflictCount:0,canCommit:false});
    expect(preview.items.map(item=>item.status)).toEqual(['NEW','ALREADY_IMPORTED','DUPLICATE_IN_BATCH']);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('flags an existing external-key payload mismatch as a preview conflict', async () => {
    const queryRaw=vi.fn()
      .mockResolvedValueOnce([{id:'bank-1'}])
      .mockResolvedValueOnce([{externalKey:'EXT-OLD',transactionDate:'2026-09-17',direction:'CREDIT',amountPaise:12500n}]);
    const preview=await serviceWith({$queryRaw:queryRaw}).previewImport('society-a','bank-1',[
      {externalKey:'EXT-OLD',transactionDate:'2026-09-17',direction:'DEBIT',amountPaise:12500},
    ]);
    expect(preview).toMatchObject({conflictCount:1,canCommit:false});
    expect(preview.items[0]).toMatchObject({externalKey:'EXT-OLD',status:'CONFLICT'});
  });

  it('rejects a bank account outside the active society boundary', async () => {
    const queryRaw: RawMock = vi.fn().mockResolvedValue([]);
    const service = serviceWith({ $queryRaw: queryRaw });

    await expect(service.importTransaction('society-a', 'user-a', {
      bankAccountId: 'bank-from-other-society', externalKey: 'EXT-2', transactionDate: '2026-09-17', direction: 'DEBIT', amountPaise: 5000,
    })).rejects.toBeInstanceOf(BadRequestException);

    const sql = queryRaw.mock.calls[0][0] as { values?: unknown[] };
    expect(sql.values).toContain('society-a');
  });

  it('rejects a journal whose bank movement does not match amount and direction', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: 'tx-1', status: 'UNMATCHED', direction: 'CREDIT', amountPaise: 10000n, ledgerAccountId: 'ledger-bank' }])
        .mockResolvedValueOnce([{ id: 'journal-1', status: 'POSTED' }])
        .mockResolvedValueOnce([{ bankDelta: 9999n }]),
      $executeRaw: vi.fn(),
    };
    const service = serviceWith(transactionalPrisma(tx));

    await expect(service.match('society-a', 'user-a', 'tx-1', { journalEntryId: 'journal-1' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('prevents the same journal from reconciling two statement transactions', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: 'tx-2', status: 'UNMATCHED', direction: 'DEBIT', amountPaise: 10000n, ledgerAccountId: 'ledger-bank' }])
        .mockResolvedValueOnce([{ id: 'journal-1', status: 'POSTED' }])
        .mockResolvedValueOnce([{ bankDelta: -10000n }])
        .mockResolvedValueOnce([{ id: 'match-existing' }]),
      $executeRaw: vi.fn(),
    };
    const service = serviceWith(transactionalPrisma(tx));

    await expect(service.match('society-a', 'user-a', 'tx-2', { journalEntryId: 'journal-1' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('supports a clean match and later unmatch without rewriting the journal', async () => {
    const matchTx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: 'tx-3', status: 'UNMATCHED', direction: 'CREDIT', amountPaise: 25000n, ledgerAccountId: 'ledger-bank' }])
        .mockResolvedValueOnce([{ id: 'journal-3', status: 'POSTED' }])
        .mockResolvedValueOnce([{ bankDelta: 25000n }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'match-3' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const matched = await serviceWith(transactionalPrisma(matchTx)).match('society-a', 'user-a', 'tx-3', { journalEntryId: 'journal-3' });
    expect(matched).toEqual({ transactionId: 'tx-3', journalEntryId: 'journal-3', matchId: 'match-3', status: 'MATCHED' });
    expect(matchTx.$executeRaw).toHaveBeenCalledTimes(1);

    const unmatchTx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ id: 'tx-3', status: 'MATCHED' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const unmatched = await serviceWith(transactionalPrisma(unmatchTx)).unmatch('society-a', 'tx-3');
    expect(unmatched).toEqual({ transactionId: 'tx-3', status: 'UNMATCHED' });
    expect(unmatchTx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('allows ignore only for an unmatched statement transaction', async () => {
    const service = serviceWith({ $executeRaw: vi.fn().mockResolvedValue(0) });
    await expect(service.ignore('society-a', 'tx-matched')).rejects.toBeInstanceOf(ConflictException);
  });
  it('returns tenant-scoped read-only candidate suggestions without auto matching', async () => {
    const queryRaw = vi.fn()
      .mockResolvedValueOnce([{ id:'tx-4',status:'UNMATCHED',transactionDate:new Date('2026-09-18'),direction:'CREDIT',amountPaise:50000n,ledgerAccountId:'ledger-bank',bankCode:'OPERATING' }])
      .mockResolvedValueOnce([{ journalEntryId:'journal-4',entryNumber:'J-004',bankMovementPaise:'50000',dateDistanceDays:0 }]);
    const executeRaw = vi.fn();
    const service = serviceWith({ $queryRaw: queryRaw, $executeRaw: executeRaw });

    const result = await service.suggestions('society-a','tx-4');
    expect(result).toMatchObject({autoMatched:false,candidates:[{journalEntryId:'journal-4'}]});
    expect(executeRaw).not.toHaveBeenCalled();
    for (const call of queryRaw.mock.calls) {
      expect((call[0] as {values?:unknown[]}).values).toContain('society-a');
    }
  });

  it('rejects reconciliation suggestions after a transaction is no longer unmatched', async () => {
    const service = serviceWith({ $queryRaw: vi.fn().mockResolvedValue([{id:'tx-5',status:'MATCHED',transactionDate:new Date(),direction:'CREDIT',amountPaise:100n,ledgerAccountId:'ledger',bankCode:'BANK'}]) });
    await expect(service.suggestions('society-a','tx-5')).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns an accountant review snapshot without mutating accounting data', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{transactionCount:10,matchedCount:7,unmatchedCount:2,ignoredCount:1,staleUnmatchedCount:1,unmatchedValuePaise:'123400',matchRatePct:77.8}]);
    const executeRaw = vi.fn();
    const service = serviceWith({$queryRaw:queryRaw,$executeRaw:executeRaw});
    await expect(service.review('society-a')).resolves.toMatchObject({matchedCount:7,staleUnmatchedCount:1,matchRatePct:77.8});
    expect(executeRaw).not.toHaveBeenCalled();
    expect((queryRaw.mock.calls[0][0] as {values?:unknown[]}).values).toContain('society-a');
  });

});
