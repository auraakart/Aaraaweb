import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { NoticesService } from './notices.service';

describe('NoticesService targeted visibility', () => {
  it('requires recipient snapshot membership for building or unit targeted notices', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new NoticesService(prisma as unknown as PrismaService);

    await service.listPublished('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');

    const sql = (prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain('n."targetBuildingId" IS NOT NULL');
    expect(sql).toContain('n."targetUnitId" IS NOT NULL');
    expect(sql).toContain('nr."userId" IS NOT NULL');
  });
});
