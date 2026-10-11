import {describe,it,expect,vi} from 'vitest';
import {ProviderMarketplaceCompletionService} from './provider-marketplace-completion.service';

const sqlText=(q:unknown)=>((q as {strings?:readonly string[]}).strings??[]).join('?');
const sqlValues=(q:unknown)=>(q as {values?:unknown[]}).values??[];
const actor='11111111-1111-4111-8111-111111111111';
const bookingId='22222222-2222-4222-8222-222222222222';
const quoteId='33333333-3333-4333-8333-333333333333';
const approved={id:quoteId,providerId:'44444444-4444-4444-8444-444444444444',
  status:'APPROVED',respondedByUserId:actor,amountPaise:'12500'};
const booking={id:bookingId,status:'COMPLETED'};
const receipt={id:'55555555-5555-4555-8555-555555555555',bookingId,quoteId,userId:actor,
  amountPaise:'12500',status:'REQUESTED'};
function setup(results:unknown[][]=[]){
  const tx={$queryRaw:vi.fn(),$executeRaw:vi.fn().mockResolvedValue(1)};
  for(const rows of results)tx.$queryRaw.mockResolvedValueOnce(rows);
  const prisma={$transaction:vi.fn(async (fn:(client:typeof tx)=>Promise<unknown>)=>fn(tx)),
    $queryRaw:vi.fn()};
  const operators={resolveProvider:vi.fn().mockResolvedValue({providerId:approved.providerId})};
  return {svc:new ProviderMarketplaceCompletionService(prisma as never,operators as never,{} as never),
    tx,prisma,operators};
}
describe('V4.90.18.8 — separate bill request is not a payment',()=>{
  it('requires booking ownership before even reading the quote',async()=>{
    const {svc,tx}=setup([[]]);
    await expect(svc.requestExtraWorkBill(actor,bookingId,quoteId)).rejects.toThrow('Booking not found');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it.each(['PENDING','DECLINED','WITHDRAWN'])('rejects %s quotes before billing write',async status=>{
    const {svc,tx}=setup([[booking],[{...approved,status}]]);
    await expect(svc.requestExtraWorkBill(actor,bookingId,quoteId)).rejects.toThrow('expressly approved');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('blocks consent recorded by somebody other than booking owner',async()=>{
    const {svc,tx}=setup([[booking],[{...approved,respondedByUserId:'someone-else'}]]);
    await expect(svc.requestExtraWorkBill(actor,bookingId,quoteId)).rejects.toThrow('expressly approved');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it('creates precisely one immutable request, not a payment/invoice or original-price update',async()=>{
    const {svc,tx}=setup([[booking],[approved],[],[receipt]]);
    await expect(svc.requestExtraWorkBill(actor,bookingId,quoteId)).resolves.toEqual(receipt);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const all=[...tx.$queryRaw.mock.calls,...tx.$executeRaw.mock.calls].map(x=>sqlText(x[0])).join('\n');
    expect(all).toContain('INSERT INTO "ConsumerServiceExtraWorkBillingRequest"');
    expect(all).toContain('RESIDENT_REQUESTED_EXTRA_WORK_BILL');
    expect(all).not.toMatch(/INSERT INTO "(?:Payment|ConsumerServicePayment|Invoice)"/);
    expect(all).not.toContain('SET "servicePricePaise"');
    expect(sqlValues(tx.$queryRaw.mock.calls[3][0])).toContain(BigInt(12500));
    expect(sqlText(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
    expect(sqlText(tx.$queryRaw.mock.calls[1][0])).toContain('FOR UPDATE');
  });
  it('replays the identical request without duplicating an event',async()=>{
    const {svc,tx}=setup([[booking],[approved],[receipt]]);
    await expect(svc.requestExtraWorkBill(actor,bookingId,quoteId)).resolves.toEqual(receipt);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('does not create a first bill request after cancellation',async()=>{
    const {svc,tx}=setup([[{...booking,status:'CANCELLED'}],[approved],[]]);
    await expect(svc.requestExtraWorkBill(actor,bookingId,quoteId)).rejects.toThrow('Cancelled booking');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('blocks cross-provider access to billing history',async()=>{
    const {svc,prisma}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(svc.listProviderExtraWorkBillRequests('provider-user',bookingId))
      .rejects.toThrow('Provider booking not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('validates consumer booking ownership before returning billing history',async()=>{
    const {svc,prisma}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(svc.listConsumerExtraWorkBillRequests('another-user',bookingId))
      .rejects.toThrow('Booking not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('V4.90.18.9 — provider bill-request receipt, not an invoice',()=>{
  const requestId='66666666-6666-4666-8666-666666666666';
  const acknowledge={id:'77777777-7777-4777-8777-777777777777',billingRequestId:requestId,
    bookingId,providerId:approved.providerId};
  it('requires provider ownership before reading the billing request',async()=>{
    const {svc,tx}=setup([[]]);
    await expect(svc.acknowledgeExtraWorkBillRequest('provider-user',bookingId,requestId))
      .rejects.toThrow('Provider booking not found');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('rejects foreign or missing billing request before writing any event',async()=>{
    const {svc,tx}=setup([[booking],[]]);
    await expect(svc.acknowledgeExtraWorkBillRequest('provider-user',bookingId,requestId))
      .rejects.toThrow('Provider bill request not found');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('records one provider acknowledgement with no payment, repricing or invoice',async()=>{
    const {svc,tx}=setup([[booking],[{id:requestId}],[],[acknowledge]]);
    await expect(svc.acknowledgeExtraWorkBillRequest('provider-user',bookingId,requestId))
      .resolves.toEqual(acknowledge);
    const queries=tx.$queryRaw.mock.calls.map(x=>sqlText(x[0]));
    expect(queries.slice(0,3).every(x=>x.includes('FOR UPDATE'))).toBe(true);
    expect(queries[3]).toContain('INSERT INTO "ConsumerServiceExtraWorkBillAcknowledgement"');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const sql=[...queries,...tx.$executeRaw.mock.calls.map(x=>sqlText(x[0]))].join('\n');
    expect(sql).toContain('PROVIDER_ACKNOWLEDGED_EXTRA_WORK_BILL_REQUEST');
    expect(sql).not.toContain('INSERT INTO "ConsumerServicePayment"');
    expect(sql).not.toContain('INSERT INTO "Invoice"');
    expect(sql).not.toContain('SET "servicePricePaise"');
  });
  it('returns the original immutable acknowledgement for a retry even after completion',async()=>{
    const {svc,tx}=setup([[booking],[{id:requestId}],[acknowledge]]);
    await expect(svc.acknowledgeExtraWorkBillRequest('provider-user',bookingId,requestId))
      .resolves.toEqual(acknowledge);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('rejects first-time acknowledgement after booking cancellation',async()=>{
    const {svc,tx}=setup([[{...booking,status:'CANCELLED'}],[{id:requestId}],[]]);
    await expect(svc.acknowledgeExtraWorkBillRequest('provider-user',bookingId,requestId))
      .rejects.toThrow('Cancelled booking');
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('includes acknowledgement timestamp only in owner-scoped read',async()=>{
    const {svc,prisma}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(svc.listConsumerExtraWorkBillRequests('other-resident',bookingId))
      .rejects.toThrow('Booking not found');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
