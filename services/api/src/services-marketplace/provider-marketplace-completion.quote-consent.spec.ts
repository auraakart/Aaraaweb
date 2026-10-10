import { describe, expect, it, vi } from 'vitest';
import { ProviderMarketplaceCompletionService } from './provider-marketplace-completion.service';

const sqlText=(q:unknown)=>((q as {strings?:readonly string[]}).strings??[]).join('?');
const sqlValues=(q:unknown)=>(q as {values?:unknown[]}).values??[];
function setup(rows:unknown[][]=[]){
  const tx={$queryRaw:vi.fn(),$executeRaw:vi.fn().mockResolvedValue(1)};
  for(const result of rows)tx.$queryRaw.mockResolvedValueOnce(result);
  const prisma={$transaction:vi.fn(async(cb:(client:typeof tx)=>Promise<unknown>)=>cb(tx)),$queryRaw:vi.fn()};
  const operators={resolveProvider:vi.fn().mockResolvedValue({providerId:'provider-1'})};
  return {service:new ProviderMarketplaceCompletionService(prisma as never,operators as never,{} as never),
    tx,prisma,operators};
}
describe('V4.90.18.2 quote consent boundaries',()=>{
  it.each([0,-1,1.5,Number.NaN,Infinity,100000001,Number.MAX_SAFE_INTEGER+1])(
    'rejects invalid quote paise %s',async amount=>{
      const {service,prisma}=setup();
      await expect(service.proposeExtraWorkQuote('provider-user','booking-1','Replace damaged valve',amount,'retry-key-123'))
        .rejects.toThrow('positive safe whole');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  it('recovers original approved quote after lost provider response',async()=>{
    const pending={id:'quote-1',scopeDescription:'Replace damaged valve',amountPaise:'12500',status:'APPROVED'};
    const {service,tx}=setup([[{id:'booking-1',status:'IN_PROGRESS'}],[pending]]);
    expect(await service.proposeExtraWorkQuote('provider-user','booking-1',' Replace damaged valve ',12500,'retry-key-123')).toBe(pending);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(sqlText(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
  });
  it('rejects quote creation on a completed booking before writing',async()=>{
    const {service,tx}=setup([[{id:'booking-1',status:'COMPLETED'}],[]]);
    await expect(service.proposeExtraWorkQuote('provider-user','booking-1','Replace damaged valve',12500,'retry-key-123'))
      .rejects.toThrow('service already in progress');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it('records explicit approval as an event without any payment or booking price update',async()=>{
    const approved={id:'quote-1',status:'APPROVED',amountPaise:'12500'};
    const {service,tx}=setup([
      [{id:'booking-1',status:'IN_PROGRESS'}],
      [{id:'quote-1',status:'PENDING',amountPaise:'12500'}],
      [approved],
    ]);
    expect(await service.respondToExtraWorkQuote('resident-1','booking-1','quote-1','APPROVE'))
      .toMatchObject(approved);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(sqlValues(tx.$executeRaw.mock.calls[0][0])).toContain('CUSTOMER_APPROVED_EXTRA_WORK_QUOTE');
    const sql=[...tx.$queryRaw.mock.calls,...tx.$executeRaw.mock.calls]
      .map(x=>sqlText(x[0])).join('\n');
    expect(sql).not.toContain('UPDATE "ConsumerServiceBooking" SET');
    expect(sql).not.toContain('INSERT INTO "Payment"');
  });
  it('refuses approving for a booking not owned by the resident',async()=>{
    const {service,tx}=setup([[]]);
    await expect(service.respondToExtraWorkQuote('another-resident','booking-1','quote-1','APPROVE'))
      .rejects.toThrow('Booking not found');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('refuses approving after service completion',async()=>{
    const {service,tx}=setup([[{id:'booking-1',status:'COMPLETED'}]]);
    await expect(service.respondToExtraWorkQuote('resident-1','booking-1','quote-1','APPROVE'))
      .rejects.toThrow('no longer in progress');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('requires an explicit decline reason before transaction',async()=>{
    const {service,prisma}=setup();
    await expect(service.respondToExtraWorkQuote('resident-1','booking-1','quote-1','DECLINE',' '))
      .rejects.toThrow('requires a reason');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('does not disclose quotes to another resident',async()=>{
    const {service,prisma}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.listConsumerExtraWorkQuotes('other-resident','booking-1'))
      .rejects.toThrow('Booking not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('quote idempotency key binding',()=>{
  it('refuses reusing a retry key for different money',async()=>{
    const tx={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{id:'booking-1',status:'COMPLETED'}])
      .mockResolvedValueOnce([{id:'quote-1',scopeDescription:'Replace damaged valve',amountPaise:'12500'}])};
    const prisma={$transaction:vi.fn(async(cb:(client:typeof tx)=>Promise<unknown>)=>cb(tx))};
    const operators={resolveProvider:vi.fn().mockResolvedValue({providerId:'provider-1'})};
    const svc=new ProviderMarketplaceCompletionService(prisma as never,operators as never,{} as never);
    await expect(svc.proposeExtraWorkQuote('provider-user','booking-1','Replace damaged valve',12501,'retry-key-123'))
      .rejects.toThrow('bound to different scope or amount');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
});


describe('V4.90.18.4 provider quote withdrawal',()=>{
  it('rejects empty reasons before touching provider identity or database',async()=>{
    const {service,prisma,operators}=setup();
    await expect(service.withdrawExtraWorkQuote('provider-user','booking-1','quote-1',' '))
      .rejects.toThrow('Quote withdrawal reason must be between 3 and 500 characters');
    expect(operators.resolveProvider).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('withdraws one pending quote and appends the original-booking audit event',async()=>{
    const {service,tx}=setup([
      [{id:'booking-1',status:'IN_PROGRESS'}],
      [{id:'quote-1',status:'PENDING',responseReason:null}],
      [{id:'quote-1',status:'WITHDRAWN',responseReason:'Wrong replacement part'}],
    ]);
    await expect(service.withdrawExtraWorkQuote('provider-user','booking-1','quote-1','  Wrong replacement part  '))
      .resolves.toMatchObject({status:'WITHDRAWN',responseReason:'Wrong replacement part'});
    const queries=tx.$queryRaw.mock.calls.map(x=>sqlText(x[0]));
    expect(queries[0]).toContain('FOR UPDATE');
    expect(queries[1]).toContain('FOR UPDATE');
    expect(queries[2]).toContain('"status"=\'PENDING\'');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(sqlText(tx.$executeRaw.mock.calls[0][0])).toContain('PROVIDER_WITHDREW_EXTRA_WORK_QUOTE');
    const all=[...tx.$queryRaw.mock.calls,...tx.$executeRaw.mock.calls].map(x=>sqlText(x[0])).join('\n');
    expect(all).not.toContain('INSERT INTO "Payment"');
    expect(all).not.toContain('SET "servicePricePaise"');
  });
  it('idempotently returns a matching prior withdrawal without writing another event',async()=>{
    const {service,tx}=setup([
      [{id:'booking-1',status:'COMPLETED'}],
      [{id:'quote-1',status:'WITHDRAWN',responseReason:'Wrong replacement part'}],
    ]);
    await expect(service.withdrawExtraWorkQuote('provider-user','booking-1','quote-1','Wrong replacement part'))
      .resolves.toMatchObject({status:'WITHDRAWN'});
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('rejects withdrawn quote retry with a different reason',async()=>{
    const {service,tx}=setup([
      [{id:'booking-1',status:'IN_PROGRESS'}],
      [{id:'quote-1',status:'WITHDRAWN',responseReason:'Wrong replacement part'}],
    ]);
    await expect(service.withdrawExtraWorkQuote('provider-user','booking-1','quote-1','Different amount'))
      .rejects.toThrow('Withdrawal retry must retain');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it.each(['APPROVED','DECLINED'])('refuses withdrawing %s resident decision',async status=>{
    const {service,tx}=setup([
      [{id:'booking-1',status:'IN_PROGRESS'}],
      [{id:'quote-1',status,responseReason:null}],
    ]);
    await expect(service.withdrawExtraWorkQuote('provider-user','booking-1','quote-1','Wrong price'))
      .rejects.toThrow('Resident-decided');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('fails closed for another provider before revealing a quote',async()=>{
    const {service,tx}=setup([[]]);
    await expect(service.withdrawExtraWorkQuote('wrong-user','booking-1','quote-1','Wrong price'))
      .rejects.toThrow('Provider booking not found');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
