import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AccountingService } from './accounting.service';

describe('V4.14 accounting period close', () => {
  it('reports draft journals as a close blocker with tenant-scoped evidence', async () => {
    const prisma = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          id: 'period-a',
          code: 'FY26-09',
          name: 'September 2026',
          startsOn: new Date('2026-09-01T00:00:00.000Z'),
          endsOn: new Date('2026-09-30T00:00:00.000Z'),
          status: 'OPEN',
          closedAt: null,
          closedByUserId: null,
        }])
        .mockResolvedValueOnce([{
          draftCount: 2n,
          postedCount: 4n,
          reversedCount: 1n,
          debit: 12500n,
          credit: 12500n,
        }]),
    };
    const service = new AccountingService(prisma as never);

    const result = await service.periodCloseReadiness('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

    expect(result.readyToClose).toBe(false);
    expect(result.blockers).toEqual([{
      code: 'DRAFT_JOURNALS',
      count: 2,
      message: 'Post or remove all draft journals before closing this period.',
    }]);
    expect(result.journalSummary).toMatchObject({
      draftCount: 2,
      postedCount: 4,
      reversedCount: 1,
      debitPaise: '12500',
      creditPaise: '12500',
      balanced: true,
    });

    const values = prisma.$queryRaw.mock.calls.flatMap(([query]) =>
      Array.isArray((query as { values?: unknown[] }).values) ? (query as { values: unknown[] }).values : [],
    );
    expect(values).toContain('11111111-1111-1111-1111-111111111111');
    expect(values).toContain('22222222-2222-2222-2222-222222222222');
  });

  it('closes an open period only after confirming there are no drafts and posted totals balance', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          id: '22222222-2222-2222-2222-222222222222',
          code: 'FY26-09',
          name: 'September 2026',
          startsOn: new Date('2026-09-01T00:00:00.000Z'),
          endsOn: new Date('2026-09-30T00:00:00.000Z'),
          status: 'OPEN',
        }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ debit: 25000n, credit: 25000n }])
        .mockResolvedValueOnce([{
          id: '22222222-2222-2222-2222-222222222222',
          status: 'CLOSED',
          closedByUserId: '33333333-3333-3333-3333-333333333333',
        }]),
    };
    const prisma = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const service = new AccountingService(prisma as never);

    const result = await service.closePeriod(
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333',
      '22222222-2222-2222-2222-222222222222',
    );

    expect(result).toMatchObject({
      status: 'CLOSED',
      closedByUserId: '33333333-3333-3333-3333-333333333333',
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
  });

  it('refuses to close while draft journals remain and never reaches the close update', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          id: '22222222-2222-2222-2222-222222222222',
          code: 'FY26-09',
          name: 'September 2026',
          startsOn: new Date('2026-09-01T00:00:00.000Z'),
          endsOn: new Date('2026-09-30T00:00:00.000Z'),
          status: 'OPEN',
        }])
        .mockResolvedValueOnce([{ id: 'draft-a' }]),
    };
    const prisma = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const service = new AccountingService(prisma as never);

    await expect(service.closePeriod(
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333',
      '22222222-2222-2222-2222-222222222222',
    )).rejects.toBeInstanceOf(ConflictException);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('refuses new journal drafts when the locked accounting period is already closed', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{
        id: '22222222-2222-2222-2222-222222222222',
        status: 'CLOSED',
        startsOn: new Date('2026-09-01T00:00:00.000Z'),
        endsOn: new Date('2026-09-30T00:00:00.000Z'),
      }]),
      $executeRaw: vi.fn(),
    };
    const prisma = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const service = new AccountingService(prisma as never);

    await expect(service.createDraft(
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333',
      {
        periodId: '22222222-2222-2222-2222-222222222222',
        entryNumber: 'J-1',
        entryDate: '2026-09-10',
        description: 'Blocked draft',
        lines: [
          { accountId: '44444444-4444-4444-4444-444444444444', debitPaise: 100, creditPaise: 0 },
          { accountId: '55555555-5555-5555-5555-555555555555', debitPaise: 0, creditPaise: 100 },
        ],
      },
    )).rejects.toBeInstanceOf(ConflictException);

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
