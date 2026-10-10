import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProviderVerificationStatus, ServiceBookingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumerAvailabilityService } from './consumer-availability.service';
import { ConsumerProviderOperatorService } from './consumer-provider-operator.service';


type ProviderApplicationRow = {
  id: string; applicantUserId: string; providerId: string | null; businessName: string; contactName: string | null;
  phone: string; email: string | null; description: string | null; requestedCategoryIds: unknown; evidenceRefs: unknown;
  status: string; reviewNote: string | null; reviewedByUserId: string | null; submittedAt: Date | null; reviewedAt: Date | null;
  createdAt: Date; updatedAt: Date; applicantName?: string | null; applicantPhone?: string | null;
};
type OfferingEventRow = { action: string; snapshotJson: unknown; occurredAt: Date };
type BookingProposalRow = {
  id: string; bookingId: string; providerId: string; proposedFrom: Date; proposedUntil: Date; note: string | null;
  status: string; createdByUserId: string; respondedByUserId: string | null; respondedAt: Date | null; createdAt: Date;
};
type ExtraWorkQuoteRow = {
  id:string; bookingId:string; providerId:string; scopeDescription:string;
  amountPaise:string; idempotencyKey:string; status:'PENDING'|'APPROVED'|'DECLINED'|'WITHDRAWN';
  createdByUserId:string; respondedByUserId:string|null; responseReason:string|null;
  createdAt:Date; respondedAt:Date|null;
};
type ConsumerBookingRow = {
  id: string; userId: string; providerId: string; offeringId: string; status: ServiceBookingStatus;
  addressSnapshot: { postalCode?: unknown } | null;
};
type CompletionEvidenceRow = {
  id: string; bookingId: string; providerId: string; actorUserId: string; evidenceType: string;
  reference: string | null; note: string | null; occurredAt: Date;
};
type ServiceDisputeRow = {
  id: string; bookingId: string; userId: string; providerId: string; reasonCode: string; detail: string; status: string;
  resolutionNote: string | null; resolvedByUserId: string | null; resolvedAt: Date | null; createdAt: Date; updatedAt: Date;
  providerName?: string; offeringName?: string;
};
type DisputeEvidenceRow = {
  id:string;disputeId:string;actorType:'RESIDENT'|'PROVIDER';
  note:string;reference:string|null;idempotencyKey?:string;createdAt:Date;
};
type AvailabilityExceptionRow = {
  id: string; offeringId: string; serviceDate: Date; closed: boolean; slotCapacity: number | null; note: string | null;
  active: boolean; createdAt: Date; updatedAt: Date;
};
type ProviderReadinessRow = {
  activeOfferings: number; activeServiceAreas: number; activeAgents: number; pendingProposals: number;
  openDisputes: number; activeAvailabilityWindows: number;
};

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
    const rows=await this.prisma.$queryRaw<ProviderApplicationRow[]>(Prisma.sql`
      SELECT * FROM "ProviderOnboardingApplication" WHERE "applicantUserId"=${userId}::uuid ORDER BY "createdAt" DESC LIMIT 1
    `);
    return rows[0] ?? null;
  }

  async saveMyApplication(userId: string,input: ProviderApplicationInput) {
    const providerMappings=await this.prisma.$queryRaw<Array<{providerId:string}>>(Prisma.sql`
      SELECT "providerId" FROM "ConsumerProviderOperator"
      WHERE "userId"=${userId}::uuid AND "active"=true LIMIT 1
    `);
    if(providerMappings[0]) throw new BadRequestException('User already has an active provider operator mapping');
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
      const rows=await this.prisma.$queryRaw<ProviderApplicationRow[]>(Prisma.sql`
        UPDATE "ProviderOnboardingApplication" SET
          "businessName"=${input.businessName.trim()},"contactName"=${input.contactName?.trim()||null},
          "phone"=${input.phone.trim()},"email"=${input.email?.trim()||null},"description"=${input.description?.trim()||null},
          "requestedCategoryIds"=${JSON.stringify(categories)}::jsonb,"evidenceRefs"=${JSON.stringify(evidence)}::jsonb,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${active[0].id}::uuid RETURNING *
      `); return rows[0];
    }
    const rows=await this.prisma.$queryRaw<ProviderApplicationRow[]>(Prisma.sql`
      INSERT INTO "ProviderOnboardingApplication" ("id","applicantUserId","businessName","contactName","phone","email","description","requestedCategoryIds","evidenceRefs")
      VALUES (${randomUUID()}::uuid,${userId}::uuid,${input.businessName.trim()},${input.contactName?.trim()||null},${input.phone.trim()},${input.email?.trim()||null},
        ${input.description?.trim()||null},${JSON.stringify(categories)}::jsonb,${JSON.stringify(evidence)}::jsonb) RETURNING *
    `); return rows[0];
  }

  async submitMyApplication(userId:string){
    const rows=await this.prisma.$queryRaw<ProviderApplicationRow[]>(Prisma.sql`
      UPDATE "ProviderOnboardingApplication" SET "status"='SUBMITTED',"submittedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
      WHERE "applicantUserId"=${userId}::uuid AND "status"='DRAFT' RETURNING *
    `);
    if(!rows[0]) throw new BadRequestException('A provider application draft is required');
    return rows[0];
  }

  listApplications(status?:string){
    return this.prisma.$queryRaw<ProviderApplicationRow[]>(Prisma.sql`
      SELECT a.*,u."name" AS "applicantName",u."phone" AS "applicantPhone"
      FROM "ProviderOnboardingApplication" a JOIN "User" u ON u."id"=a."applicantUserId"
      WHERE (${status??null}::text IS NULL OR a."status"=${status??null})
      ORDER BY CASE a."status" WHEN 'SUBMITTED' THEN 0 WHEN 'UNDER_REVIEW' THEN 1 ELSE 2 END,a."createdAt" ASC
    `);
  }

  async reviewApplication(reviewerUserId:string,applicationId:string,decision:'APPROVE'|'REJECT',note:string){
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<ProviderApplicationRow[]>(Prisma.sql`SELECT * FROM "ProviderOnboardingApplication" WHERE "id"=${applicationId}::uuid FOR UPDATE`);
      const app=rows[0]; if(!app) throw new NotFoundException('Provider application not found');
      if(!['SUBMITTED','UNDER_REVIEW'].includes(app.status)) throw new BadRequestException('Provider application is not reviewable');
      let providerId:string|null=app.providerId??null;
      if(decision==='APPROVE'&&!providerId){
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${app.applicantUserId}::text))`);
        const activeMappings=await tx.$queryRaw<Array<{providerId:string}>>(Prisma.sql`
          SELECT "providerId" FROM "ConsumerProviderOperator"
          WHERE "userId"=${app.applicantUserId}::uuid AND "active"=true LIMIT 1
        `);
        if(activeMappings[0]) throw new BadRequestException('Applicant already has an active provider operator mapping');
        const provider=await tx.serviceProvider.create({data:{
          businessName:app.businessName,contactName:app.contactName,phone:app.phone,email:app.email,description:app.description,verification:ProviderVerificationStatus.VERIFIED,active:true,
        },select:{id:true}});
        providerId=provider.id;
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "ConsumerProviderOperator" ("id","providerId","userId","active","createdAt","updatedAt")
          VALUES (${randomUUID()}::uuid,${providerId}::uuid,${app.applicantUserId}::uuid,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
          ON CONFLICT ("providerId","userId") DO UPDATE SET "active"=true,"updatedAt"=CURRENT_TIMESTAMP
        `);
      }
      const updated=await tx.$queryRaw<ProviderApplicationRow[]>(Prisma.sql`
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
    return this.prisma.$queryRaw<OfferingEventRow[]>(Prisma.sql`SELECT "action","snapshotJson","occurredAt" FROM "ServiceOfferingProviderEvent" WHERE "offeringId"=${offeringId}::uuid ORDER BY "occurredAt" DESC`);
  }

  async proposeBookingTime(userId:string,bookingId:string,proposedFrom:Date,proposedUntil:Date,note?:string){
    if(!Number.isFinite(proposedFrom.getTime())||!Number.isFinite(proposedUntil.getTime())||
        proposedFrom<=new Date()||proposedUntil<=proposedFrom) {
      throw new BadRequestException('Proposed service window is invalid');
    }
    const provider=await this.operators.resolveProvider(userId);
    try {
      return await this.prisma.$transaction(async tx=>{
        // Serialize with resident acceptance and booking cancellation. Both
        // paths already lock the same booking row before changing its state.
        const rows=await tx.$queryRaw<Array<{id:string;status:ServiceBookingStatus}>>(Prisma.sql`
          SELECT "id","status" FROM "ConsumerServiceBooking"
          WHERE "id"=${bookingId}::uuid AND "providerId"=${provider.providerId}::uuid FOR UPDATE
        `);
        if(!rows[0]) throw new NotFoundException('Provider booking not found');
        if(rows[0].status!==ServiceBookingStatus.REQUESTED) {
          throw new BadRequestException('Only requested bookings can receive a provider counter-proposal');
        }
        const pending=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
          SELECT "id" FROM "ProviderBookingProposal"
          WHERE "bookingId"=${bookingId}::uuid AND "status"='PENDING' LIMIT 1
        `);
        if(pending.length) throw new BadRequestException('A pending proposal already exists for this booking');
        const inserted=await tx.$queryRaw<BookingProposalRow[]>(Prisma.sql`
          INSERT INTO "ProviderBookingProposal"
            ("id","bookingId","providerId","proposedFrom","proposedUntil","note","createdByUserId")
          VALUES (${randomUUID()}::uuid,${bookingId}::uuid,${provider.providerId}::uuid,
            ${proposedFrom},${proposedUntil},${note?.trim()||null},${userId}::uuid)
          RETURNING *
        `);
        return inserted[0];
      });
    } catch(error) {
      // Do not mask authorization, database errors or status-transition faults.
      if(typeof error==='object' && error!==null && 'code' in error &&
          String((error as {code?:unknown}).code)==='23505') {
        throw new BadRequestException('A pending proposal already exists for this booking');
      }
      throw error;
    }
  }

  async listConsumerProposals(userId:string,bookingId:string){
    await this.assertConsumerBooking(userId,bookingId);
    return this.prisma.$queryRaw<BookingProposalRow[]>(Prisma.sql`SELECT * FROM "ProviderBookingProposal" WHERE "bookingId"=${bookingId}::uuid ORDER BY "createdAt" DESC`);
  }

  async respondToProposal(userId:string,bookingId:string,proposalId:string,decision:'ACCEPT'|'REJECT',reason?:string){
    const normalizedReason=reason?.trim()??'';
    if(decision==='REJECT'&&(normalizedReason.length<3||normalizedReason.length>500)){
      throw new BadRequestException('Proposal rejection reason must be between 3 and 500 characters');
    }
    return this.prisma.$transaction(async tx=>{
      const bookingRows=await tx.$queryRaw<ConsumerBookingRow[]>(Prisma.sql`
        SELECT "id","userId","providerId","offeringId","status","addressSnapshot" FROM "ConsumerServiceBooking"
        WHERE "id"=${bookingId}::uuid AND "userId"=${userId}::uuid FOR UPDATE
      `);
      const booking=bookingRows[0]; if(!booking) throw new NotFoundException('Booking not found');
      if(booking.status!==ServiceBookingStatus.REQUESTED) throw new BadRequestException('Booking is no longer awaiting provider confirmation');
      const proposalRows=await tx.$queryRaw<BookingProposalRow[]>(Prisma.sql`
        SELECT * FROM "ProviderBookingProposal" WHERE "id"=${proposalId}::uuid AND "bookingId"=${bookingId}::uuid AND "status"='PENDING' FOR UPDATE
      `);
      const proposal=proposalRows[0]; if(!proposal) throw new NotFoundException('Pending proposal not found');
      if(decision==='ACCEPT'){
        const postalCode=booking.addressSnapshot?.postalCode;
        if(typeof postalCode!=='string') throw new BadRequestException('Booking delivery postal code is unavailable');
        await this.availability.lockAndAssertBookable(tx,booking.offeringId,booking.providerId,postalCode,new Date(proposal.proposedFrom),new Date(proposal.proposedUntil),bookingId);
        await tx.$executeRaw(Prisma.sql`
          UPDATE "ConsumerServiceBooking" SET "scheduledFrom"=${proposal.proposedFrom},"scheduledUntil"=${proposal.proposedUntil},"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${bookingId}::uuid
        `);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "ConsumerServiceBookingEvent" ("id","bookingId","actorUserId","action","fromStatus","toStatus","occurredAt")
          VALUES (${randomUUID()}::uuid,${bookingId}::uuid,${userId}::uuid,'CUSTOMER_ACCEPTED_PROVIDER_PROPOSAL',
            ${ServiceBookingStatus.REQUESTED}::"ServiceBookingStatus",${ServiceBookingStatus.REQUESTED}::"ServiceBookingStatus",CURRENT_TIMESTAMP)
        `);
      }else{
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "ConsumerServiceBookingEvent" ("id","bookingId","actorUserId","action","fromStatus","toStatus","note","occurredAt")
          VALUES (${randomUUID()}::uuid,${bookingId}::uuid,${userId}::uuid,'CUSTOMER_REJECTED_PROVIDER_PROPOSAL',
            ${ServiceBookingStatus.REQUESTED}::"ServiceBookingStatus",${ServiceBookingStatus.REQUESTED}::"ServiceBookingStatus",${normalizedReason},CURRENT_TIMESTAMP)
        `);
      }
      const updated=await tx.$queryRaw<BookingProposalRow[]>(Prisma.sql`
        UPDATE "ProviderBookingProposal" SET "status"=${decision==='ACCEPT'?'ACCEPTED':'REJECTED'},"respondedByUserId"=${userId}::uuid,"respondedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${proposalId}::uuid RETURNING *
      `); return updated[0];
    });
  }


  async proposeExtraWorkQuote(userId:string,bookingId:string,scope:string,amountPaise:number,idempotencyKey:string){
    const description=scope.trim(),key=idempotencyKey?.trim();
    if(!key||key.length<8||key.length>120){
      throw new BadRequestException('Extra work quote idempotency key must be between 8 and 120 characters');
    }
    if(description.length<10||description.length>1500){
      throw new BadRequestException('Extra work scope must be between 10 and 1500 characters');
    }
    if(!Number.isSafeInteger(amountPaise)||amountPaise<=0||amountPaise>100_000_000){
      throw new BadRequestException('Extra work amount must be a positive safe whole number of paise within the limit');
    }
    const provider=await this.operators.resolveProvider(userId);
    return this.prisma.$transaction(async tx=>{
      const bookings=await tx.$queryRaw<Array<{id:string;status:ServiceBookingStatus}>>(Prisma.sql`
        SELECT "id","status" FROM "ConsumerServiceBooking"
        WHERE "id"=${bookingId}::uuid AND "providerId"=${provider.providerId}::uuid FOR UPDATE
      `);
      if(!bookings.length)throw new NotFoundException('Provider booking not found');
      // Retry identity remains valid after APPROVE/DECLINE and booking closure.
      const existing=await tx.$queryRaw<ExtraWorkQuoteRow[]>(Prisma.sql`
        SELECT "id","bookingId","providerId","scopeDescription","idempotencyKey",
          "amountPaise"::text AS "amountPaise","status","createdByUserId",
          "respondedByUserId","responseReason","createdAt","respondedAt"
        FROM "ConsumerServiceExtraWorkQuote"
        WHERE "bookingId"=${bookingId}::uuid AND "idempotencyKey"=${key} LIMIT 1
      `);
      if(existing.length){
        if(existing[0].scopeDescription!==description||existing[0].amountPaise!==String(amountPaise)){
          throw new ConflictException('Quote retry identity is already bound to different scope or amount');
        }
        return existing[0];
      }
      if(bookings[0].status!==ServiceBookingStatus.IN_PROGRESS){
        throw new BadRequestException('Extra work quotes require a service already in progress');
      }
      const pending=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        SELECT "id" FROM "ConsumerServiceExtraWorkQuote"
        WHERE "bookingId"=${bookingId}::uuid AND "status"='PENDING' LIMIT 1
      `);
      if(pending.length)throw new ConflictException('Respond to the pending extra work quote before creating another');
      const created=await tx.$queryRaw<ExtraWorkQuoteRow[]>(Prisma.sql`
        INSERT INTO "ConsumerServiceExtraWorkQuote"
          ("id","bookingId","providerId","scopeDescription","amountPaise","idempotencyKey","createdByUserId")
        VALUES (${randomUUID()}::uuid,${bookingId}::uuid,${provider.providerId}::uuid,
          ${description},${amountPaise},${key},${userId}::uuid)
        RETURNING "id","bookingId","providerId","scopeDescription","idempotencyKey",
          "amountPaise"::text AS "amountPaise","status","createdByUserId",
          "respondedByUserId","responseReason","createdAt","respondedAt"
      `);
      return created[0];
    });
  }


  // A provider may retract an unaccepted quotation, including after the booking
  // closes. Never retract a resident-approved/declined quote. Lock the same
  // booking row used by the resident decision before checking the quote state.
  async withdrawExtraWorkQuote(userId:string,bookingId:string,quoteId:string,reason:string){
    const normalizedReason=reason?.trim()??'';
    if(normalizedReason.length<3||normalizedReason.length>500){
      throw new BadRequestException('Quote withdrawal reason must be between 3 and 500 characters');
    }
    const provider=await this.operators.resolveProvider(userId);
    return this.prisma.$transaction(async tx=>{
      const bookings=await tx.$queryRaw<Array<{id:string;status:ServiceBookingStatus}>>(Prisma.sql`
        SELECT "id","status" FROM "ConsumerServiceBooking"
        WHERE "id"=${bookingId}::uuid AND "providerId"=${provider.providerId}::uuid
        FOR UPDATE
      `);
      if(!bookings.length)throw new NotFoundException('Provider booking not found');
      const quotes=await tx.$queryRaw<ExtraWorkQuoteRow[]>(Prisma.sql`
        SELECT "id","bookingId","providerId","scopeDescription","idempotencyKey",
          "amountPaise"::text AS "amountPaise","status","createdByUserId",
          "respondedByUserId","responseReason","createdAt","respondedAt"
        FROM "ConsumerServiceExtraWorkQuote"
        WHERE "id"=${quoteId}::uuid AND "bookingId"=${bookingId}::uuid
          AND "providerId"=${provider.providerId}::uuid
        FOR UPDATE
      `);
      const quote=quotes[0];
      if(!quote)throw new NotFoundException('Provider quotation not found');
      if(quote.status==='WITHDRAWN'){
        if(quote.responseReason!==normalizedReason){
          throw new ConflictException('Withdrawal retry must retain the original reason');
        }
        return quote; // Lost-response recovery: immutable original receipt.
      }
      if(quote.status!=='PENDING'){
        throw new ConflictException('Resident-decided quotations cannot be withdrawn');
      }
      const changed=await tx.$queryRaw<ExtraWorkQuoteRow[]>(Prisma.sql`
        UPDATE "ConsumerServiceExtraWorkQuote"
        SET "status"='WITHDRAWN',"respondedByUserId"=${userId}::uuid,
          "responseReason"=${normalizedReason},"respondedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${quoteId}::uuid AND "bookingId"=${bookingId}::uuid
          AND "providerId"=${provider.providerId}::uuid AND "status"='PENDING'
        RETURNING "id","bookingId","providerId","scopeDescription","idempotencyKey",
          "amountPaise"::text AS "amountPaise","status","createdByUserId",
          "respondedByUserId","responseReason","createdAt","respondedAt"
      `);
      if(!changed.length)throw new ConflictException('Quotation decision changed concurrently');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ConsumerServiceBookingEvent"
          ("id","bookingId","actorUserId","action","fromStatus","toStatus","note","occurredAt")
        VALUES (${randomUUID()}::uuid,${bookingId}::uuid,${userId}::uuid,
          'PROVIDER_WITHDREW_EXTRA_WORK_QUOTE',
          ${bookings[0].status}::"ServiceBookingStatus",
          ${bookings[0].status}::"ServiceBookingStatus",
          ${`Quote ${quoteId}: ${normalizedReason}`},CURRENT_TIMESTAMP)
      `);
      // Reversal of consent is not possible. No booking price/payment changes.
      return changed[0];
    });
  }

  async listProviderExtraWorkQuotes(userId:string,bookingId:string){
    const provider=await this.operators.resolveProvider(userId);
    const bookings=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM "ConsumerServiceBooking" WHERE "id"=${bookingId}::uuid
        AND "providerId"=${provider.providerId}::uuid LIMIT 1
    `);
    if(!bookings.length)throw new NotFoundException('Provider booking not found');
    return this.prisma.$queryRaw<ExtraWorkQuoteRow[]>(Prisma.sql`
      SELECT "id","bookingId","providerId","scopeDescription","amountPaise"::text AS "amountPaise",
        "status","createdByUserId","respondedByUserId","responseReason","createdAt","respondedAt"
      FROM "ConsumerServiceExtraWorkQuote" WHERE "bookingId"=${bookingId}::uuid
        AND "providerId"=${provider.providerId}::uuid ORDER BY "createdAt" DESC,"id" DESC LIMIT 30
    `);
  }

  async listConsumerExtraWorkQuotes(userId:string,bookingId:string){
    await this.assertConsumerBooking(userId,bookingId);
    return this.prisma.$queryRaw<ExtraWorkQuoteRow[]>(Prisma.sql`
      SELECT "id","bookingId","scopeDescription","amountPaise"::text AS "amountPaise",
        "status","respondedByUserId","responseReason","createdAt","respondedAt"
      FROM "ConsumerServiceExtraWorkQuote"
      WHERE "bookingId"=${bookingId}::uuid ORDER BY "createdAt" DESC,"id" DESC LIMIT 30
    `);
  }

  async respondToExtraWorkQuote(userId:string,bookingId:string,quoteId:string,
    decision:'APPROVE'|'DECLINE',reason?:string){
    const normalizedReason=reason?.trim()??'';
    if(decision==='DECLINE'&&(normalizedReason.length<3||normalizedReason.length>500)){
      throw new BadRequestException('Declining an extra work quote requires a reason between 3 and 500 characters');
    }
    return this.prisma.$transaction(async tx=>{
      const booking=await tx.$queryRaw<Array<{id:string;status:ServiceBookingStatus}>>(Prisma.sql`
        SELECT "id","status" FROM "ConsumerServiceBooking" WHERE "id"=${bookingId}::uuid
          AND "userId"=${userId}::uuid FOR UPDATE
      `);
      if(!booking.length)throw new NotFoundException('Booking not found');
      // Lock the original booking first, then the quote (the same lock order as
      // provider withdrawal). Check saved consent before booking status: a
      // response may have been lost just before the service was completed.
      const quote=await tx.$queryRaw<ExtraWorkQuoteRow[]>(Prisma.sql`
        SELECT "id","bookingId","providerId","scopeDescription",
          "amountPaise"::text AS "amountPaise","status","createdByUserId",
          "respondedByUserId","responseReason","createdAt","respondedAt"
        FROM "ConsumerServiceExtraWorkQuote"
        WHERE "id"=${quoteId}::uuid AND "bookingId"=${bookingId}::uuid FOR UPDATE
      `);
      if(!quote.length)throw new NotFoundException('Extra work quote not found');
      const status=decision==='APPROVE'?'APPROVED':'DECLINED';
      if(quote[0].status!=='PENDING'){
        if(quote[0].status===status && quote[0].respondedByUserId===userId &&
          (decision==='APPROVE' ? quote[0].responseReason==null
            : quote[0].responseReason===normalizedReason)){
          return quote[0]; // Exact lost-response recovery; no duplicate event.
        }
        throw new ConflictException('Extra work quote has already been decided or withdrawn');
      }
      if(booking[0].status!==ServiceBookingStatus.IN_PROGRESS){
        throw new BadRequestException('Extra work quote cannot be decided after service is no longer in progress');
      }
      const changed=await tx.$queryRaw<ExtraWorkQuoteRow[]>(Prisma.sql`
        UPDATE "ConsumerServiceExtraWorkQuote" SET "status"=${status},
          "respondedByUserId"=${userId}::uuid,
          "responseReason"=${decision==='DECLINE'?normalizedReason:null},
          "respondedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${quoteId}::uuid AND "bookingId"=${bookingId}::uuid
          AND "status"='PENDING'
        RETURNING "id","bookingId","providerId","scopeDescription",
          "amountPaise"::text AS "amountPaise","status","createdByUserId",
          "respondedByUserId","responseReason","createdAt","respondedAt"
      `);
      if(!changed.length)throw new ConflictException('Extra work quote was already decided');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ConsumerServiceBookingEvent"
          ("id","bookingId","actorUserId","action","fromStatus","toStatus","note","occurredAt")
        VALUES (${randomUUID()}::uuid,${bookingId}::uuid,${userId}::uuid,
          ${decision==='APPROVE'?'CUSTOMER_APPROVED_EXTRA_WORK_QUOTE':'CUSTOMER_DECLINED_EXTRA_WORK_QUOTE'},
          ${ServiceBookingStatus.IN_PROGRESS}::"ServiceBookingStatus",
          ${ServiceBookingStatus.IN_PROGRESS}::"ServiceBookingStatus",
          ${`Quote ${quoteId}: ${decision==='APPROVE'?quote[0].amountPaise+' paise explicitly approved':normalizedReason}`},CURRENT_TIMESTAMP)
      `);
      // Consent is not settlement: original booking price and Payment records
      // are intentionally untouched. Charging requires a separate authorized flow.
      return changed[0];
    });
  }


  // A resident initiates a *separate bill request*, not a payment intent.
  // Lock booking then quote to serialize with approval/withdrawal; one immutable
  // request per consented quote makes lost-response retries safe.
  async requestExtraWorkBill(userId:string,bookingId:string,quoteId:string){
    return this.prisma.$transaction(async tx=>{
      const bookings=await tx.$queryRaw<Array<{id:string;status:ServiceBookingStatus}>>(Prisma.sql`
        SELECT "id","status" FROM "ConsumerServiceBooking"
        WHERE "id"=${bookingId}::uuid AND "userId"=${userId}::uuid FOR UPDATE
      `);
      if(!bookings[0])throw new NotFoundException('Booking not found');
      const quotes=await tx.$queryRaw<Array<{id:string;providerId:string;status:string;respondedByUserId:string|null;amountPaise:string}>>(Prisma.sql`
        SELECT "id","providerId","status","respondedByUserId","amountPaise"::text AS "amountPaise"
        FROM "ConsumerServiceExtraWorkQuote"
        WHERE "id"=${quoteId}::uuid AND "bookingId"=${bookingId}::uuid FOR UPDATE
      `);
      const quote=quotes[0];
      if(!quote||quote.status!=='APPROVED'||quote.respondedByUserId!==userId)
        throw new BadRequestException('Only your expressly approved extra-work quote can be billed separately');
      const existing=await tx.$queryRaw<Array<{id:string;bookingId:string;quoteId:string;userId:string;amountPaise:string;status:string}>>(Prisma.sql`
        SELECT "id","bookingId","quoteId","userId","amountPaise"::text AS "amountPaise","status"
        FROM "ConsumerServiceExtraWorkBillingRequest"
        WHERE "quoteId"=${quoteId}::uuid AND "bookingId"=${bookingId}::uuid FOR UPDATE
      `);
      if(existing[0]){
        if(existing[0].userId!==userId||existing[0].amountPaise!==quote.amountPaise)
          throw new ConflictException('Separate bill request evidence conflicts with approved quote');
        return existing[0]; // No duplicate timeline event on lost response.
      }
      if(bookings[0].status===ServiceBookingStatus.CANCELLED)
        throw new BadRequestException('Cancelled booking cannot request extra-work billing');
      const rows=await tx.$queryRaw<Array<{id:string;bookingId:string;quoteId:string;userId:string;amountPaise:string;status:string}>>(Prisma.sql`
        INSERT INTO "ConsumerServiceExtraWorkBillingRequest"
          ("id","bookingId","quoteId","userId","providerId","amountPaise")
        VALUES (${randomUUID()}::uuid,${bookingId}::uuid,${quoteId}::uuid,${userId}::uuid,
          ${quote.providerId}::uuid,${BigInt(quote.amountPaise)})
        RETURNING "id","bookingId","quoteId","userId","amountPaise"::text AS "amountPaise","status"
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ConsumerServiceBookingEvent"
          ("id","bookingId","actorUserId","action","fromStatus","toStatus","note","occurredAt")
        VALUES (${randomUUID()}::uuid,${bookingId}::uuid,${userId}::uuid,
          'RESIDENT_REQUESTED_EXTRA_WORK_BILL',
          ${bookings[0].status}::"ServiceBookingStatus",
          ${bookings[0].status}::"ServiceBookingStatus",
          ${`Quote ${quoteId}: separate bill requested; no payment or invoice issued`},CURRENT_TIMESTAMP)
      `);
      return rows[0];
    });
  }

  async listConsumerExtraWorkBillRequests(userId:string,bookingId:string){
    await this.assertConsumerBooking(userId,bookingId);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT "id","bookingId","quoteId","amountPaise"::text AS "amountPaise","status","createdAt"
      FROM "ConsumerServiceExtraWorkBillingRequest"
      WHERE "bookingId"=${bookingId}::uuid AND "userId"=${userId}::uuid
      ORDER BY "createdAt" DESC,"id" DESC LIMIT 100
    `);
  }

  async listProviderExtraWorkBillRequests(userId:string,bookingId:string){
    const provider=await this.operators.resolveProvider(userId);
    const booking=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM "ConsumerServiceBooking"
      WHERE "id"=${bookingId}::uuid AND "providerId"=${provider.providerId}::uuid LIMIT 1
    `);
    if(!booking[0])throw new NotFoundException('Provider booking not found');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT r."id",r."bookingId",r."quoteId",r."amountPaise"::text AS "amountPaise",
        r."status",r."createdAt"
      FROM "ConsumerServiceExtraWorkBillingRequest" r
      WHERE r."bookingId"=${bookingId}::uuid AND r."providerId"=${provider.providerId}::uuid
      ORDER BY r."createdAt" DESC,r."id" DESC LIMIT 100
    `);
  }

  async addCompletionEvidence(userId:string,bookingId:string,evidenceType:'NOTE'|'REFERENCE',reference?:string,note?:string){
    const provider=await this.operators.resolveProvider(userId);
    const rows=await this.prisma.$queryRaw<Array<{id:string;status:ServiceBookingStatus}>>(Prisma.sql`
      SELECT "id","status" FROM "ConsumerServiceBooking" WHERE "id"=${bookingId}::uuid AND "providerId"=${provider.providerId}::uuid LIMIT 1
    `);
    if(!rows[0]) throw new NotFoundException('Provider booking not found');
    if(rows[0].status!==ServiceBookingStatus.IN_PROGRESS&&rows[0].status!==ServiceBookingStatus.COMPLETED) throw new BadRequestException('Completion evidence requires an in-progress or completed booking');
    if(evidenceType==='REFERENCE'&&!reference?.trim()) throw new BadRequestException('Reference evidence requires a reference');
    const result=await this.prisma.$queryRaw<CompletionEvidenceRow[]>(Prisma.sql`
      INSERT INTO "ConsumerServiceCompletionEvidence" ("id","bookingId","providerId","actorUserId","evidenceType","reference","note")
      VALUES (${randomUUID()}::uuid,${bookingId}::uuid,${provider.providerId}::uuid,${userId}::uuid,${evidenceType},${reference?.trim()||null},${note?.trim()||null}) RETURNING *
    `); return result[0];
  }

  async listConsumerEvidence(userId:string,bookingId:string){
    await this.assertConsumerBooking(userId,bookingId);
    return this.prisma.$queryRaw<CompletionEvidenceRow[]>(Prisma.sql`
      SELECT "id","bookingId","providerId","actorUserId","evidenceType","reference","note","occurredAt" FROM "ConsumerServiceCompletionEvidence" WHERE "bookingId"=${bookingId}::uuid ORDER BY "occurredAt" ASC
    `);
  }

  async openDispute(userId:string,bookingId:string,reasonCode:string,detail:string){
    const booking=await this.assertConsumerBooking(userId,bookingId);
    if(booking.status!==ServiceBookingStatus.IN_PROGRESS&&booking.status!==ServiceBookingStatus.COMPLETED) throw new BadRequestException('A dispute can be opened only after service has started');
    try{
      const rows=await this.prisma.$queryRaw<ServiceDisputeRow[]>(Prisma.sql`
        INSERT INTO "ConsumerServiceDispute" ("id","bookingId","userId","providerId","reasonCode","detail")
        VALUES (${randomUUID()}::uuid,${bookingId}::uuid,${userId}::uuid,${booking.providerId}::uuid,${reasonCode.trim()},${detail.trim()}) RETURNING *
      `); return rows[0];
    }catch{throw new BadRequestException('An open dispute already exists for this booking');}
  }

  async listConsumerDisputes(userId:string,bookingId:string){
    // Check consumer ownership before returning any case history or notes.
    await this.assertConsumerBooking(userId,bookingId);
    return this.prisma.$queryRaw<ServiceDisputeRow[]>(Prisma.sql`
      SELECT "id","bookingId","reasonCode","detail","status","resolutionNote",
             "resolvedAt","createdAt","updatedAt"
      FROM "ConsumerServiceDispute"
      WHERE "bookingId"=${bookingId}::uuid AND "userId"=${userId}::uuid
      ORDER BY "createdAt" DESC,"id" DESC LIMIT 30
    `);
  }


  /** Every read and write is authorized against the original dispute owner. */
  async listDisputeEvidence(userId:string,disputeId:string,actorType:'RESIDENT'|'PROVIDER',bookingId?:string){
    const provider=actorType==='PROVIDER'?await this.operators.resolveProvider(userId):null;
    const disputes=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM "ConsumerServiceDispute"
      WHERE "id"=${disputeId}::uuid
        ${actorType==='RESIDENT'
          ?Prisma.sql`AND "userId"=${userId}::uuid AND "bookingId"=${bookingId}::uuid`
          :Prisma.sql`AND "providerId"=${provider!.providerId}::uuid`}
      LIMIT 1
    `);
    if(!disputes.length)throw new NotFoundException('Service dispute not found');
    return this.prisma.$queryRaw<DisputeEvidenceRow[]>(Prisma.sql`
      SELECT "id","disputeId","actorType","note","reference","createdAt"
      FROM "ConsumerServiceDisputeEvidence" WHERE "disputeId"=${disputeId}::uuid
      ORDER BY "createdAt" DESC,"id" DESC LIMIT 100
    `);
  }

  async addDisputeEvidence(userId:string,disputeId:string,actorType:'RESIDENT'|'PROVIDER',
    note:string,idempotencyKey:string,reference?:string,bookingId?:string){
    const normalizedNote=note?.trim()??'';
    const normalizedReference=reference?.trim()||null;
    const key=idempotencyKey?.trim()??'';
    if(normalizedNote.length<5||normalizedNote.length>2000)
      throw new BadRequestException('Evidence note must be 5–2000 characters');
    if(normalizedReference && normalizedReference.length>400)
      throw new BadRequestException('Evidence reference must be at most 400 characters');
    if(key.length<8||key.length>120)
      throw new BadRequestException('Evidence retry identity must be 8–120 characters');
    const provider=actorType==='PROVIDER'?await this.operators.resolveProvider(userId):null;
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`
        SELECT "id","status" FROM "ConsumerServiceDispute"
        WHERE "id"=${disputeId}::uuid
          ${actorType==='RESIDENT'
            ?Prisma.sql`AND "userId"=${userId}::uuid AND "bookingId"=${bookingId}::uuid`
            :Prisma.sql`AND "providerId"=${provider!.providerId}::uuid`}
        FOR UPDATE
      `);
      if(!rows.length)throw new NotFoundException('Service dispute not found');
      const previous=await tx.$queryRaw<DisputeEvidenceRow[]>(Prisma.sql`
        SELECT "id","disputeId","actorType","note","reference","idempotencyKey","createdAt"
        FROM "ConsumerServiceDisputeEvidence" WHERE "disputeId"=${disputeId}::uuid
          AND "actorUserId"=${userId}::uuid AND "idempotencyKey"=${key} LIMIT 1
      `);
      if(previous.length){
        if(previous[0].note!==normalizedNote||previous[0].reference!==normalizedReference||
           previous[0].actorType!==actorType)
          throw new ConflictException('Evidence retry identity is bound to another note');
        return previous[0]; // Exact replay, even if case closed after submission.
      }
      if(!['OPEN','UNDER_REVIEW'].includes(rows[0].status))
        throw new BadRequestException('Evidence can be added only while a dispute is open');
      const created=await tx.$queryRaw<DisputeEvidenceRow[]>(Prisma.sql`
        INSERT INTO "ConsumerServiceDisputeEvidence"
          ("id","disputeId","actorUserId","actorType","note","reference","idempotencyKey")
        VALUES (${randomUUID()}::uuid,${disputeId}::uuid,${userId}::uuid,
          ${actorType},${normalizedNote},${normalizedReference},${key})
        RETURNING "id","disputeId","actorType","note","reference","createdAt"
      `);
      return created[0];
    });
  }

  async listPlatformDisputeEvidence(disputeId:string){
    const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM "ConsumerServiceDispute" WHERE "id"=${disputeId}::uuid LIMIT 1
    `);
    if(!rows.length)throw new NotFoundException('Service dispute not found');
    return this.prisma.$queryRaw<DisputeEvidenceRow[]>(Prisma.sql`
      SELECT "id","disputeId","actorType","note","reference","createdAt"
      FROM "ConsumerServiceDisputeEvidence" WHERE "disputeId"=${disputeId}::uuid
      ORDER BY "createdAt" DESC,"id" DESC LIMIT 100
    `);
  }

  async listMyDisputes(userId:string){
    const provider=await this.operators.resolveProvider(userId);
    return this.prisma.$queryRaw<ServiceDisputeRow[]>(Prisma.sql`SELECT * FROM "ConsumerServiceDispute" WHERE "providerId"=${provider.providerId}::uuid ORDER BY "createdAt" DESC`);
  }

  listPlatformDisputes(status?:string){
    return this.prisma.$queryRaw<ServiceDisputeRow[]>(Prisma.sql`
      SELECT d.*,p."businessName" AS "providerName",o."name" AS "offeringName"
      FROM "ConsumerServiceDispute" d JOIN "ConsumerServiceBooking" b ON b."id"=d."bookingId"
      JOIN "ServiceProvider" p ON p."id"=d."providerId" JOIN "ServiceOffering" o ON o."id"=b."offeringId"
      WHERE (${status??null}::text IS NULL OR d."status"=${status??null}) ORDER BY d."createdAt" DESC
    `);
  }

  async resolveDispute(reviewerUserId:string,disputeId:string,status:'RESOLVED'|'DISMISSED',resolutionNote:string){
    const rows=await this.prisma.$queryRaw<ServiceDisputeRow[]>(Prisma.sql`
      UPDATE "ConsumerServiceDispute" SET "status"=${status},"resolutionNote"=${resolutionNote.trim()},"resolvedByUserId"=${reviewerUserId}::uuid,
        "resolvedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${disputeId}::uuid AND "status" IN ('OPEN','UNDER_REVIEW') RETURNING *
    `);
    if(!rows[0]) throw new NotFoundException('Open dispute not found'); return rows[0];
  }

  async listAvailabilityExceptions(userId:string,offeringId:string){
    await this.assertOwnedOffering(userId,offeringId);
    return this.prisma.$queryRaw<AvailabilityExceptionRow[]>(Prisma.sql`SELECT * FROM "ConsumerOfferingAvailabilityException" WHERE "offeringId"=${offeringId}::uuid ORDER BY "serviceDate" ASC`);
  }

  async setAvailabilityException(userId:string,offeringId:string,input:AvailabilityExceptionInput){
    await this.assertOwnedOffering(userId,offeringId);
    const serviceDate=input.serviceDate.slice(0,10);
    const d=new Date(`${serviceDate}T00:00:00.000Z`); if(Number.isNaN(d.getTime())) throw new BadRequestException('Invalid service date');
    if(!input.closed && input.slotCapacity===undefined) throw new BadRequestException('Open date override requires slot capacity');
    const rows=await this.prisma.$queryRaw<AvailabilityExceptionRow[]>(Prisma.sql`
      INSERT INTO "ConsumerOfferingAvailabilityException" ("id","offeringId","serviceDate","closed","slotCapacity","note","active")
      VALUES (${randomUUID()}::uuid,${offeringId}::uuid,${serviceDate}::date,${input.closed},${input.slotCapacity??null},${input.note?.trim()||null},${input.active??true})
      ON CONFLICT ("offeringId","serviceDate") DO UPDATE SET "closed"=EXCLUDED."closed","slotCapacity"=EXCLUDED."slotCapacity","note"=EXCLUDED."note","active"=EXCLUDED."active","updatedAt"=CURRENT_TIMESTAMP
      RETURNING *
    `); return rows[0];
  }

  async getProviderReadiness(userId:string){
    const p=await this.operators.resolveProvider(userId);
    const rows=await this.prisma.$queryRaw<ProviderReadinessRow[]>(Prisma.sql`
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
