import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HelpdeskService } from '../helpdesk/helpdesk.service';

type HelpdeskProposalInput = {
  unitId: string;
  title: string;
  description: string;
  category?: string;
  priority?: 'LOW'|'NORMAL'|'HIGH'|'URGENT';
};

type ProposalRow = {
  id: string;
  action: 'CREATE_HELPDESK_TICKET';
  payload: HelpdeskProposalInput;
  status: 'PROPOSED'|'EXECUTING'|'EXECUTED'|'FAILED'|'CANCELLED';
  result?: unknown;
};

@Injectable()
export class AiOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly helpdesk: HelpdeskService,
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
      id:string;
      invoiceNumber:string;
      amountPaise:number;
      dueDate:Date;
      status:string;
      unitNumber:string;
      buildingName:string;
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
      id:string;
      invoiceId:string;
      invoiceNumber:string;
      amountPaise:number;
      status:string;
      createdAt:Date;
      completedAt:Date|null;
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
    const outstandingPaise=open.reduce((sum,invoice)=>sum+Number(invoice.amountPaise),0);
    return {
      outstandingPaise,
      openInvoices:open,
      invoiceCount:invoices.length,
      recentPayments:payments,
      latestReceiptCandidate:payments.find(payment=>payment.status==='CAPTURED'||payment.status==='REFUNDED')??null,
    };
  }

  async operationsSummary(societyId:string) {
    const tickets=await this.prisma.$queryRaw<Array<{
      id:string;
      title:string;
      priority:string;
      status:string;
      slaState:string;
      firstResponseDueAt:Date|null;
      resolutionDueAt:Date|null;
      unitNumber:string;
      buildingName:string;
      assignedToId:string|null;
      escalationLevel:number;
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
    return {
      openCount:tickets.length,
      breachedCount:breached.length,
      unassignedCount:unassigned.length,
      byPriority,
      breaches:breached.slice(0,50),
      unassigned:unassigned.slice(0,50),
    };
  }

  async overdueFinanceSummary(societyId:string) {
    const overdue=await this.prisma.$queryRaw<Array<{
      id:string;
      invoiceNumber:string;
      amountPaise:number;
      dueDate:Date;
      unitNumber:string;
      buildingName:string;
      daysOverdue:number;
    }>>(Prisma.sql`
      SELECT i."id",i."invoiceNumber",i."amountPaise",i."dueDate",
             u."number" AS "unitNumber",b."name" AS "buildingName",
             GREATEST(0,(CURRENT_DATE-i."dueDate"))::int AS "daysOverdue"
      FROM "MaintenanceInvoice" i
      JOIN "Unit" u ON u."id"=i."unitId" AND u."societyId"=i."societyId"
      JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=i."societyId"
      WHERE i."societyId"=${societyId}::uuid
        AND i."status"='ISSUED'
        AND i."dueDate"<CURRENT_DATE
      ORDER BY i."dueDate" ASC,i."amountPaise" DESC
      LIMIT 500
    `);
    return {
      overdueCount:overdue.length,
      overduePaise:overdue.reduce((sum,item)=>sum+Number(item.amountPaise),0),
      severeCount:overdue.filter(item=>Number(item.daysOverdue)>=30).length,
      oldest:overdue[0]??null,
      accounts:overdue,
    };
  }

  async proposeHelpdesk(societyId:string,userId:string,input:HelpdeskProposalInput) {
    const title=input.title.trim();
    const description=input.description.trim();
    if(title.length<3||title.length>120) throw new BadRequestException('Title must be between 3 and 120 characters');
    if(description.length<5||description.length>2000) throw new BadRequestException('Description must be between 5 and 2000 characters');
    const payload={
      unitId:input.unitId,
      title,
      description,
      ...(input.category?.trim()?{category:input.category.trim()}:{}),
      priority:input.priority??'NORMAL',
    };
    const rows=await this.prisma.$queryRaw<Array<{id:string;status:string;payload:unknown;createdAt:Date}>>(Prisma.sql`
      INSERT INTO "AiOperationProposal" ("societyId","actorUserId","action","payload")
      VALUES (${societyId}::uuid,${userId}::uuid,'CREATE_HELPDESK_TICKET',${JSON.stringify(payload)}::jsonb)
      RETURNING "id","status","payload","createdAt"
    `);
    return {...rows[0],requiresConfirmation:true};
  }

  async confirm(societyId:string,userId:string,proposalId:string) {
    const claimed=await this.prisma.$queryRaw<ProposalRow[]>(Prisma.sql`
      UPDATE "AiOperationProposal"
      SET "status"='EXECUTING',"confirmedAt"=COALESCE("confirmedAt",CURRENT_TIMESTAMP),
          "errorMessage"=NULL,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${proposalId}::uuid AND "societyId"=${societyId}::uuid AND "actorUserId"=${userId}::uuid
        AND "status" IN ('PROPOSED','FAILED')
      RETURNING "id","action","payload","status","result"
    `);
    const proposal=claimed[0];
    if(!proposal){
      const current=await this.prisma.$queryRaw<ProposalRow[]>(Prisma.sql`
        SELECT "id","action","payload","status","result" FROM "AiOperationProposal"
        WHERE "id"=${proposalId}::uuid AND "societyId"=${societyId}::uuid AND "actorUserId"=${userId}::uuid LIMIT 1
      `);
      if(!current[0]) throw new NotFoundException('AI operation proposal not found');
      if(current[0].status==='EXECUTED') return {proposalId:current[0].id,status:'EXECUTED',result:current[0].result,idempotent:true};
      throw new BadRequestException(`AI operation proposal is ${current[0].status.toLowerCase()}`);
    }
    if(proposal.action!=='CREATE_HELPDESK_TICKET') throw new BadRequestException('Unsupported AI operation action');

    try {
      const ticket=await this.helpdesk.createMine(societyId,userId,proposal.payload);
      const result={ticketId:String((ticket as {id?:unknown}).id??'')};
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "AiOperationProposal"
        SET "status"='EXECUTED',"executedAt"=CURRENT_TIMESTAMP,"result"=${JSON.stringify(result)}::jsonb,
            "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${proposal.id}::uuid AND "status"='EXECUTING'
      `);
      return {proposalId:proposal.id,status:'EXECUTED',result};
    } catch(error) {
      const message=error instanceof Error?error.message:'AI operation execution failed';
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "AiOperationProposal"
        SET "status"='FAILED',"errorMessage"=${message.slice(0,1000)},"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${proposal.id}::uuid AND "status"='EXECUTING'
      `);
      throw error;
    }
  }

  async cancel(societyId:string,userId:string,proposalId:string) {
    const rows=await this.prisma.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`
      UPDATE "AiOperationProposal"
      SET "status"='CANCELLED',"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${proposalId}::uuid AND "societyId"=${societyId}::uuid AND "actorUserId"=${userId}::uuid
        AND "status" IN ('PROPOSED','FAILED')
      RETURNING "id","status"
    `);
    if(!rows[0]) throw new NotFoundException('Open AI operation proposal not found');
    return rows[0];
  }
}
