import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AccountingService } from './accounting.service';

const societyId = '33333333-3333-3333-3333-333333333333';
const actorId = '44444444-4444-4444-4444-444444444444';
const journalId = '22222222-2222-2222-2222-222222222222';

function fixture(credit: string) {
  const tx = {
    $queryRaw: vi.fn()
      .mockResolvedValueOnce([{
        id: journalId, societyId, status: 'DRAFT', periodId: journalId,
        entryDate: new Date('2026-10-10T00:00:00.000Z'),
      }])
      .mockResolvedValueOnce([{
        status: 'OPEN', startsOn: new Date('2026-01-01T00:00:00.000Z'),
        endsOn: new Date('2026-12-31T00:00:00.000Z'),
      }])
      // PostgreSQL SUM(bigint) returns numeric; Prisma decodes numeric as
      // distinct Decimal objects, not JS primitive bigints.
      .mockResolvedValueOnce([{
        lineCount: 2n, debit: new Prisma.Decimal('12000'),
        credit: new Prisma.Decimal(credit),
      }])
      .mockResolvedValueOnce([{ id: journalId, status: 'POSTED' }]),
    $executeRaw: vi.fn().mockResolvedValue(1),
  };
  const prisma = {
    $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)),
  };
  return { service: new AccountingService(prisma as never), tx, prisma };
}

describe('V5.6.8 PostgreSQL numeric journal totals', () => {
  it('posts a balanced journal when aggregate debit and credit are separate equal Decimal instances', async () => {
    const { service, tx } = fixture('12000');
    await expect(service.postJournal(societyId, actorId, journalId))
      .resolves.toMatchObject({ id: journalId, status: 'POSTED' });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
  });

  it('rejects unequal paise totals before any journal status write', async () => {
    const { service, tx } = fixture('11999');
    await expect(service.postJournal(societyId, actorId, journalId))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
  });
});
