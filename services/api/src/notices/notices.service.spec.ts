import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { NoticesService } from './notices.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const noticeId = '33333333-3333-4333-8333-333333333333';

function draft(audience: 'OWNER_ONLY' | 'OWNER_AND_OCCUPANTS' = 'OWNER_ONLY') {
  return {
    id: noticeId,
    societyId,
    createdById: actorId,
    title: 'Owner update',
    body: 'Annual general meeting documents are ready.',
    category: null,
    audience,
    importance: 'IMPORTANT' as const,
    requiresAcknowledgement: true,
    status: 'DRAFT' as const,
    publishedAt: null,
    expiresAt: null,
    archivedAt: null,
    createdAt: new Date('2026-09-14T00:00:00.000Z'),
    updatedAt: new Date('2026-09-14T00:00:00.000Z'),
  };
}

describe('NoticesService', () => {
  it('rejects invalid title before persistence', async () => {
    const prisma = { $transaction: vi.fn(), $queryRaw: vi.fn() };
    const service = new NoticesService(prisma as unknown as PrismaService);
    await expect(service.createDraft(societyId, actorId, {
      title: 'x', body: 'Scheduled water shutdown tomorrow', audience: 'OWNER_AND_OCCUPANTS',
    })).rejects.toThrow('Title must be between 3 and 160 characters');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires acknowledgement for critical notices', async () => {
    const service = new NoticesService({ $transaction: vi.fn() } as unknown as PrismaService);
    await expect(service.createDraft(societyId, actorId, {
      title: 'Fire alarm testing', body: 'Mandatory evacuation drill tomorrow', importance: 'CRITICAL', requiresAcknowledgement: false,
    })).rejects.toThrow('Critical notices must require acknowledgement');
  });

  it('filters owner-only and shared broadcasts at the database boundary', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new NoticesService(prisma as unknown as PrismaService);
    await service.listPublished(societyId, actorId);
    const sql = (prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(sql).toContain('n."audience"=\'OWNER_AND_OCCUPANTS\'');
    expect(sql).toContain('"UnitOwnership"');
    expect(sql).toContain('"UnitOccupancy"');
    expect(sql).toContain('"NoticeRecipient"');
  });

  it('publishes and snapshots owner recipients transactionally', async () => {
    const notice = draft('OWNER_ONLY');
    const published = { ...notice, status: 'PUBLISHED' as const, publishedAt: new Date() };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([published]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValueOnce([notice]).mockResolvedValueOnce([{ userId: 'owner-1' }]),
      $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
    };
    const realtime = { publishResident: vi.fn() };
    const service = new NoticesService(prisma as unknown as PrismaService, realtime as never);

    await service.publish(societyId, actorId, noticeId);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const snapshotSql = (tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(snapshotSql).toContain('"NoticeRecipient"');
    expect(snapshotSql).toContain('"UnitOwnership"');
    expect(realtime.publishResident).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner-1', noticeId }));
  });

  it('adds occupant recipients only for shared broadcasts', async () => {
    const notice = draft('OWNER_AND_OCCUPANTS');
    const published = { ...notice, status: 'PUBLISHED' as const, publishedAt: new Date() };
    const tx = { $queryRaw: vi.fn().mockResolvedValue([published]), $executeRaw: vi.fn().mockResolvedValue(1) };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValueOnce([notice]).mockResolvedValueOnce([]),
      $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)),
    };
    const service = new NoticesService(prisma as unknown as PrismaService);
    await service.publish(societyId, actorId, noticeId);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
    const occupantSql = (tx.$executeRaw.mock.calls[1][0] as { strings: readonly string[] }).strings.join(' ');
    expect(occupantSql).toContain('"UnitOccupancy"');
  });

  it('acknowledges only assigned published notices and records evidence', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ noticeId, readAt: new Date(), acknowledgedAt: new Date() }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn((run: (client: typeof tx) => unknown) => run(tx)) };
    const service = new NoticesService(prisma as unknown as PrismaService);
    await expect(service.acknowledge(societyId, actorId, noticeId)).resolves.toMatchObject({ noticeId });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const eventSql = (tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(eventSql).toContain('ACKNOWLEDGED');
  });

  it('reports acknowledgement metrics without leaking recipient detail', async () => {
    const notice = { ...draft(), status: 'PUBLISHED' as const };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValueOnce([notice]).mockResolvedValueOnce([{ total: 5n, read: 4n, acknowledged: 3n }]),
    };
    const service = new NoticesService(prisma as unknown as PrismaService);
    await expect(service.acknowledgementSummary(societyId, noticeId)).resolves.toEqual({
      noticeId,
      requiresAcknowledgement: true,
      totalRecipients: 5,
      readRecipients: 4,
      acknowledgedRecipients: 3,
      pendingAcknowledgement: 2,
    });
  });
});
