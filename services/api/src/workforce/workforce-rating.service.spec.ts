import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceRatingService } from './workforce-rating.service';

describe('WorkforceRatingService', () => {
  it('lists ratings only through current occupancy', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new WorkforceRatingService(prisma as unknown as PrismaService);
    await service.listMine('society-1', 'user-1');
    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain('"UnitOccupancy"');
    expect(sql).toContain('"effectiveTo" IS NULL');
    expect(sql).not.toContain('"UnitResident"');
  });

  it('rejects rating scores outside 1 to 5 before querying storage', async () => {
    const prisma = { $queryRaw: vi.fn() };
    const service = new WorkforceRatingService(prisma as unknown as PrismaService);

    await expect(service.rateMine('society-1', 'user-1', 'assignment-1', { score: 6 })).rejects.toThrow(
      'Rating score must be an integer between 1 and 5',
    );
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns a generic not-found response when the assignment is outside resident ownership', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new WorkforceRatingService(prisma as unknown as PrismaService);

    await expect(service.rateMine('society-1', 'user-1', 'assignment-2', { score: 5 })).rejects.toThrow(
      'Workforce assignment not found',
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('limits rating comments to 300 characters', async () => {
    const prisma = { $queryRaw: vi.fn() };
    const service = new WorkforceRatingService(prisma as unknown as PrismaService);

    await expect(
      service.rateMine('society-1', 'user-1', 'assignment-1', { score: 4, comment: 'x'.repeat(301) }),
    ).rejects.toThrow('Rating comment must be 300 characters or fewer');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
