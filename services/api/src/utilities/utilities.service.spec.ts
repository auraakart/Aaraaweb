import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { UtilitiesService } from './utilities.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const meterId = '33333333-3333-4333-8333-333333333333';
const readingId = '44444444-4444-4444-8444-444444444444';

describe('UtilitiesService', () => {
  it('creates normalized society-scoped meters and audit evidence', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: meterId }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new UtilitiesService(prisma as unknown as PrismaService);

    await expect(service.createMeter(societyId, actorId, {
      code: '  water-main-01 ',
      meterType: 'WATER',
      label: 'Main inlet',
    })).resolves.toEqual({ id: meterId });

    const insert = tx.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(insert.values).toContain('WATER-MAIN-01');
    const event = tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] };
    expect(event.strings.join(' ')).toContain("'METER_CREATED'");
  });

  it('requires reset readings to carry an explanatory note', async () => {
    const prisma = { $transaction: vi.fn() };
    const service = new UtilitiesService(prisma as unknown as PrismaService);

    await expect(service.createReading(societyId, actorId, {
      meterId,
      readingAt: '2026-09-15T00:00:00.000Z',
      value: 5,
      readingKind: 'RESET',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects readings for inactive or missing meters', async () => {
    const tx = { $queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn() };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new UtilitiesService(prisma as unknown as PrismaService);

    await expect(service.createReading(societyId, actorId, {
      meterId,
      readingAt: '2026-09-15T00:00:00.000Z',
      value: 10,
    })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a lower actual reading unless it is recorded as a reset', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: meterId, active: true }])
        .mockResolvedValueOnce([{ value: '100.000000', readingKind: 'ACTUAL' }])
        .mockResolvedValueOnce([]),
      $executeRaw: vi.fn(),
    };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new UtilitiesService(prisma as unknown as PrismaService);

    await expect(service.createReading(societyId, actorId, {
      meterId,
      readingAt: '2026-09-15T00:00:00.000Z',
      value: 90,
    })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('records reset readings transactionally with audit evidence', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: meterId, active: true }])
        .mockResolvedValueOnce([{ id: readingId }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn((cb: (client: typeof tx) => unknown) => cb(tx)) };
    const service = new UtilitiesService(prisma as unknown as PrismaService);

    await expect(service.createReading(societyId, actorId, {
      meterId,
      readingAt: '2026-09-15T00:00:00.000Z',
      value: 0,
      readingKind: 'RESET',
      note: 'Meter replaced',
    })).resolves.toEqual({ id: readingId });

    const insert = tx.$queryRaw.mock.calls[1][0] as { values: unknown[] };
    expect(insert.values).toContain('RESET');
    expect(insert.values).toContain('Meter replaced');
    const event = tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] };
    expect(event.strings.join(' ')).toContain("'READING_RECORDED'");
  });
});
