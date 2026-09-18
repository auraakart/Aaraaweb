import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MigrationCommitCoordinator } from './migration-commit-coordinator.service';

describe('MigrationCommitCoordinator', () => {
  it('routes enabled adapters while keeping protected domains disabled', async () => {
    const prisma = { $queryRaw: vi.fn()
      .mockResolvedValueOnce([{ entityType: 'BUILDING' }])
      .mockResolvedValueOnce([{ entityType: 'VENDOR' }])
      .mockResolvedValueOnce([{ entityType: 'OPENING_BALANCE' }]) };
    const structural = { supports: (type: string) => type === 'BUILDING', commit: vi.fn().mockResolvedValue({ kind: 'structural' }), rollback: vi.fn() };
    const operational = { supports: (type: string) => type === 'VENDOR', commit: vi.fn().mockResolvedValue({ kind: 'operational' }), rollback: vi.fn() };
    const service = new MigrationCommitCoordinator(prisma as never, structural as never, operational as never);
    await expect(service.commit('s','u','b1')).resolves.toEqual({ kind: 'structural' });
    await expect(service.commit('s','u','b2')).resolves.toEqual({ kind: 'operational' });
    await expect(service.commit('s','u','b3')).rejects.toBeInstanceOf(ConflictException);
  });
});
