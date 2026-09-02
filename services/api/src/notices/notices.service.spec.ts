import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { NoticesService } from './notices.service';

describe('NoticesService', () => {
  it('rejects invalid title before persistence', async () => {
    const prisma = { $transaction: vi.fn(), $queryRaw: vi.fn() };
    const service = new NoticesService(prisma as unknown as PrismaService);

    await expect(service.createDraft(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      { title: 'x', body: 'Scheduled water shutdown tomorrow' },
    )).rejects.toThrow('Title must be between 3 and 160 characters');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not expose a cross-tenant notice by id', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]), $transaction: vi.fn() };
    const service = new NoticesService(prisma as unknown as PrismaService);

    await expect(service.archive(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '33333333-3333-3333-3333-333333333333',
    )).rejects.toThrow('Notice not found');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
