import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type CreateTenureInput={userId:string;roleName:string;effectiveFrom:Date;effectiveTo?:Date;};
type CreateMeetingInput={meetingType:'AGM'|'SGM'|'COMMITTEE'|'BUSINESS';title:string;scheduledAt:Date;location?:string;quorumRequired?:number;quorumRuleReference?:string;byeLawReference?:string;};
type MeetingOutcomeInput={status:'SCHEDULED'|'HELD'|'CANCELLED';heldAt?:Date;quorumPresent?:number;minutesSummary?:string;quorumRuleReference?:string;byeLawReference?:string;};
type AgendaInput={ordinal:number;title:string;description?:string;};
type ResolutionInput={agendaItemId?:string;title:string;resolutionText:string;status:'PROPOSED'|'PASSED'|'REJECTED'|'WITHDRAWN';approvalRequired?:number;approvalRecorded?:number;approvalRuleReference?:string;byeLawReference?:string;};
type ActionInput={resolutionId?:string;title:string;description?:string;ownerUserId?:string;dueAt?:Date;};

@Injectable()
export class GovernanceService{
  constructor(private readonly prisma:PrismaService){}

  listCommittee(societyId:string){return this.prisma.$queryRaw(Prisma.sql`
    SELECT t."id",t."userId",t."roleName",t."effectiveFrom",t."effectiveTo",t."handoverNotes",t."createdAt",
           u."name" AS "userName",u."phone" AS "userPhone"
    FROM "GovernanceCommitteeTenure" t JOIN "User" u ON u."id"=t."userId"
    WHERE t."societyId"=${societyId}::uuid ORDER BY t."effectiveFrom" DESC,t."createdAt" DESC
  `);}

  async createTenure(societyId:string,actorUserId:string,input:CreateTenureInput){
    const role=input.roleName.trim();if(!role)throw new BadRequestException('Committee role is required');
    if(input.effectiveTo&&input.effectiveTo<input.effectiveFrom)throw new BadRequestException('Tenure end cannot precede start');
    return this.prisma.$transaction(async tx=>{
      const user=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "User" WHERE "id"=${input.userId}::uuid LIMIT 1`);if(!user.length)throw new NotFoundException('Committee member user not found');
      const overlap=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        SELECT "id" FROM "GovernanceCommitteeTenure" WHERE "societyId"=${societyId}::uuid AND "userId"=${input.userId}::uuid
        AND COALESCE("effectiveTo",'infinity'::timestamp)>=${input.effectiveFrom}
        AND COALESCE(${input.effectiveTo??null}::timestamp,'infinity'::timestamp)>="effectiveFrom" LIMIT 1 FOR UPDATE
      `);if(overlap.length)throw new ConflictException('Committee member already has an overlapping tenure');
      const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
        INSERT INTO "GovernanceCommitteeTenure" ("societyId","userId","roleName","effectiveFrom","effectiveTo","createdByUserId")
        VALUES (${societyId}::uuid,${input.userId}::uuid,${role},${input.effectiveFrom},${input.effectiveTo??null},${actorUserId}::uuid)
        RETURNING *
      `);return rows[0];
    });
  }

  async endTenure(societyId:string,actorUserId:string,id:string,effectiveTo:Date,handoverNotes?:string){
    return this.prisma.$transaction(async tx=>{
      const current=await tx.$queryRaw<Array<{effectiveFrom:Date;effectiveTo:Date|null}>>(Prisma.sql`SELECT "effectiveFrom","effectiveTo" FROM "GovernanceCommitteeTenure" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE`);if(!current.length)throw new NotFoundException('Committee tenure not found');if(current[0].effectiveTo)throw new ConflictException('Committee tenure is already ended');if(effectiveTo<current[0].effectiveFrom)throw new BadRequestException('Tenure end cannot precede start');
      const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`UPDATE "GovernanceCommitteeTenure" SET "effectiveTo"=${effectiveTo},"handoverNotes"=${handoverNotes?.trim()||null},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid RETURNING *`);
      return rows[0];
    });
  }

  listMeetings(societyId:string){return this.prisma.$queryRaw(Prisma.sql`
    SELECT "id","meetingType","status","title","scheduledAt","heldAt","location","quorumRequired","quorumPresent","quorumRuleReference","byeLawReference","createdAt","updatedAt"
    FROM "GovernanceMeeting" WHERE "societyId"=${societyId}::uuid ORDER BY "scheduledAt" DESC LIMIT 250
  `);}

  async getMeeting(societyId:string,id:string){
    const meetings=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`SELECT * FROM "GovernanceMeeting" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);if(!meetings.length)throw new NotFoundException('Governance meeting not found');
    const [agenda,resolutions,actions,evidence]=await Promise.all([
      this.prisma.$queryRaw(Prisma.sql`SELECT * FROM "GovernanceAgendaItem" WHERE "societyId"=${societyId}::uuid AND "meetingId"=${id}::uuid ORDER BY "ordinal"`),
      this.prisma.$queryRaw(Prisma.sql`SELECT * FROM "GovernanceResolution" WHERE "societyId"=${societyId}::uuid AND "meetingId"=${id}::uuid ORDER BY "recordedAt"`),
      this.prisma.$queryRaw(Prisma.sql`SELECT * FROM "GovernanceActionItem" WHERE "societyId"=${societyId}::uuid AND "meetingId"=${id}::uuid ORDER BY "createdAt"`),
      this.prisma.$queryRaw(Prisma.sql`SELECT * FROM "GovernanceEvidenceEvent" WHERE "societyId"=${societyId}::uuid AND "meetingId"=${id}::uuid ORDER BY "createdAt"`),
    ]);return {...meetings[0],agenda,resolutions,actions,evidence};
  }

  async createMeeting(societyId:string,actorUserId:string,input:CreateMeetingInput){
    const title=input.title.trim();if(!title)throw new BadRequestException('Meeting title is required');
    const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      INSERT INTO "GovernanceMeeting" ("societyId","meetingType","title","scheduledAt","location","quorumRequired","quorumRuleReference","byeLawReference","createdByUserId")
      VALUES (${societyId}::uuid,${input.meetingType},${title},${input.scheduledAt},${input.location?.trim()||null},${input.quorumRequired??null},${input.quorumRuleReference?.trim()||null},${input.byeLawReference?.trim()||null},${actorUserId}::uuid) RETURNING "id"
    `);await this.evidence(societyId,rows[0].id,actorUserId,'MEETING_CREATED',`Meeting created: ${title}`);return this.getMeeting(societyId,rows[0].id);
  }

  async recordMeetingOutcome(societyId:string,actorUserId:string,id:string,input:MeetingOutcomeInput){
    const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      UPDATE "GovernanceMeeting" SET "status"=${input.status},"heldAt"=${input.heldAt??null},"quorumPresent"=${input.quorumPresent??null},"minutesSummary"=${input.minutesSummary?.trim()||null},"quorumRuleReference"=COALESCE(${input.quorumRuleReference?.trim()||null},"quorumRuleReference"),"byeLawReference"=COALESCE(${input.byeLawReference?.trim()||null},"byeLawReference"),"updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid RETURNING "id"
    `);if(!rows.length)throw new NotFoundException('Governance meeting not found');await this.evidence(societyId,id,actorUserId,'MEETING_OUTCOME_RECORDED',`Meeting status recorded as ${input.status}`,{quorumPresent:input.quorumPresent});return this.getMeeting(societyId,id);
  }

  async addAgenda(societyId:string,actorUserId:string,meetingId:string,input:AgendaInput){
    await this.assertMeeting(societyId,meetingId);const title=input.title.trim();if(!title)throw new BadRequestException('Agenda title is required');
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`INSERT INTO "GovernanceAgendaItem" ("societyId","meetingId","ordinal","title","description") VALUES (${societyId}::uuid,${meetingId}::uuid,${input.ordinal},${title},${input.description?.trim()||null}) RETURNING *`);await this.evidence(societyId,meetingId,actorUserId,'AGENDA_ADDED',`Agenda ${input.ordinal}: ${title}`);return rows[0];
  }

  async addResolution(societyId:string,actorUserId:string,meetingId:string,input:ResolutionInput){
    await this.assertMeeting(societyId,meetingId);if(input.agendaItemId){const a=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "GovernanceAgendaItem" WHERE "id"=${input.agendaItemId}::uuid AND "societyId"=${societyId}::uuid AND "meetingId"=${meetingId}::uuid LIMIT 1`);if(!a.length)throw new BadRequestException('Agenda item does not belong to this meeting');}
    const title=input.title.trim(),text=input.resolutionText.trim();if(!title||!text)throw new BadRequestException('Resolution title and text are required');
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`INSERT INTO "GovernanceResolution" ("societyId","meetingId","agendaItemId","title","resolutionText","status","approvalRequired","approvalRecorded","approvalRuleReference","byeLawReference","recordedByUserId") VALUES (${societyId}::uuid,${meetingId}::uuid,${input.agendaItemId??null}::uuid,${title},${text},${input.status},${input.approvalRequired??null},${input.approvalRecorded??null},${input.approvalRuleReference?.trim()||null},${input.byeLawReference?.trim()||null},${actorUserId}::uuid) RETURNING *`);await this.evidence(societyId,meetingId,actorUserId,'RESOLUTION_RECORDED',`${input.status}: ${title}`,{approvalRequired:input.approvalRequired,approvalRecorded:input.approvalRecorded});return rows[0];
  }

  async addAction(societyId:string,actorUserId:string,meetingId:string,input:ActionInput){
    await this.assertMeeting(societyId,meetingId);if(input.resolutionId){const r=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "GovernanceResolution" WHERE "id"=${input.resolutionId}::uuid AND "societyId"=${societyId}::uuid AND "meetingId"=${meetingId}::uuid LIMIT 1`);if(!r.length)throw new BadRequestException('Resolution does not belong to this meeting');}
    if(input.ownerUserId){const u=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "User" WHERE "id"=${input.ownerUserId}::uuid LIMIT 1`);if(!u.length)throw new BadRequestException('Action owner user not found');}
    const title=input.title.trim();if(!title)throw new BadRequestException('Action title is required');const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`INSERT INTO "GovernanceActionItem" ("societyId","meetingId","resolutionId","title","description","ownerUserId","dueAt","createdByUserId") VALUES (${societyId}::uuid,${meetingId}::uuid,${input.resolutionId??null}::uuid,${title},${input.description?.trim()||null},${input.ownerUserId??null}::uuid,${input.dueAt??null},${actorUserId}::uuid) RETURNING *`);await this.evidence(societyId,meetingId,actorUserId,'ACTION_CREATED',`Action created: ${title}`);return rows[0];
  }

  private async assertMeeting(societyId:string,id:string){const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "GovernanceMeeting" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);if(!rows.length)throw new NotFoundException('Governance meeting not found');}
  private evidence(societyId:string,meetingId:string,actorUserId:string,eventType:string,summary:string,metadata?:Record<string,unknown>){return this.prisma.$executeRaw(Prisma.sql`INSERT INTO "GovernanceEvidenceEvent" ("societyId","meetingId","eventType","actorUserId","summary","metadataJson") VALUES (${societyId}::uuid,${meetingId}::uuid,${eventType},${actorUserId}::uuid,${summary},${metadata?JSON.stringify(metadata):null}::jsonb)`);}
}
