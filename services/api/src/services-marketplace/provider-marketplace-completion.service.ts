import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceBookingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerAvailabilityService } from './consumer-availability.service';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';

export type ProviderApplicationInput = {
  businessName: string; contactName?: string; phone: string; email?: string; description?: string;
  requestedCategoryIds?: string[]; evidenceRefs?: string[];
};
export type ProviderOfferingInput = { categoryId: string; name: string; description?: string; pricePaise: number; durationMinutes?: number; active?: boolean };
export type AvailabilityExceptionInput = { serviceDate: string; closed: boolean; slotCapacity?: number; note?: string; active?: boolean };

@Injectable()
export class ProviderMarketplaceCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operators: ConsumerProviderOperatorService,
    private readonly availability: ConsumerAvailabilityService,
  ) {}

  async getMyApplication(userId: string) {
    const rows=await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT * FROM "ProviderOnboardingApplication" WHERE "applicantUserId"=${userId}::uuid ORDER BY "createdAt" DESC LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async saveMyApplication(userId: string,input: ProviderApplicationInput) {
    const active=await this.prisma.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`
      SELECT "id","status" FROM "ProviderOnboardingApplication"
      WHERE "applicantUserId"=${userId}::uuid AND "status" IN ('DRAFT','SUBMITTED','UNDER_REVIEW') LIMIT 1
    `);
    if(active[0] && active[0].status!=='DRAFT') throw new BadRequestException('Submitted provider application cannot be edited');
    const categories=Array.from(new Set(input.requestedCategoryIds??[]));
    if(categories.length){
      const found=await this.prisma.serviceCategory.count({where:{id:{in:categories},active:true}});
      if(found!==categories.length) throw new BadRequestException('One or more requested service categories are invalid');
    }
    const evidence=Array.from(new Set((input.evidenceRefs??[]).map(v=>v.trim()).filter(Boolean))).slice(0,20);
    if(active[0]){
      const rows=await this.prisma.$queryRaw<any[]>(Prisma.sql`
        UPDATE "ProviderOnboardingApplication" SET
          "businessName"=${input.businessName.trim()},"contactName"=${input.contactName?.trim()||null},
          "phone"=${input.phone.trim()},"email"=${input.email?.trim()||null},"description"=${input.description?.trim()||null},
          "requestedCategoryIds"=${JSON.stringify(categories)}::jsonb,"evidenceRefs"=${JSON.stringify(evidence)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${active[0].id}::uuid RETURNING *
      `); return rows[0];
    }
    const rows=await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "ProviderOnboardingApplication" ("id","applicantUserId","businessName","contactName","phone","email","description","requestedCategoryIds","evidenceRefs")
      VALUES (${randomUUID()}::uuid,${userId}::uuid,${input.businessName.trim()},${input.contactName?.trim()||null},${input.phone.trim()},${input.email?.trim()||null},
        ${input.description?.trim()||null},${JSON.stringify(categories)}::jsonb,${JSON.stringify(evidence)}::jsonb) RETURNING *
    `); return rows[0];
  }

  async submitMyApplication(userId:string){
    const rows=await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "ProviderOnboardingApplication" SET "status"='SUBMITTED',"submittedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "applicantUserId"=${userId}::uuid AND "status"='DRAFT' RETURNING *
    `);
    if(!rows[0]) throw new BadRequestException('A provider application draft is required');
    return rows[0];
  }

  listApplications(status?:string){
    return this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT a.*,u."name" AS "applicantName",u."phone" AS "applicantPhone"
      FROM "ProviderOnboardingApplication" a JOIN "User" u ON u."id"=a."applicantUserId"
      WHERE (${status??null}::text IS NULL OR a."status"=${status??null})
      ORDER BY CASE a."status" WHEN 'SUBMITTED' THEN 0 WHEN 'UNDER_REVIEW' THEN 1 ELSE 2 END,a."createdAt" ASC
    `);
  }

  async reviewApplication(reviewerUserId:string,applicationId:string,decision:'APPROVE'|'REJECT',note:string){
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<any[]>(Prisma.sql`SELECT * FROM "ProviderOnboardingApplication" WHERE "id"=${applicationId}::uuid FOR UPDATE`);
      const app=rows[0]; if(!app) throw new NotFoundException('Provider application not found');
      if(!['SUBMITTED','UNDER_REVIEW'].includes(app.status)) throw new BadRequestException('Provider application is not reviewable');
      let providerId:string|null=app.providerId??null;
      if(decision==='APPROVE'&&!providerId){
        const provider=await tx.serviceProvider.create({data:{
          businessName:app.businessName,contactName:app.contactName,phone:app.phone,email:app.email,description:app.description,active:true,
        },select:{id:true}});
        providerId=provider.id;
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "ConsumerProviderOperator" ("id","providerId","userId","active","createdAt","updatedAt")
          VALUES (${randomUUID()}::uuid,${providerId}::uuid,${app.applicantUserId}::uuid,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
          ON CONFLICT ("providerId","userId") DO UPDATE SET "active"=true,"updatedAt"=CURRENT_TIMESTAMP
        `);
      }
      const updated=await tx.$queryRaw<any[]>(Prisma.sql`
        UPDATE "ProviderOnboardingApplication" SET "status"=${decision==='APPROVE'?'APPROVED':'REJECTED'},"providerId"=${providerId}::uuid,
          "reviewNote"=${note.trim()},"reviewedByUserId"=${reviewerUserId}::uuid,"reviewedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${applicationId}::uuid RETURNING *
      `);
      return updated[0];
    });
  }

  listCategories(){return this.prisma.serviceCategory.findMany({where:{active:true},orderBy:[{sortOrder:'asc'},{name:'asc'}],select:{id:true,name:true,slug:true}});}

  async createMyOffering(userId:string,input:ProviderOfferingInput){
    const provider=await this.operators.resolveProvider(userId);
    const category=await this.prisma.serviceCategory.findFirst({where:{id:input.categoryId,active:true},select:{id:true}});
    if(!category) throw new BadRequestException('Active service category not found');
    if(input.pricePaise<0) throw new BadRequestException('Offering price cannot be negative');
    const offering=await this.prisma.serviceOffering.create({data:{
      providerId:provider.providerId,categoryId:input.categoryId,name:input.name.trim(),description:input.description?.trim()||null,
      pricePaise:input.pricePaise,durationMinutes:input.durationMinutes??null,active:input.active??true,
    },select:{id:true,providerId:true,categoryId:true,name:true,description:true,pricePaise:true,durationMinutes:true,active:true}});
    await this.appendOfferingEvent(offering.id,provider.providerId,userId,'CREATED',offering);
    return offering;
  }

  async updateMyOffering(userId:string,offeringId:string,patch:Partial<ProviderOfferingInput>){
    const provider=await this.operators.resolveProvider(userId);
    const current=await this.prisma.serviceOffering.findFirst({where:{id:offeringId,providerId:provider.providerId}});
    if(!current) throw new NotFoundException('Provider offering not found');
    if(patch.categoryId){
      const category=await this.prisma.serviceCategory.findFirst({where:{id:patch.categoryId,active:true},select:{id:true}});
      if(!category) throw new BadRequestException('Active service category not found');
    }
    if(patch.pricePaise!==undefined&&patch.pricePaise<0) throw new BadRequestException('Offering price cannot be negative');
    const offering=await this.prisma.serviceOffering.update({where:{id:offeringId},data:{
      ...(patch.categoryId?{categoryId:patch.categoryId}:{}),...(patch.name!==undefined?{name:patch.name.trim()}:{}),
      ...(patch.description!==undefined?{description:patch.description?.trim()||null}:{}),...(patch.pricePaise!==undefined?{pricePaise:patch.pricePaise}:{}),
      ...(patch.durationMinutes!==undefined?{durationMinutes:patch.durationMinutes??null}:{}),...(patch.active!==undefined?{active:patch.active}:{}),
    },select:{id:true,providerId:true,categoryId:true,name:true,description:true,pricePaise:true,durationMinutes:true,active:true}});
    await this.appendOfferingEvent(offering.id,provider.providerId,userId,'UPDATED',offering);
    return offering;
  }

  async listMyOfferingEvents(userId:string,offeringId:string){
    const provider=await this.operators.resolveProvider(userId);
    const exists=await this.prisma.serviceOffering.findFirst({where:{id:offeringId,providerId:provider.providerId},select:{id:true}});
    if(!exists) throw new NotFoundException('Provider offering not found');
    return this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT "action","snapshotJson","occurredAt" FROM "ServiceOfferingProviderEvent" WHERE "offeringId"=${offeringId}::uuid ORDER BY "occurredAt" DESC`);
  }

  async proposeBookingTime(userId:string,bookingId:string,proposedFrom:Date,proposedUntil:Date,note?:string){
    if(proposedFrom<=new Date()||proposedUntil<=proposedFrom) throw new BadRequestException('Proposed service window is invalid');
    const provider=await this.operators.resolveProvider(userId);
    const rows=await this.prisma.$queryRaw<Array<{id:string;status:ServiceBookingStatus}>>(Prisma.sql`
      SELECT "id","status" FROM "ConsumerServiceBooking" WHERE "id"=${bookingId}::uuid AND "providerId"=${provider.providerId}::uuid LIMIT 1
    `);
    if(!rows[0]) throw new NotFoundException('Provider booking not found');
    if(rows[0].status!==ServiceBookingStatus.REQUESTED) throw new BadRequestException('Only requested bookings can receive a provider counter-proposal');
    try{
      const result=await this.prisma.$queryRaw<any[]>(Prisma.sql`
        INSERT INTO "ProviderBookingProposal" ("id","bookingId","providerId","proposedFrom","proposedUntil","note","createdByUserId")
        VALUES (${randomUUID()}::uuid,${bookingId}::uuid,${provider.providerId}::uuid,${proposedFrom},${proposedUntil},${note?.trim()||null},${userId}::uuid)
        RETURNING *
      `); return result[0];
    }catch(e){throw new BadRequestException('A pending proposal already exists for this booking');}
  }

  async listConsumerProposals(userId:string,bookingId:string){
    await this.assertConsumerBooking(userId,bookingId);
    return this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT * FROM "ProviderBookingProposal" WHERE "bookingId"=${bookingId}::uuid ORDER BY "createdAt" DESC`);
  }

  async respondToProposal(userId:string,bookingId:string,proposalId:string,decision:'ACCEPT'|'REJECT'){
    return this.prisma.$transaction(async tx=>{
      const bookingRows=await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT "id","userId","providerId","offeringId","status","addressSnapshot" FROM "ConsumerServiceBooking"
        WHERE "id"=${bookingId}::uuid AND "userId"=${userId}::uuid FOR UPDATE
      `);
      const booking=bookingRows[0]; if(!booking) throw new NotFoundException('Booking not found');
      if(booking.status!==ServiceBookingStatus.REQUESTED) throw new BadRequestException('Booking is no longer awaiting provider confirmation');
      const proposalRows=await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT * FROM "ProviderBookingProposal" WHERE "id"=${proposalId}::uuid AND "bookingId"=${bookingId}::uuid AND "status"='PENDING' FOR UPDATE
      `);
      const proposal=proposalRows[0]; if(!proposal) throw new NotFoundException('Pending proposal not found');
      if(decision==='ACCEPT'){
        const postalCode=booking.addressSnapshot?.postalCode;
        if(typeof postalCode!=='string') throw new BadRequestException('Booking delivery postal code is unavailable');
        await this.availability.lockAndAssertBookable(tx,booking.offeringId,booking.providerId,postalCode,new Date(proposal.proposedFrom),new Date(proposal.proposedUntil));
        await tx.$executeRaw(Prisma.sql`
          UPDATE "ConsumerServiceBooking" SET "scheduledFrom"=${proposal.proposedFrom},"scheduledUntil"=${proposal.proposedUntil},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${bookingId}::uuid
        `);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "ConsumerServiceBookingEvent" ("id","bookingId","actorUserId","action","fromStatus","toStatus","occurredAt")
          VALUES (${randomUUID()}::uuid,${bookingId}::uuid,${userId}::uuid,'CUSTOMER_ACCEPTED_PROVIDER_PROPOSAL',
            ${ServiceBookingStatus.REQUESTED}::"ServiceBookingStatus",${ServiceBookingStatus.REQUESTED}::"ServiceBookingStatus",CURRENT_TIMESTAMP)
        `);
      }
      const updated=await tx.$queryRaw<any[]>(Prisma.sql`
        UPDATE "ProviderBookingProposal" SET "status"=${decision==='ACCEPT'?'ACCEPTED':'REJECTED'},"respondedByUserId"=${userId}::uuid,"respondedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${proposalId}::uuid RETURNING *
      `); return updated[0];
    });
  }

  async addCompletionEvidence(userId:string,bookingId:string,evidenceType:'NOTE'|'REFERENCE',reference?:string,note?:string){
    const provider=await this.operators.resolveProvider(userId);
    const rows=await this.prisma.$queryRaw<Array<{id:string;status:ServiceBookingStatus}>>(Prisma.sql`
      SELECT "id","status" FROM "ConsumerServiceBooking" WHERE "id"=${bookingId}::uuid AND "providerId"=${provider.providerId}::uuid LIMIT 1
    `);
    if(!rows[0]) throw new NotFoundException('Provider booking not found');
    if(![ServiceBookingStatus.IN_PROGRESS,ServiceBookingStatus.COMPLETED].includes(rows[0].status)) throw new BadRequestException('Completion evidence requires an in-progress or completed booking');
    if(evidenceType==='REFERENCE'&&!reference?.trim()) throw new BadRequestException('Reference evidence requires a reference');
    const result=await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "ConsumerServiceCompletionEvidence" ("id","bookingId","providerId","actorUserId","evidenceType","reference","note")
      VALUES (${randomUUID()}::uuid,${bookingId}::uuid,${provider.providerId}::uuid,${userId}::uuid,${evidenceType},${reference?.trim()||null},${note?.trim()||null}) RETURNING *
    `); return result[0];
  }

  async listConsumerEvidence(userId:string,bookingId:string){
    await this.assertConsumerBooking(userId,bookingId);
    return this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT "id","evidenceType","reference","note","occurredAt" FROM "ConsumerServiceCompletionEvidence" WHERE "bookingId"=${bookingId}::uuid ORDER BY "occurredAt" ASC
    `);
  }

  async openDispute(userId:string,bookingId:string,reasonCode:string,detail:string){
    const booking=await this.assertConsumerBooking(userId,bookingId);
    if(![ServiceBookingStatus.IN_PROGRESS,ServiceBookingStatus.COMPLETED].includes(booking.status)) throw new BadRequestException('A dispute can be opened only after service has started');
    try{
      const rows=await this.prisma.$queryRaw<any[]>(Prisma.sql`
        INSERT INTO "ConsumerServiceDispute" ("id","bookingId","userId","providerId","reasonCode","detail")
        VALUES (${randomUUID()}::uuid,${bookingId}::uuid,${userId}::uuid,${booking.providerId}::uuid,${reasonCode.trim()},${detail.trim()}) RETURNING *
      `); return rows[0];
    }catch(e){throw new BadRequestException('An open dispute already exists for this booking');}
  }

  async listMyDisputes(userId:string){
    const provider=await this.operators.resolveProvider(userId);
    return this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT * FROM "ConsumerServiceDispute" WHERE "providerId"=${provider.providerId}::uuid ORDER BY "createdAt" DESC`);
  }

  listPlatformDisputes(status?:string){
    return this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT d.*,p."businessName" AS "providerName",o."name" AS "offeringName"
      FROM "ConsumerServiceDispute" d JOIN "ConsumerServiceBooking" b ON b."id"=d."bookingId"
      JOIN "ServiceProvider" p ON p."id"=d."providerId" JOIN "ServiceOffering" o ON o."id"=b."offeringId"
      WHERE (${status??null}::text IS NULL OR d."status"=${status??null}) ORDER BY d."createdAt" DESC
    `);
  }

  async resolveDispute(reviewerUserId:string,disputeId:string,status:'RESOLVED'|'DISMISSED',resolutionNote:string){
    const rows=await this.prisma.$queryRaw<any[]>(Prisma.sql`
      UPDATE "ConsumerServiceDispute" SET "status"=${status},"resolutionNote"=${resolutionNote.trim()},"resolvedByUserId"=${reviewerUserId}::uuid,
        "resolvedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${disputeId}::uuid AND "status" IN ('OPEN','UNDER_REVIEW') RETURNING *
    `);
    if(!rows[0]) throw new NotFoundException('Open dispute not found'); return rows[0];
  }

  async listAvailabilityExceptions(userId:string,offeringId:string){
    await this.assertOwnedOffering(userId,offeringId);
    return this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT * FROM "ConsumerOfferingAvailabilityException" WHERE "offeringId"=${offeringId}::uuid ORDER BY "serviceDate" ASC`);
  }

  async setAvailabilityException(userId:string,offeringId:string,input:AvailabilityExceptionInput){
    await this.assertOwnedOffering(userId,offeringId);
    const d=new Date(`${input.serviceDate}T00:00:00.000Z`); if(Number.isNaN(d.getTime())) throw new BadRequestException('Invalid service date');
    if(!input.closed && input.slotCapacity===undefined) throw new BadRequestException('Open date override requires slot capacity');
    const rows=await this.prisma.$queryRaw<any[]>(Prisma.sql`
      INSERT INTO "ConsumerOfferingAvailabilityException" ("id","offeringId","serviceDate","closed","slotCapacity","note","active")
      VALUES (${randomUUID()}::uuid,${offeringId}::uuid,${input.serviceDate}::date,${input.closed},${input.slotCapacity??null},${input.note?.trim()||null},${input.active??true})
      ON CONFLICT ("offeringId","serviceDate") DO UPDATE SET "closed"=EXCLUDED."closed","slotCapacity"=EXCLUDED."slotCapacity","note"=EXCLUDED."note","active"=EXCLUDED."active","updatedAt"=CURRENT_TIMESTAMP
      RETURNING *
    `); return rows[0];
  }

  async getProviderReadiness(userId:string){
    const p=await this.operators.resolveProvider(userId);
    const rows=await this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        (SELECT COUNT(*)::int FROM "ServiceOffering" WHERE "providerId"=${p.providerId}::uuid AND "active"=true) AS "activeOfferings",
        (SELECT COUNT(*)::int FROM "ConsumerProviderServiceArea" WHERE "providerId"=${p.providerId}::uuid AND "active"=true) AS "activeServiceAreas",
        (SELECT COUNT(*)::int FROM "ConsumerProviderAgent" WHERE "providerId"=${p.providerId}::uuid AND "active"=true) AS "activeAgents",
        (SELECT COUNT(*)::int FROM "ProviderBookingProposal" WHERE "providerId"=${p.providerId}::uuid AND "status"='PENDING') AS "pendingProposals",
        (SELECT COUNT(*)::int FROM "ConsumerServiceDispute" WHERE "providerId"=${p.providerId}::uuid AND "status" IN ('OPEN','UNDER_REVIEW')) AS "openDisputes",
        (SELECT COUNT(*)::int FROM "ConsumerOfferingAvailabilityWindow" w JOIN "ServiceOffering" o ON o."id"=w."offeringId" WHERE o."providerId"=${p.providerId}::uuid AND w."active"=true) AS "activeAvailabilityWindows"
    `);
    const r=rows[0]??{}; const checks=[
      {key:'CATALOGUE',ready:(r.activeOfferings??0)>0,count:r.activeOfferings??0},
      {key:'COVERAGE',ready:(r.activeServiceAreas??0)>0,count:r.activeServiceAreas??0},
      {key:'AVAILABILITY',ready:(r.activeAvailabilityWindows??0)>0,count:r.activeAvailabilityWindows??0},
      {key:'AGENTS',ready:(r.activeAgents??0)>0,count:r.activeAgents??0},
    ];
    return {...p,checks,ready:checks.every(x=>x.ready),pendingProposals:r.pendingProposals??0,openDisputes:r.openDisputes??0};
  }

  private async appendOfferingEvent(offeringId:string,providerId:string,userId:string,action:string,snapshot:unknown){
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ServiceOfferingProviderEvent" ("id","offeringId","providerId","actorUserId","action","snapshotJson")
      VALUES (${randomUUID()}::uuid,${offeringId}::uuid,${providerId}::uuid,${userId}::uuid,${action},${JSON.stringify(snapshot)}::jsonb)
    `);
  }

  private async assertOwnedOffering(userId:string,offeringId:string){
    const p=await this.operators.resolveProvider(userId);
    const o=await this.prisma.serviceOffering.findFirst({where:{id:offeringId,providerId:p.providerId},select:{id:true}});
    if(!o) throw new NotFoundException('Provider offering not found'); return p;
  }

  private async assertConsumerBooking(userId:string,bookingId:string){
    const rows=await this.prisma.$queryRaw<Array<{id:string;providerId:string;status:ServiceBookingStatus}>>(Prisma.sql`
      SELECT "id","providerId","status" FROM "ConsumerServiceBooking" WHERE "id"=${bookingId}::uuid AND "userId"=${userId}::uuid LIMIT 1
    `);
    if(!rows[0]) throw new NotFoundException('Booking not found'); return rows[0];
  }
}
