import { DomesticWorkerVerificationStatus as Verification, WorkforceAssignmentStatus as Assignment } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceSuspensionService } from './workforce-suspension.service';

function setup() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{id:'resource-1'}]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    domesticWorker: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
    workforceAssignment: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
  };
  const prisma = {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    withTenantContext: vi.fn(async (_id:string,callback:(client:typeof tx)=>Promise<unknown>)=>callback(tx)),
  };
  return {tx,prisma,service:new WorkforceSuspensionService(prisma as unknown as PrismaService)};
}
const sqlText = (value:unknown) => (value as {strings:readonly string[]}).strings.join(' ');

describe('V5.2.25 WorkforceSuspensionService tenant and transition locks',()=>{
  it('denies a foreign worker before ORM reads or writes',async()=>{
    const {service,tx,prisma}=setup();
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.suspendWorker('society-a','worker-b','reviewer-a','Access policy breach'))
      .rejects.toThrow('Active domestic worker not found');
    expect(sqlText(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
    expect((tx.$queryRaw.mock.calls[0][0] as {values:unknown[]}).values)
      .toContain('society-a');
    expect(tx.domesticWorker.findFirst).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('suspends verified worker with an audit event in one society transaction',async()=>{
    const {service,tx,prisma}=setup();
    tx.domesticWorker.findFirst.mockResolvedValueOnce({
      id:'worker-a',active:true,verification:Verification.VERIFIED,
    });
    tx.domesticWorker.update.mockResolvedValueOnce({id:'worker-a',verification:Verification.SUSPENDED});
    await expect(service.suspendWorker('society-a','worker-a','reviewer-a',' Access policy breach '))
      .resolves.toMatchObject({verification:Verification.SUSPENDED});
    expect(tx.domesticWorker.update).toHaveBeenCalledWith({
      where:{id:'worker-a',societyId:'society-a'},
      data:{verification:Verification.SUSPENDED},
    });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not duplicate audit when suspension is already applied',async()=>{
    const {service,tx}=setup();
    tx.domesticWorker.findFirst.mockResolvedValueOnce({id:'worker-a',verification:Verification.SUSPENDED});
    await expect(service.suspendWorker('society-a','worker-a','reviewer-a','Access policy breach'))
      .resolves.toMatchObject({verification:Verification.SUSPENDED});
    expect(tx.domesticWorker.update).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('validates reason before starting transaction',async()=>{
    const {service,prisma}=setup();
    await expect(service.suspendWorker('society-a','worker-a','reviewer-a','  '))
      .rejects.toThrow('Suspension reason must be at least 3 characters');
    expect(prisma.withTenantContext).not.toHaveBeenCalled();
  });

  it('reinstates worker with locked state and audit event',async()=>{
    const {service,tx}=setup();
    tx.domesticWorker.findFirst.mockResolvedValueOnce({id:'worker-a',verification:Verification.SUSPENDED});
    tx.domesticWorker.update.mockResolvedValueOnce({id:'worker-a',verification:Verification.VERIFIED});
    await expect(service.reinstateWorker('society-a','worker-a','reviewer-a'))
      .resolves.toMatchObject({verification:Verification.VERIFIED});
    expect(tx.domesticWorker.update).toHaveBeenCalledWith({
      where:{id:'worker-a',societyId:'society-a'},data:{verification:Verification.VERIFIED},
    });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it('denies foreign assignment before querying or writing it',async()=>{
    const {service,tx}=setup();
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.suspendAssignment('society-a','assignment-b','reviewer-a','Resident safety concern'))
      .rejects.toThrow('Active workforce assignment not found');
    expect(sqlText(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
    expect(tx.workforceAssignment.findFirst).not.toHaveBeenCalled();
  });

  it('suspends approved assignment in the locked tenant transaction',async()=>{
    const {service,tx}=setup();
    tx.workforceAssignment.findFirst.mockResolvedValueOnce({id:'assignment-a',status:Assignment.APPROVED});
    tx.workforceAssignment.update.mockResolvedValueOnce({id:'assignment-a',status:Assignment.SUSPENDED});
    await expect(service.suspendAssignment('society-a','assignment-a','reviewer-a','Resident safety concern'))
      .resolves.toMatchObject({status:Assignment.SUSPENDED});
    expect(tx.workforceAssignment.update).toHaveBeenCalledWith({
      where:{id:'assignment-a',societyId:'society-a'},data:{status:Assignment.SUSPENDED},
    });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it('does not reinstate assignment if associated worker is suspended',async()=>{
    const {service,tx}=setup();
    tx.workforceAssignment.findFirst.mockResolvedValueOnce({
      id:'assignment-a',workerId:'worker-a',status:Assignment.SUSPENDED,
      worker:{active:true,verification:Verification.SUSPENDED},
    });
    tx.domesticWorker.findFirst.mockResolvedValueOnce({id:'worker-a',verification:Verification.SUSPENDED});
    await expect(service.reinstateAssignment('society-a','assignment-a','reviewer-a'))
      .rejects.toThrow('Domestic worker must be active and verified before assignment reinstatement');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.workforceAssignment.update).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('locks both assignment and worker before reinstating assignment',async()=>{
    const {service,tx}=setup();
    tx.workforceAssignment.findFirst.mockResolvedValueOnce({
      id:'assignment-a',workerId:'worker-a',status:Assignment.SUSPENDED,
      worker:{active:true,verification:Verification.VERIFIED},
    });
    tx.domesticWorker.findFirst.mockResolvedValueOnce({id:'worker-a',active:true,verification:Verification.VERIFIED});
    tx.workforceAssignment.update.mockResolvedValueOnce({id:'assignment-a',status:Assignment.APPROVED});
    await expect(service.reinstateAssignment('society-a','assignment-a','reviewer-a'))
      .resolves.toMatchObject({status:Assignment.APPROVED});
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.workforceAssignment.update).toHaveBeenCalledWith({
      where:{id:'assignment-a',societyId:'society-a'},
      data:{status:Assignment.APPROVED},
      include:{worker:true},
    });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it('rolls back when appending audit event fails',async()=>{
    const {service,tx}=setup();
    tx.workforceAssignment.findFirst.mockResolvedValueOnce({id:'assignment-a',status:Assignment.APPROVED});
    tx.workforceAssignment.update.mockResolvedValueOnce({id:'assignment-a',status:Assignment.SUSPENDED});
    tx.$executeRaw.mockRejectedValueOnce(new Error('audit insertion failed'));
    await expect(service.suspendAssignment('society-a','assignment-a','reviewer-a','Resident safety concern'))
      .rejects.toThrow('audit insertion failed');
  });

  it('reads suspended workers, assignments and history through society transaction',async()=>{
    const {service,prisma,tx}=setup();
    tx.$queryRaw.mockResolvedValueOnce([{id:'event-a'}]);
    await expect(service.listSuspended('society-a'))
      .resolves.toEqual({workers:[],assignments:[]});
    await expect(service.history('society-a')).resolves.toEqual([{id:'event-a'}]);
    expect(tx.domesticWorker.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:{societyId:'society-a',active:true,verification:Verification.SUSPENDED},
    }));
    expect(tx.workforceAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:{societyId:'society-a',active:true,status:Assignment.SUSPENDED},
    }));
    expect(sqlText(tx.$queryRaw.mock.calls[0][0])).toContain('e."societyId"');
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
