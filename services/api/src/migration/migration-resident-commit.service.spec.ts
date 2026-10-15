import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MigrationResidentCommitService } from './migration-resident-commit.service';

describe('MigrationResidentCommitService', () => {
  it('supports only resident batches', () => {
    const service = new MigrationResidentCommitService({} as never);
    expect(service.supports('RESIDENT')).toBe(true);
    expect(service.supports('UNIT')).toBe(false);
  });

  it('blocks rollback after resident operational activity begins', async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111', status: 'COMMITTED', totalRows: 1, committedAt: new Date() }])
        .mockResolvedValueOnce([
          { artifactType: 'USER', artifactId: '22222222-2222-2222-2222-222222222222', createdByMigration: false, metadata: {} },
        ])
        .mockResolvedValueOnce([{ blocked: true }]),
    };
    const prisma = { $transaction: (callback: (value: typeof tx) => unknown) => callback(tx) };
    const service = new MigrationResidentCommitService(prisma as never);
    await expect(service.rollback(
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444',
      '11111111-1111-1111-1111-111111111111',
    )).rejects.toBeInstanceOf(ConflictException);
  });
});
