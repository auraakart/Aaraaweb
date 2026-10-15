import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { MigrationBatchService } from './migration-batch.service';
import { MigrationPreviewService } from './migration-preview.service';

describe('MigrationBatchService readiness', () => {
  it('summarizes committed, ready and dependency-blocked onboarding stages', async () => {
    const queryRaw = vi.fn().mockResolvedValue([
      { entityType:'BUILDING', status:'COMMITTED', invalidRows:0, duplicateRows:0, referentialIssueCount:0, createdAt:new Date('2026-09-22T01:00:00Z') },
      { entityType:'UNIT', status:'READY', invalidRows:0, duplicateRows:0, referentialIssueCount:0, createdAt:new Date('2026-09-22T02:00:00Z') },
      { entityType:'RESIDENT', status:'PREVIEWED', invalidRows:2, duplicateRows:1, referentialIssueCount:1, createdAt:new Date('2026-09-22T03:00:00Z') },
    ]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new MigrationBatchService(prisma, new MigrationPreviewService());

    const result = await service.readiness('11111111-1111-4111-8111-111111111111');

    expect(result.committedStages).toBe(1);
    expect(result.readyStages).toBe(1);
    expect(result.nextStage).toBe('UNIT');
    expect(result.stages.find(item=>item.entityType==='UNIT')?.status).toBe('READY');
    expect(result.stages.find(item=>item.entityType==='RESIDENT')?.status).toBe('BLOCKED');
    expect(result.stages.find(item=>item.entityType==='RESIDENT')?.blockers).toEqual(expect.arrayContaining([
      '2 invalid rows',
      '1 duplicate rows',
      '1 reference issues',
      'Previous migration stage is not committed',
    ]));
    expect(result.complete).toBe(false);
  });
});
