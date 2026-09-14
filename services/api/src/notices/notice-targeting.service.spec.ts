import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { NoticeTargetingService } from './notice-targeting.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const noticeId = '33333333-3333-4333-8333-333333333333';
const buildingId = '44444444-4444-4444-8444-444444444444';
const unitId = '55555555-5555-4555-8555-555555555555';

describe('NoticeTargetingService', () => {
  it('rejects simultaneous building and unit targeting', async () => {
    const prisma = { $transaction: vi.fn() };
    const service = new NoticeTargetingService(prisma as unknown as PrismaService);
    await expect(service.setTarget(societyId, actorId, noticeId, { buildingId, unitId }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a building outside the current society', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ id: noticeId, status: 'DRAFT' }]).mockResolvedValueOnce([]),
      $executeRaw: vi.fn(),
    };
    const prisma = { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new NoticeTargetingService(prisma as unknown as PrismaService);

    await expect(service.setTarget(societyId, actorId, noticeId, { buildingId }))
      .rejects.toThrow('current society');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('updates a draft target and writes audit evidence transactionally', async () => {
    const updated = { id: noticeId, status: 'DRAFT', targetUnitId: unitId, targetBuildingId: null };
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: noticeId, status: 'DRAFT' }])
        .mockResolvedValueOnce([{ id: unitId }])
        .mockResolvedValueOnce([updated]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new NoticeTargetingService(prisma as unknown as PrismaService);

    await expect(service.setTarget(societyId, actorId, noticeId, { unitId })).resolves.toEqual(updated);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const eventSql = (tx.$executeRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ');
    expect(eventSql).toContain('TARGET_UPDATED');
  });
});
