import { BadRequestException } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { UtilityReadingImportService } from './utility-reading-import.service';

type TransactionClientMock = {
  $queryRaw: ReturnType<typeof vi.fn>;
  $executeRaw: ReturnType<typeof vi.fn>;
};

function asPrismaService(value: Partial<PrismaService>): PrismaService {
  return value as PrismaService;
}

describe('UtilityReadingImportService', () => {
  test('preview rejects duplicate timestamps in the same batch', async () => {
    const prisma = asPrismaService({
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: '11111111-1111-1111-1111-111111111111', code: 'ELEC-A101', active: true }])
        .mockResolvedValueOnce([]) as PrismaService['$queryRaw'],
    });
    const service = new UtilityReadingImportService(prisma);

    const result = await service.preview('22222222-2222-2222-2222-222222222222', [
      { meterCode: 'elec-a101', readingAt: '2026-09-15T00:00:00.000Z', value: 100 },
      { meterCode: 'ELEC-A101', readingAt: '2026-09-15T00:00:00.000Z', value: 101 },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === 'DUPLICATE_BATCH_TIMESTAMP')).toBe(true);
  });

  test('preview requires an explanation for RESET rows', async () => {
    const prisma = asPrismaService({ $queryRaw: vi.fn().mockResolvedValue([]) as PrismaService['$queryRaw'] });
    const service = new UtilityReadingImportService(prisma);

    const result = await service.preview('22222222-2222-2222-2222-222222222222', [
      { meterCode: 'ELEC-A101', readingAt: '2026-09-15T00:00:00.000Z', value: 0, readingKind: 'RESET' },
    ]);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === 'RESET_NOTE_REQUIRED')).toBe(true);
  });

  test('commit fails atomically when validation reports an invalid row', async () => {
    const tx: TransactionClientMock = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $executeRaw: vi.fn().mockResolvedValue(0),
    };
    const prisma = asPrismaService({
      $transaction: vi.fn(async (callback: (client: TransactionClientMock) => unknown) => callback(tx)) as unknown as PrismaService['$transaction'],
    });
    const service = new UtilityReadingImportService(prisma);

    await expect(service.commit(
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
      [{ meterCode: 'UNKNOWN', readingAt: '2026-09-15T00:00:00.000Z', value: 10 }],
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
