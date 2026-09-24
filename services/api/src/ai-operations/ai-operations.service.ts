import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AmenitiesService } from '../amenities/amenities.service';
import { HelpdeskService } from '../helpdesk/helpdesk.service';
import { PrismaService } from '../prisma/prisma.service';
import { VisitorService } from '../visitors/visitor.service';
import { safeOperationalError } from '../observability/safe-operational-error';

type AiAction = 'CREATE_HELPDESK_TICKET'|'BOOK_AMENITY'|'CREATE_VISITOR_PASS'|'ASSIGN_HELPDESK_TICKET';
const ALLOWED_AI_ACTIONS: ReadonlySet<AiAction> = new Set(['CREATE_HELPDESK_TICKET','BOOK_AMENITY','CREATE_VISITOR_PASS','ASSIGN_HELPDESK_TICKET']);

type HelpdeskProposalInput = {
  unitId: string;
  title: string;
  description: string;
  category?: string;
  priority?: 'LOW'|'NORMAL'|'HIGH'|'URGENT';
};

type HelpdeskAssignmentProposalInput = { ticketId:string; assignedToId:string|null; expectedUpdatedAt:string; };

type AmenityProposalInput = {
  amenityId: string;
  unitId: string;
  startsAt: string;
  endsAt: string;
};

type VisitorPassProposalInput = {
  unitId: string;
  name: string;
  phone: string;
  validFrom: string;
  validUntil: string;
};

type ProposalRow = {
  id: string;
  action: AiAction;
  payload: unknown;
  status: 'PROPOSED'|'EXECUTING'|'EXECUTED'|'FAILED'|'CANCELLED';
  result?: unknown;
};

@Injectable()
export class AiOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly helpdesk: HelpdeskService,
    private readonly amenities: AmenitiesService,
    private readonly visitors: VisitorService,
  ) {}

  async summary(societyId:string,userId:string) {
    const tickets = await this.helpdesk.listMine(societyId,userId);
    const counts = tickets.reduce<Record<string,number>>((acc,ticket)=>{
      const status = String((ticket as {status?:unknown}).status ?? 'UNKNOWN');
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    },{});
    return { helpdesk: { total: tickets.length, byStatus: counts } };
  }

  async financeSummary(societyId:string,userId:string) {
    const invoices=await this.prisma.$queryRaw<Array<{
      id:string; invoiceNumber:string; amountPaise:number; dueDate:Date; status:string; unitNumber:string; buildingName:string;
    }>>(Prisma.sql`
      SELECT i."id",i."invoiceNumber",i."amountPaise",i."dueDate",i."status",
             u."number" AS "unitNumber",b."name" AS "buildingName"
      FROM "MaintenanceInvoice" i
      JOIN "Unit" u ON u."id"=i."unitId" AND u."societyId"=i."societyId"
      JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=i."societyId"
      WHERE i."societyId"=${societyId}::uuid
        AND EXISTS (
          SELECT 1 FROM "UnitOwnership" uo
          WHERE uo."unitId"=i."unitId" AND uo."societyId"=${societyId}::uuid
            AND uo."userId"=${userId}::uuid AND uo."verified"=TRUE AND uo."active"=TRUE
            AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
        )
      ORDER BY i."dueDate" DESC,i."createdAt" DESC
      LIMIT 100
    `);
    const payments=await this.prisma.$queryRaw<Array<{
      id:string; invoiceId:string; invoiceNumber:string; amountPaise:number; status:string; createdAt:Date; completedAt:Date|null;
    }>>(Prisma.sql`
      SELECT p."id",p."invoiceId",i."invoiceNumber",p."amountPaise",p."status",p."createdAt",p."completedAt"
      FROM "Payment" p
      JOIN "MaintenanceInvoice" i ON i."id"=p."invoiceId" AND i."societyId"=p."societyId"
      WHERE p."societyId"=${societyId}::uuid
        AND (p."payerUserId"=${userId}::uuid OR EXISTS (
          SELECT 1 FROM "UnitOwnership" uo
          WHERE uo."unitId"=i."unitId" AND uo."societyId"=${societyId}::uuid
            AND uo."userId"=${userId}::uuid AND uo."verified"=TRUE AND uo."active"=TRUE
            AND uo."effectiveFrom"<=CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo">CURRENT_TIMESTAMP)
        ))
      ORDER BY p."createdAt" DESC
      LIMIT 100
    `);
    const open=invoices.filter(invoice=>invoice.status==='ISSUED');
    return {
      outstandingPaise:open.reduce((sum,invoice)=>sum+Number(invoice.amountPaise),0),
      openInvoices:open,
      invoiceCount:invoices.length,
      recentPayments:payments,
      latestReceiptCandidate:payments.find(payment=>payment.status==='CAPTURED'||payment.status==='REFUNDED')??null,
    };
  }

  async operationsSummary(societyId:string) {
    const tickets=await this.prisma.$queryRaw<Array<{
      id:string; title:string; priority:string; status:string; slaState:string; firstResponseDueAt:Date|null; resolutionDueAt:Date|null;
      unitNumber:string; buildingName:string; assignedToId:string|null; escalationLevel:number;
    }>>(Prisma.sql`
      SELECT ht."id",ht."title",ht."priority",ht."status",ht."slaState",
             ht."firstResponseDueAt",ht."resolutionDueAt",ht."assignedToId",ht."escalationLevel",
             u."number" AS "unitNumber",b."name" AS "buildingName"
      FROM "HelpdeskTicket" ht
      JOIN "Unit" u ON u."id"=ht."unitId" AND u."societyId"=ht."societyId"
      JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=ht."societyId"
      WHERE ht."societyId"=${societyId}::uuid
        AND ht."status" NOT IN ('RESOLVED','CLOSED')
      ORDER BY CASE ht."priority" WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,
               ht."createdAt" ASC
      LIMIT 500
    `);
    const breached=tickets.filter(ticket=>ticket.slaState==='RESPONSE_BREACHED'||ticket.slaState==='RESOLUTION_BREACHED');
    const unassigned=tickets.filter(ticket=>!ticket.assignedToId);
    const byPriority=tickets.reduce<Record<string,number>>((acc,ticket)=>{
      acc[ticket.priority]=(acc[ticket.priority]??0)+1;
      return acc;
    },{});
    return {openCount:tickets.length,breachedCount:breached.length,unassignedCount:unassigned.length,byPriority,breaches:breached.slice(0,50),unassigned:unassigned.slice(0,50)};
  }

  async overdueFinanceSummary(societyId:string) {
    const overdue=await this.prisma.$queryRaw<Array<{
      id:string; invoiceNumber:string; amountPaise:number; dueDate:Date; unitNumber:string; buildingName:string; daysOverdue:number;
    }>>(Prisma.sql`
      SELECT i."id",i."invoiceNumber",i."amountPaise",i."dueDate",
             u."number" AS "unitNumber",b."name" AS "buildingName",
             GREATEST(0,(CURRENT_DATE-i."dueDate"))::int AS "daysOverdue"
      FROM "MaintenanceInvoice" i
      JOIN "Unit" u ON u."id"=i."unitId" AND u."societyId"=i."societyId"
      JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=i."societyId"
      WHERE i."societyId"=${societyId}::uuid AND i."status"='ISSUED' AND i."dueDate"<CURRENT_DATE
      ORDER BY i."dueDate" ASC,i."amountPaise" DESC
      LIMIT 500
    `);
    return {overdueCount:overdue.length,overduePaise:overdue.reduce((sum,item)=>sum+Number(item.amountPaise),0),severeCount:overdue.filter(item=>Number(item.daysOverdue)>=30).length,oldest:overdue[0]??null,accounts:overdue};
  }

  async proposeHelpdesk(societyId:string,userId:string,input:HelpdeskProposalInput) {
    const title=input.title.trim();
    const description=input.description.trim();
    if(title.length<3||title.length>120) throw new BadRequestException('Title must be between 3 and 120 characters');
    if(description.length<5||description.length>2000) throw new BadRequestException('Description must be between 5 and 2000 characters');
    return this.createProposal(societyId,userId,'CREATE_HELPDESK_TICKET',{
      unitId:input.unitId,title,description,...(input.category?.trim()?{category:input.category.trim()}:{}),priority:input.priority??'NORMAL',
    });
  }

  async proposeHelpdeskAssignment(societyId:string,userId:string,input:{ticketId:string;assignedToId:string|null}) {
    const preview=await this.helpdesk.assignmentPreview(societyId,input.ticketId,input.assignedToId);
    return this.createProposal(societyId,userId,'ASSIGN_HELPDESK_TICKET',{ticketId:input.ticketId,assignedToId:input.assignedToId,expectedUpdatedAt:preview.expectedUpdatedAt},preview);
  }

  proposeAmenityBooking(societyId:string,userId:string,input:AmenityProposalInput) {
    return this.createProposal(societyId,userId,'BOOK_AMENITY',input);
  }

  proposeVisitorPass(societyId:string,userId:string,input:VisitorPassProposalInput) {
    const name=input.name.trim();
    const phone=input.phone.trim();
    if(!name||!phone) throw new BadRequestException('Visitor name and phone are required');
    return this.createProposal(societyId,userId,'CREATE_VISITOR_PASS',{...input,name,phone});
  }

  confirm(societyId:string,userId:string,proposalId:string) {
    return this.confirmAction(societyId,userId,proposalId,'CREATE_HELPDESK_TICKET',async payload=>{
      const ticket=await this.helpdesk.createMine(societyId,userId,payload as HelpdeskProposalInput);
      return {ticketId:String((ticket as {id?:unknown}).id??'')};
    });
  }

  confirmHelpdeskAssignment(societyId:string,userId:string,proposalId:string) {
    return this.confirmAction(societyId,userId,proposalId,'ASSIGN_HELPDESK_TICKET',async payload=>{
      const input=payload as HelpdeskAssignmentProposalInput;
      const ticket=await this.helpdesk.assign(societyId,userId,input.ticketId,input.assignedToId,input.expectedUpdatedAt);
      return {ticketId:String((ticket as {id?:unknown}).id??input.ticketId),assignedToId:input.assignedToId??''};
    });
  }

  confirmAmenity(societyId:string,userId:string,proposalId:string) {
    return this.confirmAction(societyId,userId,proposalId,'BOOK_AMENITY',async payload=>{
      const input=payload as AmenityProposalInput;
      const booking=await this.amenities.createBooking(societyId,userId,input.amenityId,{unitId:input.unitId,startsAt:input.startsAt,endsAt:input.endsAt});
      return {bookingId:String((booking as {id?:unknown}).id??'')};
    });
  }

  confirmVisitor(societyId:string,userId:string,proposalId:string) {
    return this.confirmAction(societyId,userId,proposalId,'CREATE_VISITOR_PASS',async payload=>{
      const input=payload as VisitorPassProposalInput;
      const pass=await this.visitors.createPass(societyId,userId,input.unitId,input.name,input.phone,new Date(input.validFrom),new Date(input.validUntil));
      return {visitorPassId:String((pass as {id?:unknown}).id??'')};
    });
  }

  cancel(societyId:string,userId:string,proposalId:string) {
    return this.cancelAction(societyId,userId,proposalId,'CREATE_HELPDESK_TICKET');
  }

  cancelHelpdeskAssignment(societyId:string,userId:string,proposalId:string) { return this.cancelAction(societyId,userId,proposalId,'ASSIGN_HELPDESK_TICKET'); }

  cancelAmenity(societyId:string,userId:string,proposalId:string) {
    return this.cancelAction(societyId,userId,proposalId,'BOOK_AMENITY');
  }

  cancelVisitor(societyId:string,userId:string,proposalId:string) {
    return this.cancelAction(societyId,userId,proposalId,'CREATE_VISITOR_PASS');
  }

  private async createProposal(societyId:string,userId:string,action:AiAction,payload:unknown,impactPreview?:unknown) {
    if(!ALLOWED_AI_ACTIONS.has(action)) throw new BadRequestException('AI action is not allow-listed');
    const rows=await this.prisma.$queryRaw<Array<{id:string;status:string;payload:unknown;createdAt:Date}>>(Prisma.sql`
      INSERT INTO "AiOperationProposal" ("societyId","actorUserId","action","payload")
      VALUES (${societyId}::uuid,${userId}::uuid,${action},${JSON.stringify(payload)}::jsonb)
      RETURNING "id","status","payload","createdAt"
    `);
    return {...rows[0],action,impactPreview:impactPreview??null,previewed:true,permissionChecked:true,requiresConfirmation:true,autonomousExecution:false};
  }

  private async confirmAction(
    societyId:string,userId:string,proposalId:string,expectedAction:AiAction,execute:(payload:unknown)=>Promise<Record<string,string>>,
  ) {
    const claimed=await this.prisma.$queryRaw<ProposalRow[]>(Prisma.sql`
      UPDATE "AiOperationProposal"
      SET "status"='EXECUTING',"confirmedAt"=COALESCE("confirmedAt",CURRENT_TIMESTAMP),"errorMessage"=NULL,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${proposalId}::uuid AND "societyId"=${societyId}::uuid AND "actorUserId"=${userId}::uuid
        AND "action"=${expectedAction} AND "status" IN ('PROPOSED','FAILED')
      RETURNING "id","action","payload","status","result"
    `);
    const proposal=claimed[0];
    if(!proposal){
      const current=await this.prisma.$queryRaw<ProposalRow[]>(Prisma.sql`
        SELECT "id","action","payload","status","result" FROM "AiOperationProposal"
        WHERE "id"=${proposalId}::uuid AND "societyId"=${societyId}::uuid AND "actorUserId"=${userId}::uuid LIMIT 1
      `);
      if(!current[0]) throw new NotFoundException('AI operation proposal not found');
      if(current[0].action!==expectedAction) throw new BadRequestException('AI operation action does not match this confirmation endpoint');
      if(current[0].status==='EXECUTED') return {proposalId:current[0].id,status:'EXECUTED',result:current[0].result,idempotent:true};
      throw new BadRequestException(`AI operation proposal is ${current[0].status.toLowerCase()}`);
    }

    try {
      const result=await execute(proposal.payload);
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "AiOperationProposal"
        SET "status"='EXECUTED',"executedAt"=CURRENT_TIMESTAMP,"result"=${JSON.stringify(result)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${proposal.id}::uuid AND "status"='EXECUTING'
      `);
      return {proposalId:proposal.id,status:'EXECUTED',result};
    } catch(error) {
      const message=safeOperationalError(error);
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "AiOperationProposal"
        SET "status"='FAILED',"errorMessage"=${message.slice(0,1000)},"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${proposal.id}::uuid AND "status"='EXECUTING'
      `);
      throw error;
    }
  }

  private async cancelAction(societyId:string,userId:string,proposalId:string,action:AiAction) {
    const rows=await this.prisma.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`
      UPDATE "AiOperationProposal"
      SET "status"='CANCELLED',"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${proposalId}::uuid AND "societyId"=${societyId}::uuid AND "actorUserId"=${userId}::uuid
        AND "action"=${action} AND "status" IN ('PROPOSED','FAILED')
      RETURNING "id","status"
    `);
    if(!rows[0]) throw new NotFoundException('Open AI operation proposal not found');
    return rows[0];
  }
}
