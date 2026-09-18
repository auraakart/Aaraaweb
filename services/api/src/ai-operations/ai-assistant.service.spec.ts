import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { AiAssistantService } from './ai-assistant.service';

function setup(){
  const prisma={$queryRaw:vi.fn()};
  const operations={operationsSummary:vi.fn(),proposeHelpdesk:vi.fn()};
  return {
    prisma,operations,
    service:new AiAssistantService(
      prisma as unknown as ConstructorParameters<typeof AiAssistantService>[0],
      operations as unknown as ConstructorParameters<typeof AiAssistantService>[1],
    ),
  };
}

describe('V4.6 grounded AI assistant',()=>{
  it('uses authoritative finance rows and applies an amount threshold',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{count:2,amountPaise:1500000,over30:1}])
      .mockResolvedValueOnce([{currentPaise:900000,previousPaise:600000}]);
    const result=await service.query('society-1','user-1',[AppRole.ACCOUNTANT],'Show overdue maintenance above ₹5,000');
    expect(result).toEqual(expect.objectContaining({
      intent:'SOCIETY_FINANCE',grounded:true,mutationPerformed:false,
      facts:expect.objectContaining({minimumOverduePaise:500000,overdueCount:2,collectionChangePercent:50}),
    }));
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('does not widen finance visibility through the combined resident status tool',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{allowed:true}])
      .mockResolvedValueOnce([]);
    const result=await service.query(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      [AppRole.FAMILY_MEMBER],
      'Show my complaint status',
      '33333333-3333-4333-8333-333333333333',
    );
    expect(result.intent).toBe('RESIDENT_STATUS');
    expect((result.facts as {invoices:unknown[]}).invoices).toEqual([]);
    expect(result.sources).not.toContain('MaintenanceInvoice');
    const sqlCalls=prisma.$queryRaw.mock.calls.map((call)=>{
      const sql=call[0] as {strings?:readonly string[]};
      return (sql.strings??[]).join('?');
    });
    expect(sqlCalls.some((sql)=>sql.includes('FROM "MaintenanceInvoice"'))).toBe(false);
    expect(sqlCalls.some((sql)=>sql.includes('FROM "Payment"'))).toBe(false);
  });

  it('fails closed when the requested tool is outside the caller permissions',async()=>{
    const {prisma,service}=setup();
    await expect(service.query('society-1','user-1',[AppRole.OWNER],'Summarize security incidents')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('does not hallucinate an unsupported answer',async()=>{
    const {prisma,service}=setup();
    const result=await service.query('society-1','user-1',[AppRole.OWNER],'Predict next year property prices');
    expect(result.intent).toBe('UNSUPPORTED');
    expect(result.grounded).toBe(true);
    expect(result.mutationPerformed).toBe(false);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('requires selected-property authorization before natural-language complaint proposal creation',async()=>{
    const {prisma,operations,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([{allowed:true}]);
    operations.proposeHelpdesk.mockResolvedValue({id:'proposal-1',requiresConfirmation:true});
    await expect(service.proposeHelpdeskFromText('society-1','user-1','11111111-1111-4111-8111-111111111111','Water is leaking near the kitchen sink.')).resolves.toEqual(expect.objectContaining({requiresConfirmation:true}));
    expect(operations.proposeHelpdesk).toHaveBeenCalledWith('society-1','user-1',expect.objectContaining({
      unitId:'11111111-1111-4111-8111-111111111111',
      description:'Water is leaking near the kitchen sink.',
    }));
  });

  it('builds only permission-authorized action cards and performs no mutations',async()=>{
    const {prisma,operations,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([{count:3,amountPaise:750000,over30:2}])
      .mockResolvedValueOnce([{currentPaise:1000000,previousPaise:800000}]);
    const result=await service.actionCentre('society-1',[AppRole.ACCOUNTANT]);
    expect(result).toEqual(expect.objectContaining({grounded:true,mutationPerformed:false}));
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toMatchObject({id:'finance-overdue',domain:'FINANCE',severity:'HIGH'});
    expect(operations.operationsSummary).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('returns no privileged action cards to a resident-only role',async()=>{
    const {prisma,operations,service}=setup();
    const result=await service.actionCentre('society-1',[AppRole.OWNER]);
    expect(result.cards).toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(operations.operationsSummary).not.toHaveBeenCalled();
  });

  it('returns notice copy for human approval without mutation',()=>{
    const {service}=setup();
    expect(service.noticeDraft('Water shutdown from 10 AM to 1 PM','en-IN','Tower A')).toEqual(expect.objectContaining({
      humanApprovalRequired:true,mutationPerformed:false,language:'en-IN',
    }));
  });

  it('keeps AI audit history tenant scoped and excludes proposal payloads',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([{id:'p-1',action:'CREATE_HELPDESK_TICKET',status:'EXECUTED'}]);
    const result=await service.audit('11111111-1111-4111-8111-111111111111');
    expect(result.items).toHaveLength(1);
    const call=prisma.$queryRaw.mock.calls[0]?.[0] as {strings?:readonly string[]};
    const sql=(call.strings??[]).join('?');
    expect(sql).toContain('"societyId"=?::uuid');
    expect(sql).not.toContain('"payload"');
  });
});
