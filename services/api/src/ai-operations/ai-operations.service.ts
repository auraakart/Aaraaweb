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
  societyId: string;
  actorUserId: string;
  action: 'CREATE_HELPDESK_TICKET';
  payload: HelpdeskProposalInput;
  status: 'PROPOSED'|'EXECUTED'|'CANCELLED';
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
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<ProposalRow[]>(Prisma.sql`
        SELECT "id","societyId","actorUserId","action","payload","status"
        FROM "AiOperationProposal"
        WHERE "id"=${proposalId}::uuid AND "societyId"=${societyId}::uuid AND "actorUserId"=${userId}::uuid
        FOR UPDATE
      `);
      const proposal=rows[0];
      if(!proposal) throw new NotFoundException('AI operation proposal not found');
      if(proposal.status!=='PROPOSED') throw new BadRequestException(`AI operation proposal is ${proposal.status.toLowerCase()}`);
      if(proposal.action!=='CREATE_HELPDESK_TICKET') throw new BadRequestException('Unsupported AI operation action');

      // Execute through the existing domain service so occupancy, validation and
      // normal helpdesk audit behaviour remain authoritative. The AI layer never
      // writes the HelpdeskTicket domain tables directly.
      const ticket=await this.helpdesk.createMine(societyId,userId,proposal.payload);
      const result={ticketId:String((ticket as {id?:unknown}).id??'')};
      await tx.$executeRaw(Prisma.sql`
        UPDATE "AiOperationProposal"
        SET "status"='EXECUTED',"confirmedAt"=CURRENT_TIMESTAMP,"executedAt"=CURRENT_TIMESTAMP,
            "result"=${JSON.stringify(result)}::jsonb
        WHERE "id"=${proposal.id}::uuid AND "status"='PROPOSED'
      `);
      return {proposalId:proposal.id,status:'EXECUTED',result};
    });
  }

  async cancel(societyId:string,userId:string,proposalId:string) {
    const rows=await this.prisma.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`
      UPDATE "AiOperationProposal"
      SET "status"='CANCELLED'
      WHERE "id"=${proposalId}::uuid AND "societyId"=${societyId}::uuid AND "actorUserId"=${userId}::uuid AND "status"='PROPOSED'
      RETURNING "id","status"
    `);
    if(!rows[0]) throw new NotFoundException('Open AI operation proposal not found');
    return rows[0];
  }
}
