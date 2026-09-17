import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AiOperationsService } from './ai-operations.service';

function setup(){
  const prisma={
    $queryRaw:vi.fn(),
    $executeRaw:vi.fn().mockResolvedValue(1),
  };
  const helpdesk={
    listMine:vi.fn(),
    createMine:vi.fn(),
  };
  return {
    prisma,
    helpdesk,
    service:new AiOperationsService(
      prisma as unknown as ConstructorParameters<typeof AiOperationsService>[0],
      helpdesk as unknown as ConstructorParameters<typeof AiOperationsService>[1],
    ),
  };
}

describe('AiOperationsService',()=>{
  it('summarizes only the authenticated resident helpdesk view',async()=>{
    const {helpdesk,service}=setup();
    helpdesk.listMine.mockResolvedValue([{status:'OPEN'},{status:'OPEN'},{status:'RESOLVED'}]);
    await expect(service.summary('society-1','user-1')).resolves.toEqual({helpdesk:{total:3,byStatus:{OPEN:2,RESOLVED:1}}});
    expect(helpdesk.listMine).toHaveBeenCalledWith('society-1','user-1');
  });

  it('aggregates only returned owner-scoped invoices and payment evidence',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {id:'i-1',invoiceNumber:'INV-1',amountPaise:120000,dueDate:new Date('2026-09-01'),status:'ISSUED',unitNumber:'A-101',buildingName:'A'},
        {id:'i-2',invoiceNumber:'INV-2',amountPaise:80000,dueDate:new Date('2026-08-01'),status:'PAID',unitNumber:'A-101',buildingName:'A'},
      ])
      .mockResolvedValueOnce([
        {id:'p-1',invoiceId:'i-2',invoiceNumber:'INV-2',amountPaise:80000,status:'CAPTURED',createdAt:new Date('2026-08-02'),completedAt:new Date('2026-08-02')},
      ]);

    await expect(service.financeSummary('society-1','user-1')).resolves.toEqual(expect.objectContaining({
      outstandingPaise:120000,
      invoiceCount:2,
      openInvoices:[expect.objectContaining({id:'i-1'})],
      recentPayments:[expect.objectContaining({id:'p-1'})],
      latestReceiptCandidate:expect.objectContaining({id:'p-1'}),
    }));
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('claims before executing through HelpdeskService and records the result',async()=>{
    const {prisma,helpdesk,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([{
      id:'proposal-1',action:'CREATE_HELPDESK_TICKET',status:'EXECUTING',
      payload:{unitId:'unit-1',title:'Water leak',description:'Leak near kitchen sink',priority:'NORMAL'},
      result:null,
    }]);
    helpdesk.createMine.mockResolvedValue({id:'ticket-1'});

    await expect(service.confirm('society-1','user-1','proposal-1')).resolves.toEqual({
      proposalId:'proposal-1',status:'EXECUTED',result:{ticketId:'ticket-1'},
    });
    expect(helpdesk.createMine).toHaveBeenCalledWith('society-1','user-1',expect.objectContaining({unitId:'unit-1'}));
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('returns an already executed proposal idempotently without executing the domain action twice',async()=>{
    const {prisma,helpdesk,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:'proposal-1',action:'CREATE_HELPDESK_TICKET',status:'EXECUTED',payload:{},result:{ticketId:'ticket-1'}}]);

    await expect(service.confirm('society-1','user-1','proposal-1')).resolves.toEqual({
      proposalId:'proposal-1',status:'EXECUTED',result:{ticketId:'ticket-1'},idempotent:true,
    });
    expect(helpdesk.createMine).not.toHaveBeenCalled();
  });

  it('marks a claimed proposal failed when the normal domain service rejects it',async()=>{
    const {prisma,helpdesk,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([{
      id:'proposal-1',action:'CREATE_HELPDESK_TICKET',status:'EXECUTING',
      payload:{unitId:'unit-1',title:'Water leak',description:'Leak near kitchen sink'},result:null,
    }]);
    helpdesk.createMine.mockRejectedValue(new BadRequestException('invalid unit'));

    await expect(service.confirm('society-1','user-1','proposal-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
