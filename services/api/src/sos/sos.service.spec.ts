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
});
