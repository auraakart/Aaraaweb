import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyService } from './privacy.service';

function sqlText(call: unknown): string {
  return ((call as { strings?: readonly string[] }).strings ?? []).join('?');
}

describe('V4.5 privacy retention enforcement', () => {
  const current = {
    id: 'case-1',
    societyId: 'society-1',
    subjectUserId: 'user-1',
    requestType: 'ERASURE',
    status: 'IN_REVIEW',
    legalHold: false,
    retentionReason: null,
    retentionDecision: null,
  };

  it('fails closed when an erasure case has no retention review', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([current]) };
    const service = new PrivacyService(prisma as unknown as PrismaService);

    await expect(service.updateStatus('society-1', 'admin-1', 'case-1', 'COMPLETED')).rejects.toThrow(
      'Erasure case cannot be completed until retention review allows completion',
    );
  });

  it('does not allow a retention decision to override legal hold', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ ...current, legalHold: true }]) };
    const service = new PrivacyService(prisma as unknown as PrismaService);

    await expect(
      service.updateRetentionReview('society-1', 'admin-1', 'case-1', 'ALLOW', 'Reviewed configured retention obligations'),
    ).rejects.toThrow('Retention review cannot allow erasure while legal hold is active');
  });

  it('records an allow decision and append-only review evidence transactionally', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ ...current, retentionDecision: 'ALLOW' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([current]),
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new PrivacyService(prisma as unknown as PrismaService);

    await service.updateRetentionReview(
      'society-1',
      'admin-1',
      'case-1',
      'ALLOW',
      'Reviewed configured retention obligations',
    );

    const update = tx.$queryRaw.mock.calls[0][0];
    expect(sqlText(update)).toContain('"retentionDecision" = ?');
    expect(sqlText(update)).toContain('"retentionReviewedByUserId" = ?::uuid');
    expect(sqlText(update)).toContain('"legalHold" = ?');

    const event = tx.$executeRaw.mock.calls[0][0];
    expect(sqlText(event)).toContain("'RETENTION_REVIEWED'");
  });

  it('invalidates an earlier retention decision whenever legal-hold state changes', async () => {
    const reviewed = { ...current, retentionDecision: 'ALLOW', retentionDecisionReason: 'Reviewed', retentionReviewedAt: new Date(), retentionReviewedByUserId: 'admin-1' };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ ...reviewed, legalHold: true, retentionDecision: null }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([reviewed]),
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new PrivacyService(prisma as unknown as PrismaService);

    await service.updateLegalHold('society-1', 'admin-2', 'case-1', true, 'Dispute preservation');

    const update = tx.$queryRaw.mock.calls[0][0];
    const text = sqlText(update);
    expect(text).toContain('"retentionDecision" = NULL');
    expect(text).toContain('"retentionDecisionReason" = NULL');
    expect(text).toContain('"retentionReviewedAt" = NULL');
    expect(text).toContain('"retentionReviewedByUserId" = NULL');
    expect(text).toContain('"retentionDecision" IS NOT DISTINCT FROM ?');
  });
});
