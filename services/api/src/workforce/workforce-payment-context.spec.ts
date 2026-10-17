import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { WorkforceService } from './workforce.service';

const data={assignmentId:'assignment-a',kind:'SALARY',amountPaise:10000,paymentDate:'2026-10-05',
  idempotencyKey:'worker-pay-123',note:'Paid privately'};
function setup(responses:unknown[][]) {
  const tx={
    $queryRaw:vi.fn(),
    workforceAssignment:{findFirst:vi.fn().mockResolvedValue({id:'assignment-a',householdId:'household-a',
      workerId:'worker-a',worker:{id:'worker-a',name:'Maya',role:'MAID'},schedule:{}})},
    household:{findFirst:vi.fn().mockResolvedValue({id:'household-a',unitId:'unit-a'})},
    unitOccupancy:{findFirst:vi.fn().mockResolvedValue({id:'occupancy-a'})},
    domesticWorker:{upsert:vi.fn().mockResolvedValue({id:'worker-a'})},
    workforceAssignmentUpdate:{},
  };
  for(const result of responses)tx.$queryRaw.mockResolvedValueOnce(result);
  const prisma={$queryRaw:vi.fn(),$transaction:vi.fn(),
    withTenantContext:vi.fn(async (_society:string,operation:(client:typeof tx)=>Promise<unknown>)=>operation(tx))};
  return {tx,prisma,service:new WorkforceService(prisma as unknown as PrismaService,{} as AccessService)};
}
const sql=(q:unknown)=>(q as {strings:readonly string[]}).strings.join(' ');

describe('V5.2.28 workforce attendance and private payment isolation',()=>{
  it('reads private payment records only within society tenant context',async()=>{
    const {service,prisma,tx}=setup([[{id:'payment-a'}]]);
    await expect(service.paymentRecordsMine('society-a','resident-a')).resolves.toHaveLength(1);
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-a',expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(sql(tx.$queryRaw.mock.calls[0][0])).toContain('"UnitOccupancy"');
  });
  it('refuses foreign payment assignment before inserting or replaying',async()=>{
    const {service,tx,prisma}=setup([[],[]]);
    await expect(service.createPaymentRecordMine('society-a','resident-a',data))
      .rejects.toThrow('Household staff assignment not found');
    expect(tx.workforceAssignment.findFirst).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('fails closed when current resident occupancy is revoked',async()=>{
    const {service,tx}=setup([[],[{id:'assignment-a'}]]);
    tx.unitOccupancy.findFirst.mockResolvedValueOnce(null);
    await expect(service.createPaymentRecordMine('society-a','former-resident',data))
      .rejects.toThrow('Household not found');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.unitOccupancy.findFirst).toHaveBeenCalledTimes(1);
  });
  it('uses one society client for idempotency, authorized assignment and inserted record',async()=>{
    const row={id:'payment-a',societyId:'society-a',recordedById:'resident-a'};
    const {service,tx,prisma}=setup([[],[{id:'assignment-a'}],[],[row]]);
    await expect(service.createPaymentRecordMine('society-a','resident-a',data))
      .resolves.toMatchObject(row);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(sql(tx.$queryRaw.mock.calls[0][0])).toContain('pg_advisory_xact_lock');
    expect(sql(tx.$queryRaw.mock.calls[1][0])).toContain('FOR UPDATE');
    expect(sql(tx.$queryRaw.mock.calls[2][0])).toContain('"idempotencyKey"');
    expect(sql(tx.$queryRaw.mock.calls[3][0])).toContain('INSERT INTO "WorkforcePaymentRecord"');
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
  it('rejects different payment intent under existing idempotency key',async()=>{
    const {service,tx}=setup([[],[{id:'assignment-a'}],[{
      assignmentId:'assignment-a',kind:'SALARY',amountPaise:20000,paymentDate:new Date('2026-10-05T00:00:00Z'),
      periodMonth:null,note:'Paid privately',
    }]]);
    await expect(service.createPaymentRecordMine('society-a','resident-a',data))
      .rejects.toThrow('Idempotency key was already used for a different staff payment record');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
  });
  it('replays identical intent only while current occupancy remains authorized',async()=>{
    const row={assignmentId:'assignment-a',kind:'SALARY',amountPaise:10000,
      paymentDate:new Date('2026-10-05T00:00:00Z'),periodMonth:null,note:'Paid privately'};
    const {service,tx}=setup([[],[{id:'assignment-a'}],[row]]);
    await expect(service.createPaymentRecordMine('society-a','resident-a',data)).resolves.toEqual(row);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
  });
  it('denies attendance before querying gate history for a foreign assignment',async()=>{
    const {service,tx,prisma}=setup([]);
    tx.workforceAssignment.findFirst.mockResolvedValueOnce(null);
    await expect(service.attendanceMine('society-a','resident-a','foreign-assignment'))
      .rejects.toThrow('Household staff assignment not found');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
  });
  it('reads attendance and leave evidence on same scoped client after verifying resident',async()=>{
    const {service,tx,prisma}=setup([[{date:new Date('2026-10-05T00:00:00Z'),
      visitCount:1,minutesInside:90}],[{id:'leave-a',startsOn:new Date('2026-10-06T00:00:00Z'),
      endsOn:new Date('2026-10-07T00:00:00Z')}]]);
    await expect(service.attendanceMine('society-a','resident-a','assignment-a','2026-10-05','2026-10-08'))
      .resolves.toMatchObject({summary:{presentDays:1,totalVisits:1,totalMinutesInside:90,leavePeriods:1}});
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.unitOccupancy.findFirst).toHaveBeenCalledOnce();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
  });
});
