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

  it('records escalation as an append-only incident event without changing incident status', async () => {
    const escalatedAt = new Date('2026-09-13T17:45:00Z');
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'incident-1', status: 'ACKNOWLEDGED', societyId: 'society-1' }])
        .mockResolvedValueOnce([{ occurredAt: escalatedAt }]),
    };
    const service = new SosService(prisma as unknown as PrismaService);

    const result = await service.escalate('society-1', 'responder-1', 'incident-1', 'Escalate to control room');

    const insert = prisma.$queryRaw.mock.calls[1][0] as { strings: readonly string[]; values: unknown[] };
    expect(insert.strings.join(' ')).toContain("'ESCALATED'");
    expect(insert.values).toContain('ACKNOWLEDGED');
    expect(insert.values).toContain('Escalate to control room');
    expect(result).toMatchObject({ id: 'incident-1', status: 'ACKNOWLEDGED', escalatedAt });
  });

  it('does not allow a resolved incident to be escalated', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'incident-1', status: 'RESOLVED', societyId: 'society-1' }]),
    };
    const service = new SosService(prisma as unknown as PrismaService);

    await expect(service.escalate('society-1', 'responder-1', 'incident-1')).rejects.toThrow(
      'Only active or acknowledged SOS incidents can be escalated',
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('prioritizes escalated active incidents in the responder queue', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new SosService(prisma as unknown as PrismaService);

    await service.listManage('society-1');

    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain("se.\"action\" = 'ESCALATED'");
    expect(sql).toContain('"escalatedAt" IS NOT NULL');
  });
});
