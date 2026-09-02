import { DomesticWorkerVerificationStatus, WorkforceAssignmentStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceSuspensionService } from './workforce-suspension.service';

describe('WorkforceSuspensionService', () => {
  it('scopes worker suspension lookup to the authenticated society', async () => {
    const prisma = {
      domesticWorker: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new WorkforceSuspensionService(prisma as unknown as PrismaService);

    await expect(service.suspendWorker('society-a', 'worker-b')).rejects.toThrow('Active domestic worker not found');
    expect(prisma.domesticWorker.findFirst).toHaveBeenCalledWith({
      where: { id: 'worker-b', societyId: 'society-a', active: true },
    });
  });

  it('suspends only a verified worker', async () => {
    const prisma = {
      domesticWorker: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'worker-a',
          societyId: 'society-a',
          active: true,
          verification: DomesticWorkerVerificationStatus.VERIFIED,
        }),
        update: vi.fn().mockResolvedValue({ id: 'worker-a', verification: DomesticWorkerVerificationStatus.SUSPENDED }),
      },
    };
    const service = new WorkforceSuspensionService(prisma as unknown as PrismaService);

    await service.suspendWorker('society-a', 'worker-a');
    expect(prisma.domesticWorker.update).toHaveBeenCalledWith({
      where: { id: 'worker-a' },
      data: { verification: DomesticWorkerVerificationStatus.SUSPENDED },
    });
  });

  it('refuses assignment reinstatement while the worker remains suspended', async () => {
    const prisma = {
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
    const service = new WorkforceSuspensionService(prisma as unknown as PrismaService);

    await expect(service.reinstateAssignment('society-a', 'assignment-a')).rejects.toThrow(
      'Domestic worker must be active and verified before assignment reinstatement',
    );
    expect(prisma.workforceAssignment.update).not.toHaveBeenCalled();
  });

  it('scopes assignment suspension lookup to the authenticated society', async () => {
    const prisma = {
      workforceAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const service = new WorkforceSuspensionService(prisma as unknown as PrismaService);

    await expect(service.suspendAssignment('society-a', 'assignment-b')).rejects.toThrow(
      'Active workforce assignment not found',
    );
    expect(prisma.workforceAssignment.findFirst).toHaveBeenCalledWith({
      where: { id: 'assignment-b', societyId: 'society-a', active: true },
    });
  });
});
