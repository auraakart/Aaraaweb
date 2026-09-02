import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceLeaveService } from './workforce-leave.service';

describe('WorkforceLeaveService relationship authorization', () => {
  it('lists household workforce leave only through current occupancy', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new WorkforceLeaveService(prisma as unknown as PrismaService);
    await service.listMine('society-1', 'user-1');
    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain('"UnitOccupancy"');
    expect(sql).toContain('"effectiveFrom" <= CURRENT_TIMESTAMP');
    expect(sql).not.toContain('"UnitResident"');
  });
});
