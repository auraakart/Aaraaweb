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
  const amenities={createBooking:vi.fn()};
  const visitors={createPass:vi.fn()};
  return {
    prisma,helpdesk,amenities,visitors,
    service:new AiOperationsService(
      prisma as unknown as ConstructorParameters<typeof AiOperationsService>[0],
      helpdesk as unknown as ConstructorParameters<typeof AiOperationsService>[1],
      amenities as unknown as ConstructorParameters<typeof AiOperationsService>[2],
      visitors as unknown as ConstructorParameters<typeof AiOperationsService>[3],
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
  });

  it('surfaces breached and unassigned helpdesk work for the active society',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([
      {id:'t-1',title:'Lift issue',priority:'URGENT',status:'OPEN',slaState:'RESOLUTION_BREACHED',assignedToId:null,escalationLevel:1},
      {id:'t-2',title:'Light issue',priority:'NORMAL',status:'IN_PROGRESS',slaState:'ON_TRACK',assignedToId:'u-2',escalationLevel:0},
    ]);
    await expect(service.operationsSummary('society-1')).resolves.toEqual(expect.objectContaining({
      openCount:2,breachedCount:1,unassignedCount:1,byPriority:{URGENT:1,NORMAL:1},
    }));
  });

  it('summarizes overdue society accounts without mutating finance data',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([
      {id:'i-1',invoiceNumber:'INV-1',amountPaise:150000,dueDate:new Date('2026-07-01'),unitNumber:'A-101',buildingName:'A',daysOverdue:78},
      {id:'i-2',invoiceNumber:'INV-2',amountPaise:50000,dueDate:new Date('2026-09-01'),unitNumber:'B-202',buildingName:'B',daysOverdue:16},
    ]);
    await expect(service.overdueFinanceSummary('society-1')).resolves.toEqual(expect.objectContaining({
      overdueCount:2,overduePaise:200000,severeCount:1,
    }));
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('claims before executing through HelpdeskService and records the result',async()=>{
    const {prisma,helpdesk,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([{
      id:'proposal-1',action:'CREATE_HELPDESK_TICKET',status:'EXECUTING',
      payload:{unitId:'unit-1',title:'Water leak',description:'Leak near kitchen sink',priority:'NORMAL'},result:null,
    }]);
    helpdesk.createMine.mockResolvedValue({id:'ticket-1'});
    await expect(service.confirm('society-1','user-1','proposal-1')).resolves.toEqual({
      proposalId:'proposal-1',status:'EXECUTED',result:{ticketId:'ticket-1'},
    });
    expect(helpdesk.createMine).toHaveBeenCalledWith('society-1','user-1',expect.objectContaining({unitId:'unit-1'}));
  });

  it('executes a confirmed amenity proposal through AmenitiesService',async()=>{
    const {prisma,amenities,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([{
      id:'proposal-2',action:'BOOK_AMENITY',status:'EXECUTING',
      payload:{amenityId:'amenity-1',unitId:'unit-1',startsAt:'2026-09-20T10:00:00.000Z',endsAt:'2026-09-20T11:00:00.000Z'},result:null,
    }]);
    amenities.createBooking.mockResolvedValue({id:'booking-1'});
    await expect(service.confirmAmenity('society-1','user-1','proposal-2')).resolves.toEqual({
      proposalId:'proposal-2',status:'EXECUTED',result:{bookingId:'booking-1'},
    });
    expect(amenities.createBooking).toHaveBeenCalledWith('society-1','user-1','amenity-1',expect.objectContaining({unitId:'unit-1'}));
  });

  it('executes a confirmed visitor pass proposal through VisitorService',async()=>{
    const {prisma,visitors,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([{
      id:'proposal-3',action:'CREATE_VISITOR_PASS',status:'EXECUTING',
      payload:{unitId:'unit-1',name:'Guest',phone:'9999999999',validFrom:'2026-09-20T10:00:00.000Z',validUntil:'2026-09-20T12:00:00.000Z'},result:null,
    }]);
    visitors.createPass.mockResolvedValue({id:'pass-1'});
    await expect(service.confirmVisitor('society-1','user-1','proposal-3')).resolves.toEqual({
      proposalId:'proposal-3',status:'EXECUTED',result:{visitorPassId:'pass-1'},
    });
    expect(visitors.createPass).toHaveBeenCalledWith(
      'society-1','user-1','unit-1','Guest','9999999999',expect.any(Date),expect.any(Date),
    );
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

  it('rejects confirmation through the wrong action-specific endpoint',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{id:'proposal-2',action:'BOOK_AMENITY',status:'PROPOSED',payload:{},result:null}]);
    await expect(service.confirm('society-1','user-1','proposal-2')).rejects.toBeInstanceOf(BadRequestException);
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
