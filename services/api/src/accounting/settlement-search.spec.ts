import { describe, expect, it, vi } from 'vitest';
import { SettlementService } from './settlement.service';

describe('V5.7 finance payment lookup',()=>{
 it('binds literal search terms and constrains all matches to the current society',async()=>{
  const prisma={$queryRaw:vi.fn().mockResolvedValue([])};
  await new SettlementService(prisma as never).searchPayments('society-1','AGR-1234%_');
  const query=prisma.$queryRaw.mock.calls[0][0] as {sql:string;values:unknown[]};
  expect(query.sql).toContain('p."societyId"=');
  expect(query.sql).toContain('LIMIT 30');
  for(const field of ['providerPaymentId','providerOrderId','invoiceNumber','payerName','unitNumber','receiptNumber'])expect(query.sql).toContain(field);
  expect(query.sql).not.toContain('AGR-1234');expect(query.values).toContain('%AGR-1234\\%\\_%');
  expect(query.sql).toContain("p.\"status\" IN ('CAPTURED','REFUNDED')");
 });
 it('does not issue a broad empty search',()=>{
  const prisma={$queryRaw:vi.fn()},service=new SettlementService(prisma as never);
  for(const value of ['','a','x'.repeat(121)])expect(()=>service.searchPayments('society',value)).toThrow();
  expect(prisma.$queryRaw).not.toHaveBeenCalled();
 });
});
