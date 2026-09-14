import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { NoticeSchedulingService } from './notice-scheduling.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const noticeId = '33333333-3333-4333-8333-333333333333';

describe('NoticeSchedulingService', () => {
  it('rejects publication times that are not in the future', async () => {
    const prisma = { $transaction: vi.fn() };
    const service = new NoticeSchedulingService(prisma as unknown as PrismaService);

    await expect(service.schedule(societyId, actorId, noticeId, new Date(Date.now() - 1000).toISOString()))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects expiry before the scheduled publication time', async () => {
    const prisma = { $transaction: vi.fn() };
    const service = new NoticeSchedulingService(prisma as unknown as PrismaService);
    const publishAt = new Date(Date.now() + 60 * 60 * 1000);
    const expiresAt = new Date(publishAt.getTime() - 1000);

    await expect(service.schedule(societyId, actorId, noticeId, publishAt.toISOString(), expiresAt.toISOString()))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('schedules a draft, snapshots recipients and queues durable dispatch transactionally', async () => {
    const publishAt = new Date(Date.now() + 60 * 60 * 1000);
    const scheduled = { id: noticeId, status: 'PUBLISHED', publishedAt: publishAt };
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: noticeId, audience: 'OWNER_AND_OCCUPANTS', status: 'DRAFT', expiresAt: null }])
        .mockResolvedValueOnce([scheduled]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new NoticeSchedulingService(prisma as unknown as PrismaService);

    await expect(service.schedule(societyId, actorId, noticeId, publishAt.toISOString())).resolves.toEqual(scheduled);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(4);
    const dispatchSql = (tx.$executeRaw.mock.calls[2][0] as { strings: readonly string[] }).strings.join(' ');
    expect(dispatchSql).toContain('"NoticeDispatch"');
    expect(dispatchSql).toContain('"NoticeRecipient"');
  });
});
