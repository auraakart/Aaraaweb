import { describe, expect, it, vi } from 'vitest';
import { ProviderMarketplaceCompletionService } from './provider-marketplace-completion.service';

const sql=(value:unknown)=>String((value as {strings?:string[]}).strings?.join(' ')??'');
const vars=(value:unknown)=>((value as {values?:unknown[]}).values??[]).flat(Infinity);
function service(prisma:object){
  return new ProviderMarketplaceCompletionService(prisma as never,
    {resolveProvider:vi.fn().mockResolvedValue({providerId:'provider-A'})} as never,{} as never);
}
describe('V4.90.18.7 scoped service dispute evidence',()=>{
  it('rejects foreign resident without exposing evidence',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([])};
    await expect(service(prisma).listDisputeEvidence('resident-A','dispute-B','RESIDENT','booking-A'))
      .rejects.toThrow('Service dispute not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(sql(prisma.$queryRaw.mock.calls[0][0])).toContain('"userId"');
  });
  it('requires provider ownership before reading thread',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([])};
    await expect(service(prisma).listDisputeEvidence('provider-actor','dispute-B','PROVIDER'))
      .rejects.toThrow('Service dispute not found');
    expect(vars(prisma.$queryRaw.mock.calls[0][0])).toContain('provider-A');
  });
  it('returns notes after authorized scope check only',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValueOnce([{id:'dispute-A'}])
      .mockResolvedValueOnce([{id:'note-A',note:'Repaired but still noisy',actorType:'RESIDENT'}])};
    const out=await service(prisma).listDisputeEvidence('resident-A','dispute-A','RESIDENT','booking-A');
    expect(out).toHaveLength(1);
    expect(sql(prisma.$queryRaw.mock.calls[1][0])).toContain('"disputeId"');
  });
  it('rejects short notes and unsafe retry keys before database writes',async()=>{
    const prisma={$transaction:vi.fn(),$queryRaw:vi.fn()};
    const svc=service(prisma);
    await expect(svc.addDisputeEvidence('u','d','RESIDENT','no','valid-key-123',undefined,'b'))
      .rejects.toThrow('5–2000');
    await expect(svc.addDisputeEvidence('u','d','RESIDENT','Repair still leaks','x',undefined,'b'))
      .rejects.toThrow('8–120');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('rejects outsider before insert under row lock',async()=>{
    const tx={$queryRaw:vi.fn().mockResolvedValue([])};
    const prisma={$transaction:vi.fn(async(cb:(tx:typeof tx)=>unknown)=>cb(tx))};
    await expect(service(prisma).addDisputeEvidence('u','d','RESIDENT','Repair still leaks','key-123456',undefined,'b'))
      .rejects.toThrow('Service dispute not found');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(sql(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
  });
  it('does not write to resolved disputes',async()=>{
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([{id:'d',status:'RESOLVED'}]).mockResolvedValueOnce([])};
    const prisma={$transaction:vi.fn(async(cb:(tx:typeof tx)=>unknown)=>cb(tx))};
    await expect(service(prisma).addDisputeEvidence('u','d','RESIDENT','Repair still leaks','key-123456',undefined,'b'))
      .rejects.toThrow('only while a dispute is open');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it('replays exact lost responses without creating duplicate evidence',async()=>{
    const prior={id:'e',note:'Repair still leaks',reference:null,actorType:'RESIDENT'};
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([{id:'d',status:'RESOLVED'}]).mockResolvedValueOnce([prior])};
    const prisma={$transaction:vi.fn(async(cb:(tx:typeof tx)=>unknown)=>cb(tx))};
    expect(await service(prisma).addDisputeEvidence('u','d','RESIDENT',prior.note,'key-123456',undefined,'b'))
      .toEqual(prior);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it('rejects altered evidence under the same retry identity',async()=>{
    const prior={id:'e',note:'Different original note',reference:null,actorType:'PROVIDER'};
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([{id:'d',status:'OPEN'}]).mockResolvedValueOnce([prior])};
    const prisma={$transaction:vi.fn(async(cb:(tx:typeof tx)=>unknown)=>cb(tx))};
    await expect(service(prisma).addDisputeEvidence('u','d','PROVIDER','Repair still leaks','key-123456'))
      .rejects.toThrow('bound to another note');
  });
  it('inserts exactly one new evidence record in an open dispute',async()=>{
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([{id:'d',status:'OPEN'}])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([{id:'e',note:'Repair still leaks'}])};
    const prisma={$transaction:vi.fn(async(cb:(tx:typeof tx)=>unknown)=>cb(tx))};
    expect(await service(prisma).addDisputeEvidence('u','d','RESIDENT','Repair still leaks','key-123456',undefined,'b'))
      .toMatchObject({id:'e'});
    expect(sql(tx.$queryRaw.mock.calls[2][0])).toContain('INSERT INTO "ConsumerServiceDisputeEvidence"');
  });
});
