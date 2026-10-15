import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyService } from './privacy.service';

function sqlText(call: unknown): string {
  return ((call as { strings?: readonly string[] }).strings ?? []).join('?');
}

describe('V4.5 privacy retention enforcement and V5.2.19 transactional rechecks', () => {
  const current = {
    id: 'case-1',
    societyId: 'society-1',
    subjectUserId: 'user-1',
    requestType: 'ERASURE',
    status: 'IN_REVIEW',
    legalHold: false,
    retentionReason: null,
    retentionDecision: null as 'ALLOW' | 'BLOCK' | null,
  };

  function setup(rows: unknown[][]) {
    const tx = {
      $queryRaw: vi.fn(),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    for (const row of rows) tx.$queryRaw.mockResolvedValueOnce(row);
    const prisma = {
      $queryRaw: vi.fn(),
      withTenantContext: vi.fn(async (_societyId: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
      $transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    return {tx, prisma, service: new PrivacyService(prisma as unknown as PrismaService)};
  }

  it('fails closed when erasure completion has no retention review under lock', async () => {
    const {tx, prisma, service} = setup([[current]]);
    await expect(service.updateStatus('society-1', 'admin-1', 'case-1', 'COMPLETED'))
      .rejects.toThrow('Erasure case cannot be completed until retention review allows completion');
    expect(sqlText(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
  });

  it('does not let a retention decision override legal hold under lock', async () => {
    const {tx, service} = setup([[{...current, legalHold: true}]]);
    await expect(service.updateRetentionReview('society-1', 'admin-1', 'case-1',
      'ALLOW', 'Reviewed configured retention obligations'))
      .rejects.toThrow('Retention review cannot allow erasure while legal hold is active');
    expect(sqlText(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('records an allow decision and append-only evidence in the scoped transaction', async () => {
    const {tx, prisma, service} = setup([[current], [{...current, retentionDecision: 'ALLOW'}]]);
    await service.updateRetentionReview('society-1', 'admin-1', 'case-1',
      'ALLOW', 'Reviewed configured retention obligations');

    const update = tx.$queryRaw.mock.calls[1][0];
    expect(sqlText(update)).toContain('"retentionDecision" = ?');
    expect(sqlText(update)).toContain('"retentionReviewedByUserId" = ?::uuid');
    expect(sqlText(update)).toContain('"legalHold" = ?');
    expect(sqlText(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));

    const event = tx.$executeRaw.mock.calls[0][0];
    expect(sqlText(event)).toContain("'RETENTION_REVIEWED'");
  });

  it('invalidates an earlier retention decision whenever legal-hold state changes', async () => {
    const reviewed = {...current, retentionDecision: 'ALLOW' as const,
      retentionDecisionReason: 'Reviewed', retentionReviewedAt: new Date(),
      retentionReviewedByUserId: 'admin-1'};
    const {tx, service} = setup([[reviewed], [{...reviewed, legalHold: true, retentionDecision: null}]]);
    await service.updateLegalHold('society-1', 'admin-2', 'case-1', true, 'Dispute preservation');
    const update = tx.$queryRaw.mock.calls[1][0];
    const text = sqlText(update);
    expect(text).toContain('"retentionDecision" = NULL');
    expect(text).toContain('"retentionDecisionReason" = NULL');
    expect(text).toContain('"retentionReviewedAt" = NULL');
    expect(text).toContain('"retentionReviewedByUserId" = NULL');
    expect(text).toContain('"retentionDecision" IS NOT DISTINCT FROM ?');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('does not append another status event when already terminal at the requested state', async () => {
    const {tx, service} = setup([[{...current, status: 'COMPLETED', retentionDecision: 'ALLOW'}]]);
    await expect(service.updateStatus('society-1', 'admin-1', 'case-1', 'COMPLETED'))
      .resolves.toMatchObject({status: 'COMPLETED'});
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('rejects a foreign society case before changing state or evidence', async () => {
    const {tx, service} = setup([[]]);
    await expect(service.updateLegalHold('society-1', 'admin-1', 'foreign-case', true, 'Hold'))
      .rejects.toThrow('Privacy request case not found');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('preserves independent-home case status updates with no invented society context', async () => {
    const personal = {...current, societyId: null, status: 'OPEN'};
    const {tx, prisma, service} = setup([[personal], [{...personal, status: 'IN_REVIEW'}]]);
    await expect(service.updateStatus(undefined, 'admin-1', 'case-1', 'IN_REVIEW'))
      .resolves.toMatchObject({status: 'IN_REVIEW'});
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const update = tx.$queryRaw.mock.calls[1][0] as { values: unknown[] };
    expect(update.values).toContain(null);
  });

  it('propagates append-only evidence failure from the state transition transaction', async () => {
    const {tx, service} = setup([[current], [{...current, status: 'WAITING'}]]);
    tx.$executeRaw.mockRejectedValueOnce(new Error('audit write failed'));
    await expect(service.updateStatus('society-1', 'admin-1', 'case-1', 'WAITING'))
      .rejects.toThrow('audit write failed');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
