import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MigrationOperationalCommitService } from './migration-operational-commit.service';

describe('MigrationOperationalCommitService', () => {
  it('enables only the low-risk operational entity adapters', () => {
    const service = new MigrationOperationalCommitService({} as never);
    expect(service.supports('VEHICLE')).toBe(true);
    expect(service.supports('WORKFORCE')).toBe(true);
    expect(service.supports('VENDOR')).toBe(true);
    expect(service.supports('PARKING')).toBe(true);
    expect(service.supports('RESIDENT')).toBe(false);
    expect(service.supports('OPENING_BALANCE')).toBe(false);
  });

  it('blocks vehicle rollback once operational records depend on it', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111', entityType: 'VEHICLE', status: 'COMMITTED', totalRows: 1 }])
      .mockResolvedValueOnce([{ id: '22222222-2222-2222-2222-222222222222', rowNumber: 1, normalized: {}, valid: true, targetId: '33333333-3333-3333-3333-333333333333' }])
      .mockResolvedValueOnce([{ blocked: true }]);
    const tx = { $executeRaw: vi.fn().mockResolvedValue(0), $queryRaw: query, householdVehicle: { deleteMany: vi.fn() } };
    const prisma = { $transaction: (callback: (value: typeof tx) => unknown) => callback(tx) };
    const service = new MigrationOperationalCommitService(prisma as never);
    await expect(service.rollback('44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.householdVehicle.deleteMany).not.toHaveBeenCalled();
  });

  it('blocks parking rollback once an allocation depends on a migrated slot', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111', entityType: 'PARKING', status: 'COMMITTED', totalRows: 1 }])
      .mockResolvedValueOnce([{ id: '22222222-2222-2222-2222-222222222222', rowNumber: 1, normalized: {}, valid: true, targetId: '33333333-3333-3333-3333-333333333333' }])
      .mockResolvedValueOnce([{ blocked: true }]);
    const tx = { $executeRaw: vi.fn().mockResolvedValue(0), $queryRaw: query };
    const prisma = { $transaction: (callback: (value: typeof tx) => unknown) => callback(tx) };
    const service = new MigrationOperationalCommitService(prisma as never);
    await expect(service.rollback('44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111')).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks workforce rollback once assignments or audit records exist', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111', entityType: 'WORKFORCE', status: 'COMMITTED', totalRows: 1 }])
      .mockResolvedValueOnce([{ id: '22222222-2222-2222-2222-222222222222', rowNumber: 1, normalized: {}, valid: true, targetId: '33333333-3333-3333-3333-333333333333' }]);
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(0), $queryRaw: query,
      workforceAssignment: { count: vi.fn().mockResolvedValue(1) },
      workforceRating: { count: vi.fn().mockResolvedValue(0) },
      workforceSuspensionEvent: { count: vi.fn().mockResolvedValue(0) },
      domesticWorker: { deleteMany: vi.fn() },
    };
    const prisma = { $transaction: (callback: (value: typeof tx) => unknown) => callback(tx) };
    const service = new MigrationOperationalCommitService(prisma as never);
    await expect(service.rollback('44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111')).rejects.toBeInstanceOf(ConflictException);
    expect(tx.domesticWorker.deleteMany).not.toHaveBeenCalled();
  });
});
