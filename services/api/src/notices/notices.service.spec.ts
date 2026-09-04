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
      { title: 'x', body: 'Scheduled water shutdown tomorrow', audience: 'OWNER_AND_OCCUPANTS' },
    )).rejects.toThrow('Title must be between 3 and 160 characters');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('filters owner-only and shared broadcasts at the database boundary', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new NoticesService(prisma as unknown as PrismaService);
    await service.listPublished('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
    const sql = (prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain('n."audience"=\'OWNER_AND_OCCUPANTS\'');
    expect(sql).toContain('"UnitOwnership"');
    expect(sql).toContain('"UnitOccupancy"');
  });

  it('publishes owner-only broadcasts only to active verified owners', async () => {
    const notice = {
      id: '33333333-3333-3333-3333-333333333333',
      societyId: '11111111-1111-1111-1111-111111111111',
      createdById: '22222222-2222-2222-2222-222222222222',
      title: 'Owner update',
      body: 'Annual general meeting documents are ready.',
      category: null,
      audience: 'OWNER_ONLY' as const,
      status: 'DRAFT' as const,
      publishedAt: null,
      expiresAt: null,
      archivedAt: null,
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
      updatedAt: new Date('2026-09-05T00:00:00.000Z'),
    };
    const published = { ...notice, status: 'PUBLISHED' as const, publishedAt: new Date('2026-09-05T00:01:00.000Z') };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([published]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([notice])
        .mockResolvedValueOnce([{ userId: 'owner-1' }]),
      $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
    };
    const realtime = { publishResident: vi.fn() };
    const service = new NoticesService(prisma as unknown as PrismaService, realtime as never);

    await service.publish(notice.societyId, notice.createdById, notice.id);

    expect(realtime.publishResident).toHaveBeenCalledTimes(1);
    expect(realtime.publishResident).toHaveBeenCalledWith(expect.objectContaining({
      type: 'GENERAL_NOTICE_PUBLISHED', userId: 'owner-1', noticeId: notice.id,
    }));
    const recipientSql = (prisma.$queryRaw.mock.calls[1][0] as { strings: readonly string[] }).strings.join(' ');
    expect(recipientSql).toContain('"UnitOwnership"');
    expect(recipientSql).toContain('"UnitOccupancy"');
    expect(recipientSql).toContain("'OWNER_AND_OCCUPANTS'");
  });

  it('publishes shared broadcasts to the resolved owner and occupant recipient set', async () => {
    const notice = {
      id: '33333333-3333-3333-3333-333333333333',
      societyId: '11111111-1111-1111-1111-111111111111',
      createdById: '22222222-2222-2222-2222-222222222222',
      title: 'Water shutdown',
      body: 'Water supply will be unavailable tomorrow morning.',
      category: null,
      audience: 'OWNER_AND_OCCUPANTS' as const,
      status: 'DRAFT' as const,
      publishedAt: null,
      expiresAt: null,
      archivedAt: null,
      createdAt: new Date('2026-09-05T00:00:00.000Z'),
      updatedAt: new Date('2026-09-05T00:00:00.000Z'),
    };
    const published = { ...notice, status: 'PUBLISHED' as const, publishedAt: new Date('2026-09-05T00:01:00.000Z') };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([published]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([notice])
        .mockResolvedValueOnce([{ userId: 'owner-1' }, { userId: 'tenant-1' }]),
      $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
    };
    const realtime = { publishResident: vi.fn() };
    const service = new NoticesService(prisma as unknown as PrismaService, realtime as never);

    await service.publish(notice.societyId, notice.createdById, notice.id);

    expect(realtime.publishResident).toHaveBeenCalledTimes(2);
    expect(realtime.publishResident).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner-1' }));
    expect(realtime.publishResident).toHaveBeenCalledWith(expect.objectContaining({ userId: 'tenant-1' }));
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
