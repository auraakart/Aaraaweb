import { describe, expect, it, vi } from 'vitest';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkforceService } from './workforce.service';

const preflight = {
  id:'assignment-a',societyId:'society-a',householdId:'household-a',workerId:'worker-a',
  active:true,status:'APPROVED',schedule:{},startDate:null,endDate:null,
  worker:{id:'worker-a',name:'Maya',phone:'919900000000',role:'MAID',active:true,verification:'VERIFIED'},
  household:{unitId:'unit-a',unit:{occupancies:[{userId:'stale-occupant'}]}},
};
function setup(queryResults:unknown[][],currentOccupants:Array<{userId:string}>=[]) {
  const request={id:'access-a',unitId:'unit-a',societyId:'society-a',
    metadata:{workforceAssignmentId:'assignment-a'}};
  const tx={
    $queryRaw:vi.fn(),
    unitOccupancy:{findMany:vi.fn().mockResolvedValue(currentOccupants)},
    workforceLeave:{findFirst:vi.fn().mockResolvedValue(null)},
    accessRequest:{findFirst:vi.fn().mockResolvedValue(null),create:vi.fn().mockResolvedValue(request)},
    gateMutationReceipt:{create:vi.fn().mockResolvedValue({id:'receipt-a'})},
    auditEvent:{createMany:vi.fn().mockResolvedValue({count:3})},
  };
  for(const row of queryResults)tx.$queryRaw.mockResolvedValueOnce(row);
  const prisma={
    gate:{findFirst:vi.fn().mockResolvedValue({id:'gate-a'})},
    gateMutationReceipt:{findUnique:vi.fn().mockResolvedValue(null)},
    workforceAssignment:{findFirst:vi.fn().mockResolvedValue(preflight)},
    accessRequest:{findFirst:vi.fn().mockResolvedValue(null)},
    $transaction:vi.fn(async (fn:(client:typeof tx)=>Promise<unknown>)=>fn(tx)),
  };
  const service=new WorkforceService(prisma as unknown as PrismaService,{} as AccessService);
  return {service,tx,prisma,request};
}
const successRows=()=>[
  [{id:'gate-a'}],
  [{id:'assignment-a',workerId:'worker-a',startDate:null,endDate:null,schedule:{}}],
  [{id:'worker-a'}],
];

describe('V5.2.29 serializable workforce gate final authorization',()=>{
  it('refuses a gate revoked after preflight before access or evidence mutations',async()=>{
    const {service,tx}=setup([[]]);
    await expect(service.gateCheckIn('society-a','gate-a','assignment-a','guard-a','key-gate-1'))
      .rejects.toThrow('Gate does not belong to authenticated society or is inactive');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.accessRequest.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.createMany).not.toHaveBeenCalled();
  });
  it('refuses a deactivated or cross-society assignment after preflight',async()=>{
    const {service,tx}=setup([[{id:'gate-a'}],[]]);
    await expect(service.gateCheckIn('society-a','gate-a','assignment-a','guard-a','key-assign-1'))
      .rejects.toThrow('Approved workforce assignment not found');
    const sql=(tx.$queryRaw.mock.calls[1][0] as {strings:readonly string[]}).strings.join(' ');
    expect(sql).toContain('FOR UPDATE OF wa');
    expect(sql).toContain('wa."societyId"');
    expect(tx.accessRequest.create).not.toHaveBeenCalled();
  });
  it('refuses verification revoked after preflight under worker lock',async()=>{
    const {service,tx}=setup([[{id:'gate-a'}],...successRows().slice(1,2),[]]);
    await expect(service.gateCheckIn('society-a','gate-a','assignment-a','guard-a','key-worker-1'))
      .rejects.toThrow('Domestic worker is not currently verified for gate entry');
    const sql=(tx.$queryRaw.mock.calls[2][0] as {strings:readonly string[]}).strings.join(' ');
    expect(sql).toContain('FOR SHARE');
    expect(sql).toContain('"societyId"');
    expect(tx.accessRequest.create).not.toHaveBeenCalled();
  });
  it('refuses check-in if occupants moved out after initial lookup',async()=>{
    const {service,tx}=setup(successRows(),[]);
    await expect(service.gateCheckIn('society-a','gate-a','assignment-a','guard-a','key-resident-1'))
      .rejects.toThrow('Destination household does not have an active resident');
    expect(tx.unitOccupancy.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({societyId:'society-a',unitId:'unit-a',active:true,gateNotificationEnabled:true}),
    }));
    expect(tx.accessRequest.create).not.toHaveBeenCalled();
  });
  it('uses current verified occupant for host and notifications, not stale preflight',async()=>{
    const {service,tx,prisma,request}=setup(successRows(),[{userId:'current-tenant'},{userId:'family-contact'}]);
    const result=await service.gateCheckIn('society-a','gate-a','assignment-a','guard-a','key-current-1');
    expect(result).toEqual({request,residentUserIds:['current-tenant','family-contact']});
    expect(tx.accessRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({requestedById:'current-tenant',societyId:'society-a',unitId:'unit-a'}),
    }));
    expect(tx.gateMutationReceipt.create).toHaveBeenCalledOnce();
    expect(tx.auditEvent.createMany).toHaveBeenCalledOnce();
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function),{isolationLevel:'Serializable'});
  });
  it('rejects an assignment schedule changed inside the serializable transaction',async()=>{
    const {service,tx}=setup([
      [{id:'gate-a'}],[{id:'assignment-a',workerId:'worker-a',startDate:null,endDate:null,
        schedule:{days:['SUNDAY']}}],
    ]);
    await expect(service.gateCheckIn('society-a','gate-a','assignment-a','guard-a','key-schedule-1',
      new Date('2026-10-12T08:00:00Z'))).rejects.toThrow('Worker is outside the approved schedule');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.accessRequest.create).not.toHaveBeenCalled();
  });
});
