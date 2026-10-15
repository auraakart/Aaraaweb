import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MigrationStructuralCommitService } from './migration-structural-commit.service';

describe('MigrationStructuralCommitService', () => {
  it('enables controlled mutation only for structural dependency roots', () => {
    const service = new MigrationStructuralCommitService({} as never);
    expect(service.supports('BUILDING')).toBe(true);
    expect(service.supports('UNIT')).toBe(true);
    expect(service.supports('RESIDENT')).toBe(false);
    expect(service.supports('OPENING_BALANCE')).toBe(false);
  });

  it('blocks unit rollback once operational records depend on a migrated unit', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111', entityType: 'UNIT', status: 'COMMITTED', totalRows: 1 }])
      .mockResolvedValueOnce([{ id: '22222222-2222-2222-2222-222222222222', rowNumber: 1, normalized: {}, valid: true, targetId: '33333333-3333-3333-3333-333333333333' }])
      .mockResolvedValueOnce([{ blocked: true }]);
    const tx = { $executeRaw: vi.fn().mockResolvedValue(0), $queryRaw: query };
    const prisma = { $transaction: (callback: (value: typeof tx) => unknown) => callback(tx) };
    const service = new MigrationStructuralCommitService(prisma as never);

    await expect(service.rollback(
      '44444444-4444-4444-4444-444444444444',
      '55555555-5555-5555-5555-555555555555',
      '11111111-1111-1111-1111-111111111111',
    )).rejects.toBeInstanceOf(ConflictException);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
