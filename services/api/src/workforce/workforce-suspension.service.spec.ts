import { DomesticWorkerVerificationStatus, WorkforceAssignmentStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceSuspensionService } from './workforce-suspension.service';

const withTransaction = (tx: Record<string, unknown>) => ({
  $transaction: vi.fn(async (callback: (client: Record<string, unknown>) => unknown) => callback(tx)),
});

describe('WorkforceSuspensionService', () => {
  it('scopes worker suspension lookup to the authenticated society', async () => {
    const tx = {
      domesticWorker: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const prisma = withTransaction(tx);
    const service = new WorkforceSuspensionService(prisma as unknown as PrismaService);

    await expect(service.suspendWorker('society-a', 'worker-b', 'reviewer-a', 'Access policy breach')).rejects.toThrow(
      'Active domestic worker not found',
    );
    expect(tx.domesticWorker.findFirst).toHaveBeenCalledWith({
      where: { id: 'worker-b', societyId: 'society-a', active: true },
    });
  });

  it('suspends a verified worker and writes the audit event in the same transaction', async () => {
    const tx = {
      domesticWorker: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'worker-a',
          societyId: 'society-a',
          active: true,
          verification: DomesticWorkerVerificationStatus.VERIFIED,
        }),
        update: vi.fn().mockResolvedValue({ id: 'worker-a', verification: DomesticWorkerVerificationStatus.SUSPENDED }),
      },
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = withTransaction(tx);
    const service = new WorkforceSuspensionService(prisma as unknown as PrismaService);

    await service.suspendWorker('society-a', 'worker-a', 'reviewer-a', ' Access policy breach ');
    expect(tx.domesticWorker.update).toHaveBeenCalledWith({
      where: { id: 'worker-a' },
      data: { verification: DomesticWorkerVerificationStatus.SUSPENDED },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('requires a meaningful suspension reason before starting a transaction', async () => {
    const prisma = withTransaction({});
    const service = new WorkforceSuspensionService(prisma as unknown as PrismaService);

    await expect(service.suspendWorker('society-a', 'worker-a', 'reviewer-a', '  ')).rejects.toThrow(
      'Suspension reason must be at least 3 characters',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses assignment reinstatement while the worker remains suspended', async () => {
    const tx = {
      workforceAssignment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'assignment-a',
          societyId: 'society-a',
          active: true,
          status: WorkforceAssignmentStatus.SUSPENDED,
          worker: {
            active: true,
            verification: DomesticWorkerVerificationStatus.SUSPENDED,
          },
        }),
        update: vi.fn(),
      },
    };
    const prisma = withTransaction(tx);
    const service = new WorkforceSuspensionService(prisma as unknown as PrismaService);

    await expect(service.reinstateAssignment('society-a', 'assignment-a', 'reviewer-a')).rejects.toThrow(
      'Domestic worker must be active and verified before assignment reinstatement',
    );
    expect(tx.workforceAssignment.update).not.toHaveBeenCalled();
  });

  it('scopes assignment suspension lookup to the authenticated society', async () => {
    const tx = {
      workforceAssignment: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const prisma = withTransaction(tx);
    const service = new WorkforceSuspensionService(prisma as unknown as PrismaService);

    await expect(
      service.suspendAssignment('society-a', 'assignment-b', 'reviewer-a', 'Resident safety concern'),
    ).rejects.toThrow('Active workforce assignment not found');
    expect(tx.workforceAssignment.findFirst).toHaveBeenCalledWith({
      where: { id: 'assignment-b', societyId: 'society-a', active: true },
    });
  });
});
