import { describe, expect, it, vi } from 'vitest';
import { GuardOperationsService } from './guard-operations.service';

function sqlText(call: unknown) {
  const sql = call as { strings?: readonly string[]; values?: readonly unknown[] };
  return { text: sql.strings?.join(' ') ?? '', values: sql.values ?? [] };
}

const society='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
const request='33333333-3333-4333-8333-333333333333';
const incident='44444444-4444-4444-8444-444444444444';
const overstay={id:request,subjectName:'Visitor A',enteredAt:new Date('2026-09-23T08:00:00Z'),unitNumber:'A-101',buildingName:'Tower A'};

describe('GuardOperationsService overstay escalation idempotency', () => {
  it('keeps an OPEN or REVIEWED canonical incident idempotent without another write', async () => {
    const tx={$queryRaw:vi.fn()
      .mockResolvedValueOnce([overstay])
      .mockResolvedValueOnce([{id:incident,status:'REVIEWED',severity:'HIGH',title:'Visitor overstay · Visitor A',occurredAt:new Date()}])};
    const prisma={$transaction:vi.fn(async (work:(client:typeof tx)=>Promise<unknown>)=>work(tx))};
    const service=new GuardOperationsService(prisma as never);

    await expect(service.escalateOverstay(society,actor,request)).resolves.toEqual(expect.objectContaining({id:incident,idempotent:true,reopened:false}));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(sqlText(tx.$queryRaw.mock.calls[0][0]).text).toContain('FOR UPDATE OF r');
    expect(sqlText(tx.$queryRaw.mock.calls[1][0]).text).toContain('CASE "status"');
  });

  it('reopens the same canonical incident when the visitor is still overstaying after closure', async () => {
    const tx={$queryRaw:vi.fn()
      .mockResolvedValueOnce([overstay])
      .mockResolvedValueOnce([{id:incident,status:'CLOSED',severity:'HIGH',title:'Visitor overstay · Visitor A',occurredAt:new Date()}])
      .mockResolvedValueOnce([{id:incident,status:'OPEN',severity:'HIGH',category:'OVERSTAY',title:'Visitor overstay · Visitor A',occurredAt:new Date()}])};
    const prisma={$transaction:vi.fn(async (work:(client:typeof tx)=>Promise<unknown>)=>work(tx))};
    const service=new GuardOperationsService(prisma as never);

    await expect(service.escalateOverstay(society,actor,request,'Still on premises')).resolves.toEqual(expect.objectContaining({id:incident,status:'OPEN',idempotent:false,reopened:true}));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    const reopen=sqlText(tx.$queryRaw.mock.calls[2][0]);
    expect(reopen.text).toContain('UPDATE "SecurityIncident"');
    expect(reopen.text).toContain('"reviewedByUserId"=NULL');
    expect(reopen.text).toContain('"resolution"=NULL');
    expect(reopen.values).toContain(incident);
    expect(reopen.values.some(value=>String(value).includes('Still on premises'))).toBe(true);
  });

  it('writes the durable access-request source key when creating the first incident', async () => {
    const tx={$queryRaw:vi.fn()
      .mockResolvedValueOnce([overstay])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:'55555555-5555-4555-8555-555555555555',severity:'HIGH',category:'OVERSTAY',title:'Visitor overstay · Visitor A',status:'OPEN',occurredAt:new Date()}])};
    const prisma={$transaction:vi.fn(async (work:(client:typeof tx)=>Promise<unknown>)=>work(tx))};
    const service=new GuardOperationsService(prisma as never);

    await expect(service.escalateOverstay(society,actor,request,'Desk verified')).resolves.toEqual(expect.objectContaining({id:'55555555-5555-4555-8555-555555555555',idempotent:false}));
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    const insert=sqlText(tx.$queryRaw.mock.calls[2][0]);
    expect(insert.text).toContain('"mediaRefs","sourceKey"');
    expect(insert.values).toContain(`access-request:${request}`);
  });
});
