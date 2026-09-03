import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceService } from './workforce.service';

const accessStub = {} as AccessService;

describe('WorkforceService tenant isolation', () => {
  it('does not reveal a household outside the authenticated society', async () => {
    const prisma = {
      household: { findFirst: vi.fn().mockResolvedValue(null) },
      unitOccupancy: { findFirst: vi.fn() },
    };
    const service = new WorkforceService(prisma as unknown as PrismaService, accessStub);

    await expect(
      service.addWorker('society-a', 'resident-a', {
        householdId: 'household-b',
        name: 'Maya',
        phone: '+919900000000',
        role: 'MAID',
      }),
    ).rejects.toThrow('Household not found');
    expect(prisma.household.findFirst).toHaveBeenCalledWith({ where: { id: 'household-b', societyId: 'society-a' } });
    expect(prisma.unitOccupancy.findFirst).not.toHaveBeenCalled();
  });

  it('scopes society review lookup by assignment id and tenant society', async () => {
    const prisma = {
      workforceAssignment: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const service = new WorkforceService(prisma as unknown as PrismaService, accessStub);

    await expect(service.review('society-a', 'assignment-b', 'APPROVED')).rejects.toThrow(
      'Active workforce assignment not found',
    );
    expect(prisma.workforceAssignment.findFirst).toHaveBeenCalledWith({
      where: { id: 'assignment-b', societyId: 'society-a', active: true },
      include: { worker: true },
    });
  });
});

describe('WorkforceService gate attendance', () => {
  const assignment = {
    id: 'assignment-a',
    societyId: 'society-a',
    householdId: 'household-a',
    workerId: 'worker-a',
    status: 'APPROVED',
    active: true,
    startDate: null,
    endDate: null,
    schedule: {},
    worker: { id: 'worker-a', name: 'Maya', phone: '+919900000000', role: 'MAID', active: true, verification: 'VERIFIED' },
    household: { unitId: 'unit-a', unit: { occupancies: [{ userId: 'resident-a' }] } },
  };

  it('denies a worker outside the approved schedule before creating a visit', async () => {
    const prisma = {
      gateMutationReceipt: { findUnique: vi.fn().mockResolvedValue(null) },
      gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate-a' }) },
      workforceAssignment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'assignment-a',
          societyId: 'society-a',
          householdId: 'household-a',
          workerId: 'worker-a',
          status: 'APPROVED',
          active: true,
          startDate: null,
          endDate: null,
          schedule: { days: ['MONDAY'] },
          worker: { id: 'worker-a', name: 'Maya', phone: '+919900000000', role: 'MAID', active: true, verification: 'VERIFIED' },
          household: { unitId: 'unit-a', unit: { occupancies: [{ userId: 'resident-a' }] } },
        }),
      },
      accessRequest: { findFirst: vi.fn() },
    };
    const service = new WorkforceService(prisma as unknown as PrismaService, accessStub);
    const tuesdayInIndia = new Date('2026-09-01T04:30:00.000Z');

    await expect(
      service.gateCheckIn('society-a', 'gate-a', 'assignment-a', 'guard-a', 'idem-1', tuesdayInIndia),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.accessRequest.findFirst).not.toHaveBeenCalled();
  });

  it('replays a completed workforce check-in safely with the same idempotency key', async () => {
    const request = {
      id: 'request-a',
      societyId: 'society-a',
      unitId: 'unit-a',
      metadata: { workforceAssignmentId: 'assignment-a' },
    };
    const prisma = {
      gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate-a' }) },
      gateMutationReceipt: {
        findUnique: vi.fn().mockResolvedValue({
          accessRequestId: 'request-a',
          gateId: 'gate-a',
          action: 'CHECK_IN',
        }),
      },
      accessRequest: { findFirst: vi.fn().mockResolvedValue(request) },
      unitOccupancy: { findMany: vi.fn().mockResolvedValue([{ userId: 'resident-a' }]) },
    };
    const service = new WorkforceService(prisma as unknown as PrismaService, accessStub);

    const result = await service.gateCheckIn('society-a', 'gate-a', 'assignment-a', 'guard-a', 'idem-1');

    expect(result.request).toBe(request);
    expect(result.residentUserIds).toEqual(['resident-a']);
    expect(prisma.gateMutationReceipt.findUnique).toHaveBeenCalledWith({
      where: { societyId_idempotencyKey: { societyId: 'society-a', idempotencyKey: 'idem-1' } },
    });
  });

  it('checks active attendance inside a serializable transaction', async () => {
    const created = { id: 'request-a', societyId: 'society-a', unitId: 'unit-a', metadata: { workforceAssignmentId: 'assignment-a' } };
    const tx = {
      workforceLeave: { findFirst: vi.fn().mockResolvedValue(null) },
      accessRequest: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(created) },
      gateMutationReceipt: { create: vi.fn() },
      auditEvent: { createMany: vi.fn() },
    };
    const transaction = vi.fn().mockImplementation(async (operation: (client: typeof tx) => unknown) => operation(tx));
    const prisma = {
      gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate-a' }) },
      gateMutationReceipt: { findUnique: vi.fn().mockResolvedValue(null) },
      workforceAssignment: { findFirst: vi.fn().mockResolvedValue(assignment) },
      accessRequest: { findFirst: vi.fn() },
      $transaction: transaction,
    };
    const service = new WorkforceService(prisma as unknown as PrismaService, accessStub);

    await expect(service.gateCheckIn('society-a', 'gate-a', 'assignment-a', 'guard-a', 'idem-1')).resolves.toEqual({
      request: created,
      residentUserIds: ['resident-a'],
    });

    expect(tx.accessRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'CHECKED_IN' }),
    }));
    expect(tx.workforceLeave.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ societyId: 'society-a', assignmentId: 'assignment-a', active: true }),
    }));
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  it('rejects approved leave again inside the check-in transaction', async () => {
    const tx = {
      workforceLeave: { findFirst: vi.fn().mockResolvedValue({ id: 'leave-a' }) },
      accessRequest: { findFirst: vi.fn(), create: vi.fn() },
      gateMutationReceipt: { create: vi.fn() },
      auditEvent: { createMany: vi.fn() },
    };
    const prisma = {
      gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate-a' }) },
      gateMutationReceipt: { findUnique: vi.fn().mockResolvedValue(null) },
      workforceAssignment: { findFirst: vi.fn().mockResolvedValue(assignment) },
      accessRequest: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn().mockImplementation(async (operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const service = new WorkforceService(prisma as unknown as PrismaService, accessStub);

    await expect(service.gateCheckIn('society-a', 'gate-a', 'assignment-a', 'guard-a', 'idem-leave')).rejects.toThrow(
      'Worker is on approved leave today',
    );
    expect(tx.accessRequest.create).not.toHaveBeenCalled();
  });

  it('rejects a competing check-in after a serialization conflict commits another visit', async () => {
    const committed = { id: 'request-b', societyId: 'society-a', unitId: 'unit-a', metadata: { workforceAssignmentId: 'assignment-a' } };
    const prisma = {
      gate: { findFirst: vi.fn().mockResolvedValue({ id: 'gate-a' }) },
      gateMutationReceipt: { findUnique: vi.fn().mockResolvedValue(null) },
      workforceAssignment: { findFirst: vi.fn().mockResolvedValue(assignment) },
      accessRequest: { findFirst: vi.fn().mockResolvedValue(committed) },
      $transaction: vi.fn().mockRejectedValue(new Error('serialization conflict')),
    };
    const service = new WorkforceService(prisma as unknown as PrismaService, accessStub);

    await expect(service.gateCheckIn('society-a', 'gate-a', 'assignment-a', 'guard-b', 'idem-2')).rejects.toThrow(
      'Worker is already checked in for this assignment',
    );
  });
});
