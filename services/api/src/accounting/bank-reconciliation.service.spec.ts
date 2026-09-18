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
      .mockResolvedValueOnce([{ id: 'tx-1', bankAccountId: 'bank-1', externalKey: 'EXT-1', status: 'UNMATCHED' }]);
    const service = serviceWith({ $queryRaw: queryRaw });

    const result = await service.importTransaction('society-a', 'user-a', {
      bankAccountId: 'bank-1', externalKey: 'EXT-1', transactionDate: '2026-09-17', direction: 'CREDIT', amountPaise: 12500,
    });

    expect(result).toMatchObject({ id: 'tx-1', externalKey: 'EXT-1', status: 'UNMATCHED' });
    expect(queryRaw).toHaveBeenCalledTimes(3);
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
});
