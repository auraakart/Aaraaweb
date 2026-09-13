import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SosService } from './sos.service';

describe('SosService relationship authorization', () => {
  it('rejects an SOS unit without a current occupancy and ignores legacy residency', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new SosService(prisma as unknown as PrismaService);
    await expect(service.trigger('society-1', 'user-1', { unitId: 'unit-1' })).rejects.toThrow(
      'Unit is not assigned to the authenticated resident',
    );
    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain('"UnitOccupancy"');
    expect(sql).toContain('"effectiveTo" IS NULL');
    expect(sql).not.toContain('"UnitResident"');
  });

  it('persists explicit emergency category and severity after current-occupancy validation', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'incident-1' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'occupancy-1' }]),
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new SosService(prisma as unknown as PrismaService);

    await service.trigger('society-1', 'user-1', {
      unitId: 'unit-1',
      category: 'MEDICAL',
      severity: 'CRITICAL',
      message: 'Need ambulance support',
    });

    const insert = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(insert.strings.join(' ')).toContain('"category", "severity"');
    expect(insert.values).toContain('MEDICAL');
    expect(insert.values).toContain('CRITICAL');

    const event = tx.$executeRaw.mock.calls[0][0] as { values: unknown[] };
    expect(event.values).toContain('category=MEDICAL;severity=CRITICAL');
  });

  it('uses backward-compatible OTHER/HIGH defaults when older clients omit classification', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'incident-1' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'occupancy-1' }]),
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new SosService(prisma as unknown as PrismaService);

    await service.trigger('society-1', 'user-1', { unitId: 'unit-1' });

    const insert = tx.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(insert.values).toContain('OTHER');
    expect(insert.values).toContain('HIGH');
  });
});
