import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { NoticeDeliveryObservabilityService } from './notice-delivery-observability.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const noticeId = '22222222-2222-4222-8222-222222222222';

describe('NoticeDeliveryObservabilityService', () => {
  it('rejects cross-tenant or missing notices before returning metrics', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValueOnce([]) };
    const service = new NoticeDeliveryObservabilityService(prisma as unknown as PrismaService);

    await expect(service.summary(societyId, noticeId)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('separates push handoff telemetry from read and acknowledgement engagement', async () => {
    const prisma = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          id: noticeId,
          status: 'PUBLISHED',
          publishedAt: new Date('2026-09-14T12:00:00.000Z'),
          expiresAt: null,
          requiresAcknowledgement: true,
        }])
        .mockResolvedValueOnce([{
          totalRecipients: 10n,
          readRecipients: 7n,
          acknowledgedRecipients: 5n,
          pendingHandoff: 1n,
          inFlightHandoff: 1n,
          successfulHandoff: 7n,
          retryingHandoff: 1n,
          attemptedRecipients: 9n,
          totalAttempts: 12n,
        }]),
    };
    const service = new NoticeDeliveryObservabilityService(prisma as unknown as PrismaService);

    await expect(service.summary(societyId, noticeId)).resolves.toMatchObject({
      recipientSnapshot: { total: 10 },
      pushHandoff: {
        pending: 1,
        inFlight: 1,
        successful: 7,
        retrying: 1,
        attemptedRecipients: 9,
        totalAttempts: 12,
      },
      engagement: {
        read: 7,
        unread: 3,
        acknowledged: 5,
        pendingAcknowledgement: 5,
      },
    });

    const aggregateSql = (prisma.$queryRaw.mock.calls[1][0] as { strings: readonly string[] }).strings.join(' ');
    expect(aggregateSql).toContain('"NoticeRecipient"');
    expect(aggregateSql).toContain('"NoticeDispatch"');
    expect(aggregateSql).toContain('nd."status"=\'DISPATCHED\'');
  });

  it('does not imply pending acknowledgement for notices that do not require it', async () => {
    const prisma = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{
          id: noticeId,
          status: 'PUBLISHED',
          publishedAt: new Date(),
          expiresAt: null,
          requiresAcknowledgement: false,
        }])
        .mockResolvedValueOnce([{
          totalRecipients: 3n,
          readRecipients: 1n,
          acknowledgedRecipients: 0n,
          pendingHandoff: 0n,
          inFlightHandoff: 0n,
          successfulHandoff: 3n,
          retryingHandoff: 0n,
          attemptedRecipients: 3n,
          totalAttempts: 3n,
        }]),
    };
    const service = new NoticeDeliveryObservabilityService(prisma as unknown as PrismaService);

    const result = await service.summary(societyId, noticeId);
    expect(result.engagement.pendingAcknowledgement).toBe(0);
    expect(result.semantics.legalService).toContain('must not be represented as legally effective service');
  });
});
