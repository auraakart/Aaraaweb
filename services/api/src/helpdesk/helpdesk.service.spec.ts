import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { HelpdeskService } from './helpdesk.service';

describe('HelpdeskService', () => {
  it('authorizes household tickets through current occupancy, never legacy residency', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new HelpdeskService(prisma as unknown as PrismaService);
    await service.listMine('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain('"UnitOccupancy"');
    expect(sql).toContain('"effectiveFrom" <= CURRENT_TIMESTAMP');
    expect(sql).not.toContain('"UnitResident"');
  });

  it('rejects invalid ticket title before writing', async () => {
    const prisma = { $queryRaw: vi.fn(), $transaction: vi.fn() };
    const service = new HelpdeskService(prisma as unknown as PrismaService);

    await expect(
      service.createMine('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', {
        unitId: '33333333-3333-3333-3333-333333333333',
        title: 'x',
        description: 'Water leakage near kitchen sink',
      }),
    ).rejects.toThrow('Title must be between 3 and 120 characters');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns generic not-found when resident does not own the requested unit', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]), $transaction: vi.fn() };
    const service = new HelpdeskService(prisma as unknown as PrismaService);

    await expect(
      service.createMine('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', {
        unitId: '33333333-3333-3333-3333-333333333333',
        title: 'Water leakage',
        description: 'Water leakage near kitchen sink',
      }),
    ).rejects.toThrow('Unit not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not expose activity history for a ticket outside resident ownership', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new HelpdeskService(prisma as unknown as PrismaService);

    await expect(
      service.activitiesMine(
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        '44444444-4444-4444-4444-444444444444',
      ),
    ).rejects.toThrow('Helpdesk ticket not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
