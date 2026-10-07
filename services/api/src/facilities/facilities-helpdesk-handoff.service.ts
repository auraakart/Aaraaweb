import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type FacilitiesHelpdeskHandoffInput={
  priority?:'LOW'|'MEDIUM'|'HIGH'|'CRITICAL';
  dueAt?:string;
  assignedUserId?:string;
  expectedTicketUpdatedAt?:string;
};

@Injectable()
export class FacilitiesHelpdeskHandoffService{
  constructor(private readonly prisma:PrismaService){}

  async preview(societyId:string,ticketId:string){
    const [ticket]=await this.prisma.$queryRaw<Array<{
      id:string;title:string;description:string;priority:string;status:string;assetId:string|null;
      assetCode:string|null;assetName:string|null;updatedAt:Date;
    }>>(Prisma.sql`
      SELECT ht."id",ht."title",ht."description",ht."priority",ht."status",ht."assetId",ht."updatedAt",
             a."code" AS "assetCode",a."name" AS "assetName"
      FROM "HelpdeskTicket" ht
      LEFT JOIN "FacilityAsset" a ON a."id"=ht."assetId" AND a."societyId"=ht."societyId"
      WHERE ht."id"=${ticketId}::uuid AND ht."societyId"=${societyId}::uuid LIMIT 1
    `);
    if(!ticket)throw new BadRequestException('Helpdesk ticket not found');
    const [active]=await this.prisma.$queryRaw<Array<{id:string;title:string;status:string;priority:string}>>(Prisma.sql`
      SELECT "id","title","status","priority" FROM "FacilityWorkOrder"
      WHERE "societyId"=${societyId}::uuid AND "sourceHelpdeskTicketId"=${ticketId}::uuid AND "status" IN ('OPEN','IN_PROGRESS')
      ORDER BY "createdAt" DESC LIMIT 1
    `);
    const blockers:string[]=[];
    if(['RESOLVED','CLOSED'].includes(ticket.status))blockers.push('HELPDESK_TICKET_NOT_ACTIVE');
    if(active)blockers.push('ACTIVE_WORK_ORDER_EXISTS');
    return {
      ticket:{id:ticket.id,title:ticket.title,status:ticket.status,priority:ticket.priority},
      asset:ticket.assetId?{id:ticket.assetId,code:ticket.assetCode,name:ticket.assetName}:null,
      activeWorkOrder:active??null,
      suggested:{workType:'CORRECTIVE' as const,priority:this.helpdeskPriority(ticket.priority),title:ticket.title},
      blockers,
      expectedTicketUpdatedAt:ticket.updatedAt.toISOString(),
      confirmationRequired:true,
      mutationPerformed:false,
      boundary:'Preview only. Creating the Facilities work order requires explicit operator confirmation and FACILITIES_MANAGE permission.',
    };
  }

  async create(societyId:string,userId:string,ticketId:string,input:FacilitiesHelpdeskHandoffInput){
    if(input.assignedUserId)await this.assertActiveSocietyMember(societyId,input.assignedUserId);
    const due=input.dueAt?new Date(input.dueAt):null;
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`helpdesk-facility:${societyId}:${ticketId}`},0))`);
      const [ticket]=await tx.$queryRaw<Array<{id:string;title:string;description:string;priority:string;status:string;assetId:string|null;updatedAt:Date}>>(Prisma.sql`
        SELECT "id","title","description","priority","status","assetId","updatedAt" FROM "HelpdeskTicket"
        WHERE "id"=${ticketId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE
      `);
      if(!ticket)throw new BadRequestException('Helpdesk ticket not found');
      if(input.expectedTicketUpdatedAt&&ticket.updatedAt.toISOString()!==input.expectedTicketUpdatedAt){
        throw new ConflictException('Helpdesk ticket changed; refresh the Facilities handoff preview before confirming');
      }
      if(['RESOLVED','CLOSED'].includes(ticket.status))throw new BadRequestException('Resolved or closed Helpdesk tickets cannot create a new Facilities work order');
      const [existing]=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        SELECT "id" FROM "FacilityWorkOrder"
        WHERE "societyId"=${societyId}::uuid AND "sourceHelpdeskTicketId"=${ticketId}::uuid AND "status" IN ('OPEN','IN_PROGRESS')
        LIMIT 1
      `);
      if(existing)throw new ConflictException('An active Facilities work order already exists for this Helpdesk ticket');
      const priority=input.priority??this.helpdeskPriority(ticket.priority);
      const title=ticket.title.trim().slice(0,240);
      const [created]=await tx.$queryRaw<Array<Record<string,unknown>&{id:string}>>(Prisma.sql`
        INSERT INTO "FacilityWorkOrder" ("societyId","assetId","sourceHelpdeskTicketId","workType","priority","title","description","dueAt","assignedUserId","createdByUserId")
        VALUES (${societyId}::uuid,${ticket.assetId??null}::uuid,${ticketId}::uuid,'CORRECTIVE',${priority},${title},${ticket.description?.trim()||null},${due},${input.assignedUserId??null}::uuid,${userId}::uuid)
        RETURNING *
      `);
      await tx.$executeRaw(Prisma.sql`INSERT INTO "FacilityWorkOrderEvent" ("societyId","workOrderId","eventType","toStatus","note","actorUserId") VALUES (${societyId}::uuid,${created.id}::uuid,'CREATED','OPEN',${`Created from Helpdesk ticket ${ticketId}`},${userId}::uuid)`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO "HelpdeskActivity" ("societyId","ticketId","actorUserId","type","message") VALUES (${societyId}::uuid,${ticketId}::uuid,${userId}::uuid,'FACILITY_WORK_ORDER_CREATED',${`Facilities work order ${created.id} created`})`);
      return created;
    });
  }

  private helpdeskPriority(value:string):'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'{return value==='URGENT'?'CRITICAL':value==='HIGH'?'HIGH':value==='LOW'?'LOW':'MEDIUM';}

  private async assertActiveSocietyMember(societyId:string,userId:string){
    const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM "SocietyMembership"
      WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid AND "active"=TRUE LIMIT 1
    `);
    if(!rows.length)throw new BadRequestException('Assigned user must have an active membership in this society');
  }
}
