import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MigrationOpeningBalanceCommitService } from './migration-opening-balance-commit.service';

describe('MigrationOpeningBalanceCommitService', () => {
  it('supports only opening-balance batches', () => {
    const service = new MigrationOpeningBalanceCommitService({} as never, {} as never, {} as never);
    expect(service.supports('OPENING_BALANCE')).toBe(true);
    expect(service.supports('RESIDENT')).toBe(false);
  });

  it('blocks rollback when no open accounting period exists for a posted journal reversal', async () => {
    const prisma = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111', status: 'COMMITTED', totalRows: 2 }])
        .mockResolvedValueOnce([
          { id: 'a', rowNumber: 1, normalized: {}, valid: true, targetId: '22222222-2222-2222-2222-222222222222' },
          { id: 'b', rowNumber: 2, normalized: {}, valid: true, targetId: '22222222-2222-2222-2222-222222222222' },
        ])
        .mockResolvedValueOnce([{ status: 'POSTED' }])
        .mockResolvedValueOnce([]),
    };
    const service = new MigrationOpeningBalanceCommitService(prisma as never, {} as never, {} as never);
    await expect(service.rollback('33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111'))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
