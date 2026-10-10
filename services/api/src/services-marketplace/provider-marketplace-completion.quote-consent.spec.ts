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
      await expect(service.proposeExtraWorkQuote('provider-user','booking-1','Replace damaged valve',amount))
        .rejects.toThrow('positive safe whole');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  it('returns identical pending quote after a lost provider response',async()=>{
    const pending={id:'quote-1',scopeDescription:'Replace damaged valve',amountPaise:'12500',status:'PENDING'};
    const {service,tx}=setup([[{id:'booking-1',status:'IN_PROGRESS'}],[pending]]);
    expect(await service.proposeExtraWorkQuote('provider-user','booking-1',' Replace damaged valve ',12500)).toBe(pending);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(sqlText(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
  });
  it('rejects quote creation on a completed booking before writing',async()=>{
    const {service,tx}=setup([[{id:'booking-1',status:'COMPLETED'}]]);
    await expect(service.proposeExtraWorkQuote('provider-user','booking-1','Replace damaged valve',12500))
      .rejects.toThrow('service already in progress');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
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
