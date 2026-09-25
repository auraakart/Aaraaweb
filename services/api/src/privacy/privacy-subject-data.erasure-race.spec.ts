import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacySubjectDataService } from './privacy-subject-data.service';

const societyId='11111111-1111-4111-8111-111111111111';
const caseId='22222222-2222-4222-8222-222222222222';
const userId='33333333-3333-4333-8333-333333333333';
const actorUserId='44444444-4444-4444-8444-444444444444';

const executableCase={
  id:caseId,
  societyId,
  subjectUserId:userId,
  requestType:'ERASURE',
  status:'IN_REVIEW',
  legalHold:false,
  retentionDecision:'ALLOW',
} as const;

describe('PrivacySubjectDataService erasure execution race safety',()=>{
  it('rechecks active relationships inside the erasure transaction before destructive mutations',async()=>{
    const tx={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([executableCase])
        .mockResolvedValueOnce([{id:userId}])
        .mockResolvedValueOnce([{count:1}]),
      $executeRaw:vi.fn(),
    };
    const prisma={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([executableCase])
        .mockResolvedValueOnce([{count:0}]),
      $transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx)),
    };
    const service=new PrivacySubjectDataService(prisma as unknown as PrismaService);

    await expect(service.executeErasure(societyId,actorUserId,caseId))
      .rejects.toThrow('Erasure cannot execute: ACTIVE_SOCIETY_RELATIONSHIP');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    const userLockSql=(tx.$queryRaw.mock.calls[1][0] as {strings:readonly string[]}).strings.join(' ');
    expect(userLockSql).toContain('FROM "User"');
    expect(userLockSql).toContain('FOR UPDATE');
  });

  it('rechecks legal-hold state under the case lock before destructive mutations',async()=>{
    const changedCase={...executableCase,legalHold:true};
    const tx={
      $queryRaw:vi.fn().mockResolvedValueOnce([changedCase]),
      $executeRaw:vi.fn(),
    };
    const prisma={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([executableCase])
        .mockResolvedValueOnce([{count:0}]),
      $transaction:vi.fn((run:(client:typeof tx)=>unknown)=>run(tx)),
    };
    const service=new PrivacySubjectDataService(prisma as unknown as PrismaService);

    await expect(service.executeErasure(societyId,actorUserId,caseId))
      .rejects.toThrow('Erasure cannot execute: LEGAL_HOLD_ACTIVE');

    expect(tx.$executeRaw).not.toHaveBeenCalled();
    const caseLockSql=(tx.$queryRaw.mock.calls[0][0] as {strings:readonly string[]}).strings.join(' ');
    expect(caseLockSql).toContain('"PrivacyRequestCase"');
    expect(caseLockSql).toContain('FOR UPDATE');
  });
});
