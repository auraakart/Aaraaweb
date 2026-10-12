import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceService } from './workforce.service';

const accessStub = {} as AccessService;

describe('WorkforceService tenant isolation', () => {
  it('scopes the operational review list to the authenticated society', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new WorkforceService({ workforceAssignment: { findMany } } as unknown as PrismaService, accessStub);

    await expect(service.listForReview('society-a')).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { societyId: 'society-a', active: true },
      take: 500,
    }));
  });

  it('does not reveal a household outside the authenticated society', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      household: { findFirst: vi.fn() },
      unitOccupancy: { findFirst: vi.fn() },
    };
    const prisma = {withTenantContext: vi.fn(async (_id: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx))};
    const service = new WorkforceService(prisma as unknown as PrismaService, accessStub);

    await expect(
      service.addWorker('society-a', 'resident-a', {
        householdId: 'household-b',
        name: 'Maya',
        phone: '+919900000000',
        role: 'MAID',
      }),
    ).rejects.toThrow('Household not found');
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.household.findFirst).not.toHaveBeenCalled();
    expect(tx.unitOccupancy.findFirst).not.toHaveBeenCalled();
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-a',expect.any(Function));
  });

  it('rejects foreign society assignment before reviewer read or update', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      workforceAssignment: { findFirst: vi.fn(), update: vi.fn() },
    };
    const prisma = { withTenantContext: vi.fn(async (_id: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const service = new WorkforceService(prisma as unknown as PrismaService, accessStub);
    await expect(service.review('society-a', 'assignment-b', 'APPROVED')).rejects.toThrow(
      'Active workforce assignment not found',
    );
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-a', expect.any(Function));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect((tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[] }).strings.join(' ')).toContain('FOR UPDATE');
    expect(tx.workforceAssignment.findFirst).not.toHaveBeenCalled();
    expect(tx.workforceAssignment.update).not.toHaveBeenCalled();
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


describe('V5.2.26 core workforce tenant lock and gate reads', () => {
  const scoped = (tx: Record<string, unknown>) => ({
    withTenantContext: vi.fn(async (_id:string, op:(client:typeof tx)=>Promise<unknown>)=>op(tx)),
  });

  it('serializes reviewer status and writes through the scoped client', async () => {
    const assignment = { id:'assignment-a', societyId:'society-a', status:'PENDING', workerId:'worker-a',
      worker:{verification:'VERIFIED'} };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{id:'assignment-a'}]),
      workforceAssignment: {
        findFirst: vi.fn().mockResolvedValue(assignment),
        update: vi.fn().mockResolvedValue({...assignment,status:'APPROVED'}),
      },
      domesticWorker: {update:vi.fn()},
    };
    const prisma=scoped(tx);
    const service=new WorkforceService(prisma as unknown as PrismaService,accessStub);
    await expect(service.review('society-a','assignment-a','APPROVED')).resolves.toMatchObject({status:'APPROVED'});
    expect(tx.workforceAssignment.update).toHaveBeenCalledWith(expect.objectContaining({
      where:{id:'assignment-a',societyId:'society-a'},
      data:{status:'APPROVED'},
    }));
    expect(tx.domesticWorker.update).not.toHaveBeenCalled();
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
  });

  it('denies reviewer action when the assignment is already reviewed', async () => {
    const tx = {$queryRaw:vi.fn().mockResolvedValue([{id:'assignment-a'}]),
      workforceAssignment:{findFirst:vi.fn().mockResolvedValue({id:'assignment-a',status:'APPROVED'}),update:vi.fn()}};
    await expect(new WorkforceService(scoped(tx) as unknown as PrismaService,accessStub)
      .review('society-a','assignment-a','REJECTED'))
      .rejects.toThrow('Only pending workforce assignments can be reviewed');
    expect(tx.workforceAssignment.update).not.toHaveBeenCalled();
  });

  it('checks resident household ownership in transaction before deactivation', async () => {
    const assignment={id:'assignment-a',societyId:'society-a',householdId:'household-a'};
    const tx={
      $queryRaw:vi.fn().mockResolvedValue([{id:'assignment-a'}]),
      workforceAssignment:{findFirst:vi.fn().mockResolvedValue(assignment),
        update:vi.fn().mockResolvedValue({...assignment,active:false})},
      household:{findFirst:vi.fn().mockResolvedValue({id:'household-a',unitId:'unit-a'})},
      unitOccupancy:{findFirst:vi.fn().mockResolvedValue({id:'occupancy-a'})},
    };
    const prisma=scoped(tx);
    await expect(new WorkforceService(prisma as unknown as PrismaService,accessStub)
      .deactivateMine('society-a','resident-a','assignment-a'))
      .resolves.toMatchObject({active:false});
    expect(tx.unitOccupancy.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({societyId:'society-a',userId:'resident-a',unitId:'unit-a',active:true}),
    }));
    expect(tx.workforceAssignment.update).toHaveBeenCalledWith(expect.objectContaining({
      where:{id:'assignment-a',societyId:'society-a'},
    }));
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
  });

  it('refuses deactivation if current occupancy is lost', async () => {
    const tx={
      $queryRaw:vi.fn().mockResolvedValue([{id:'assignment-a'}]),
      workforceAssignment:{findFirst:vi.fn().mockResolvedValue({id:'assignment-a',householdId:'household-a'}),update:vi.fn()},
      household:{findFirst:vi.fn().mockResolvedValue({id:'household-a',unitId:'unit-a'})},
      unitOccupancy:{findFirst:vi.fn().mockResolvedValue(null)},
    };
    await expect(new WorkforceService(scoped(tx) as unknown as PrismaService,accessStub)
      .deactivateMine('society-a','former-tenant','assignment-a'))
      .rejects.toThrow('Household not found');
    expect(tx.workforceAssignment.update).not.toHaveBeenCalled();
  });

  it('scopes resident status occupancy and workforce/attendance query together', async () => {
    const tx={
      unitOccupancy:{findFirst:vi.fn().mockResolvedValue({id:'current'})},
      $queryRaw:vi.fn().mockResolvedValue([{id:'assignment-a',checkedInNow:true,onLeaveToday:false}]),
    };
    const prisma=scoped(tx);
    await expect(new WorkforceService(prisma as unknown as PrismaService,accessStub)
      .residentStatusMine('society-a','resident-a','unit-a'))
      .resolves.toMatchObject({activeAssignmentCount:1,checkedInCount:1,onLeaveCount:0});
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('reads gate eligible staff from one tenant client while retaining schedules and verification filter', async()=>{
    const tx={workforceAssignment:{findMany:vi.fn().mockResolvedValue([
      {worker:{active:true,verification:'VERIFIED',name:'Maya',phone:'123'},schedule:{}},
      {worker:{active:false,verification:'VERIFIED',name:'Other',phone:'456'},schedule:{}},
    ])}};
    const prisma=scoped(tx);
    await expect(new WorkforceService(prisma as unknown as PrismaService,accessStub)
      .listGateEligible('society-a'))
      .resolves.toHaveLength(1);
    expect(tx.workforceAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({societyId:'society-a',status:'APPROVED',active:true}),
    }));
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
  });
});
