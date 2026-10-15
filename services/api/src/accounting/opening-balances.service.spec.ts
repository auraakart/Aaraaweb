import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OpeningBalancesService } from './opening-balances.service';

const baseInput = {
  batchKey: 'legacy-cutover-2026',
  periodId: '11111111-1111-4111-8111-111111111111',
  entryNumber: 'OB-2026-001',
  entryDate: '2026-04-01',
  description: 'Legacy system opening balances',
  lines: [
    { accountId: '22222222-2222-4222-8222-222222222222', debitPaise: 10000, creditPaise: 0 },
    { accountId: '33333333-3333-4333-8333-333333333333', debitPaise: 0, creditPaise: 10000 },
  ],
};

function serviceWithTx(tx: Record<string, unknown>) {
  return new OpeningBalancesService({
    $transaction: vi.fn(async (work: (client: unknown) => Promise<unknown>) => work(tx)),
  } as never);
}

describe('OpeningBalancesService', () => {
  it('rejects unbalanced cutover lines before database mutation', async () => {
    const service = new OpeningBalancesService({ $transaction: vi.fn() } as never);
    await expect(service.apply('society-a', 'user-a', {
      ...baseInput,
      lines: [
        { ...baseInput.lines[0], debitPaise: 15000 },
        baseInput.lines[1],
      ],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects dual-sided or zero-value lines', async () => {
    const service = new OpeningBalancesService({ $transaction: vi.fn() } as never);
    await expect(service.apply('society-a', 'user-a', {
      ...baseInput,
      lines: [
        { ...baseInput.lines[0], creditPaise: 10000 },
        baseInput.lines[1],
      ],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a cutover date after operational journals have started', async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: baseInput.periodId, status: 'OPEN', startsOn: new Date('2026-04-01T00:00:00Z'), endsOn: new Date('2027-03-31T00:00:00Z') }])
        .mockResolvedValueOnce([{ id: 'existing-operational-journal' }]),
    };
    const service = serviceWithTx(tx);
    await expect(service.apply('society-a', 'user-a', baseInput)).rejects.toBeInstanceOf(ConflictException);
  });

  it('posts a balanced opening-balance batch exactly once', async () => {
    const tx = {
      $executeRaw: vi.fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1),
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: baseInput.periodId, status: 'OPEN', startsOn: new Date('2026-04-01T00:00:00Z'), endsOn: new Date('2027-03-31T00:00:00Z') }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 2n }])
        .mockResolvedValueOnce([{ id: 'journal-opening-1' }]),
    };
    const service = serviceWithTx(tx);
    const result = await service.apply('society-a', 'user-a', baseInput);

    expect(result).toMatchObject({
      journalId: 'journal-opening-1',
      batchKey: baseInput.batchKey,
      entryNumber: baseInput.entryNumber,
      debitPaise: '10000',
      creditPaise: '10000',
      lineCount: 2,
      idempotent: false,
      status: 'POSTED',
    });
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(4);
  });

  it('returns an identical posted batch idempotently and rejects changed content', async () => {
    const firstTx = {
      $executeRaw: vi.fn().mockResolvedValue(1).mockResolvedValue(1).mockResolvedValue(1).mockResolvedValue(1),
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: baseInput.periodId, status: 'OPEN', startsOn: new Date('2026-04-01T00:00:00Z'), endsOn: new Date('2027-03-31T00:00:00Z') }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 2n }])
        .mockResolvedValueOnce([{ id: 'journal-opening-1' }]),
    };
    const first = await serviceWithTx(firstTx).apply('society-a', 'user-a', baseInput);

    const duplicateTx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValueOnce([{
        id: 'journal-opening-1', entryNumber: baseInput.entryNumber, entryDate: new Date('2026-04-01T00:00:00Z'), status: 'POSTED', externalReference: `sha256:${first.contentHash}`,
      }]),
    };
    const duplicate = await serviceWithTx(duplicateTx).apply('society-a', 'user-a', baseInput);
    expect(duplicate.idempotent).toBe(true);
    expect(duplicate.journalId).toBe('journal-opening-1');

    const conflictTx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValueOnce([{
        id: 'journal-opening-1', entryNumber: baseInput.entryNumber, entryDate: new Date('2026-04-01T00:00:00Z'), status: 'POSTED', externalReference: `sha256:${first.contentHash}`,
      }]),
    };
    await expect(serviceWithTx(conflictTx).apply('society-a', 'user-a', {
      ...baseInput,
      description: 'Changed cutover payload',
    })).rejects.toBeInstanceOf(ConflictException);
  });
});
