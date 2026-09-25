import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type PrivacyCase = {
  id:string;
  societyId:string|null;
  subjectUserId:string;
  requestType:'ACCESS'|'CORRECTION'|'ERASURE'|'OTHER';
  status:'OPEN'|'IN_REVIEW'|'WAITING'|'COMPLETED'|'REJECTED'|'CANCELLED';
  legalHold:boolean;
  retentionDecision:'ALLOW'|'BLOCK'|null;
};

@Injectable()
export class PrivacySubjectDataService {
  constructor(private readonly prisma:PrismaService){}

  async exportMine(userId:string,societyId:string|undefined,caseId:string){
    const privacyCase=await this.subjectCase(userId,societyId,caseId);
    if(privacyCase.requestType!=='ACCESS') throw new BadRequestException('Only completed ACCESS requests can generate a data export');
    if(privacyCase.status!=='COMPLETED') throw new BadRequestException('Data export becomes available after the ACCESS request is completed');

    const [account,relationships,access,helpdesk,services,payments,privacyRequests,consumerHomes,consumerBookings,providerApplications,bookingProposals,completionEvidence,serviceDisputes,offeringEvents]=await Promise.all([
      this.prisma.$queryRaw(Prisma.sql`
        SELECT "id","phone","email","name","status","createdAt","updatedAt"
        FROM "User" WHERE "id"=${userId}::uuid LIMIT 1
      `),
      societyId?this.prisma.$queryRaw(Prisma.sql`
        SELECT
          (SELECT COALESCE(jsonb_agg(jsonb_build_object('role',"role",'active',"active",'createdAt',"createdAt")),'[]'::jsonb)
             FROM "SocietyMembership" WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid) AS memberships,
          (SELECT COALESCE(jsonb_agg(jsonb_build_object('unitId',"unitId",'verified',"verified",'active',"active",'effectiveFrom',"effectiveFrom",'effectiveTo',"effectiveTo")),'[]'::jsonb)
             FROM "UnitOwnership" WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid) AS ownerships,
          (SELECT COALESCE(jsonb_agg(jsonb_build_object('unitId',"unitId",'relation',"relation",'active',"active",'effectiveFrom',"effectiveFrom",'effectiveTo',"effectiveTo")),'[]'::jsonb)
             FROM "UnitOccupancy" WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid) AS occupancies
      `):Promise.resolve([]),
      societyId?this.prisma.$queryRaw(Prisma.sql`
        SELECT "id","unitId","subjectType","subjectName","subjectPhone","purpose","status","validFrom","validUntil","enteredAt","exitedAt","createdAt","updatedAt"
        FROM "AccessRequest" WHERE "societyId"=${societyId}::uuid AND "requestedById"=${userId}::uuid
        ORDER BY "createdAt" DESC LIMIT 1000
      `):Promise.resolve([]),
      societyId?this.prisma.$queryRaw(Prisma.sql`
        SELECT "id","unitId","title","description","category","priority","status","resolvedAt","closedAt","createdAt","updatedAt"
        FROM "HelpdeskTicket" WHERE "societyId"=${societyId}::uuid AND "createdById"=${userId}::uuid
        ORDER BY "createdAt" DESC LIMIT 1000
      `):Promise.resolve([]),
      societyId?this.prisma.$queryRaw(Prisma.sql`
        SELECT "id","unitId","providerId","offeringId","status","scheduledFrom","scheduledUntil","servicePricePaise","commissionPaise","notes","createdAt","updatedAt"
        FROM "ServiceBooking" WHERE "societyId"=${societyId}::uuid AND "residentUserId"=${userId}::uuid
        ORDER BY "createdAt" DESC LIMIT 1000
      `):Promise.resolve([]),
      societyId?this.prisma.$queryRaw(Prisma.sql`
        SELECT p."id",p."invoiceId",p."amountPaise",p."status",p."provider",p."createdAt",p."completedAt"
        FROM "Payment" p WHERE p."societyId"=${societyId}::uuid AND p."payerUserId"=${userId}::uuid
        ORDER BY p."createdAt" DESC LIMIT 1000
      `):Promise.resolve([]),
      this.prisma.$queryRaw(Prisma.sql`
        SELECT "id","societyId","requestType","status","requestSummary","legalHold","retentionDecision","dueAt","closedAt","createdAt","updatedAt"
        FROM "PrivacyRequestCase" WHERE "subjectUserId"=${userId}::uuid
          AND "societyId" IS NOT DISTINCT FROM ${societyId??null}::uuid
        ORDER BY "createdAt" DESC LIMIT 250
      `),
      !societyId?this.prisma.$queryRaw(Prisma.sql`
        SELECT "id","label","addressLine1","addressLine2","locality","city","state","postalCode","latitude","longitude","active","createdAt","updatedAt"
        FROM "ConsumerHome" WHERE "userId"=${userId}::uuid ORDER BY "createdAt" DESC LIMIT 250
      `):Promise.resolve([]),
      !societyId?this.prisma.$queryRaw(Prisma.sql`
        SELECT "id","homeId","societyUnitId","providerId","offeringId","offeringName","providerName","addressSnapshot","status",
               "scheduledFrom","scheduledUntil","servicePricePaise","notes","createdAt","updatedAt"
        FROM "ConsumerServiceBooking" WHERE "userId"=${userId}::uuid ORDER BY "createdAt" DESC LIMIT 1000
      `):Promise.resolve([]),
      !societyId?this.prisma.$queryRaw(Prisma.sql`
        SELECT "id","providerId","businessName","contactName","phone","email","description","requestedCategoryIds","evidenceRefs","status",
               "reviewNote","submittedAt","reviewedAt","createdAt","updatedAt"
        FROM "ProviderOnboardingApplication" WHERE "applicantUserId"=${userId}::uuid ORDER BY "createdAt" DESC LIMIT 100
      `):Promise.resolve([]),
      !societyId?this.prisma.$queryRaw(Prisma.sql`
        SELECT p."id",p."bookingId",p."providerId",p."proposedFrom",p."proposedUntil",p."note",p."status",p."createdAt",p."respondedAt"
        FROM "ProviderBookingProposal" p
        LEFT JOIN "ConsumerServiceBooking" b ON b."id"=p."bookingId"
        WHERE b."userId"=${userId}::uuid OR p."createdByUserId"=${userId}::uuid OR p."respondedByUserId"=${userId}::uuid
        ORDER BY p."createdAt" DESC LIMIT 1000
      `):Promise.resolve([]),
      !societyId?this.prisma.$queryRaw(Prisma.sql`
        SELECT e."id",e."bookingId",e."providerId",e."evidenceType",e."reference",e."note",e."occurredAt"
        FROM "ConsumerServiceCompletionEvidence" e
        LEFT JOIN "ConsumerServiceBooking" b ON b."id"=e."bookingId"
        WHERE b."userId"=${userId}::uuid OR e."actorUserId"=${userId}::uuid
        ORDER BY e."occurredAt" DESC LIMIT 1000
      `):Promise.resolve([]),
      !societyId?this.prisma.$queryRaw(Prisma.sql`
        SELECT d."id",d."bookingId",d."providerId",d."reasonCode",d."detail",d."status",d."resolutionNote",d."resolvedAt",d."createdAt",d."updatedAt"
        FROM "ConsumerServiceDispute" d
        WHERE d."userId"=${userId}::uuid OR d."resolvedByUserId"=${userId}::uuid
        ORDER BY d."createdAt" DESC LIMIT 1000
      `):Promise.resolve([]),
      !societyId?this.prisma.$queryRaw(Prisma.sql`
        SELECT "id","offeringId","providerId","action","snapshotJson","occurredAt"
        FROM "ServiceOfferingProviderEvent" WHERE "actorUserId"=${userId}::uuid ORDER BY "occurredAt" DESC LIMIT 1000
      `):Promise.resolve([]),
    ]);

    return {
      schemaVersion:'2026-09-21-v435',
      generatedAt:new Date().toISOString(),
      requestId:caseId,
      context:{societyId:societyId??null},
      account:(account as unknown[])[0]??null,
      relationships:(relationships as unknown[])[0]??{memberships:[],ownerships:[],occupancies:[]},
      accessRequests:access,
      helpdeskTickets:helpdesk,
      serviceBookings:services,
      payments,
      consumerHomes,
      consumerServiceBookings:consumerBookings,
      providerOnboardingApplications:providerApplications,
      consumerServiceBookingProposals:bookingProposals,
      consumerServiceCompletionEvidence:completionEvidence,
      consumerServiceDisputes:serviceDisputes,
      serviceOfferingProviderEvents:offeringEvents,
      privacyRequests,
      exclusions:[
        'Authentication token hashes, credentials, secrets and third-party processor secrets are never included.',
        'Records about other people are included only when they form part of a request initiated by the data subject.',
      ],
    };
  }

  async erasurePlan(societyId:string|undefined,caseId:string){
    const privacyCase=await this.caseByScope(societyId,caseId);
    if(privacyCase.requestType!=='ERASURE') throw new BadRequestException('Erasure plan is only available for ERASURE cases');
    const userId=privacyCase.subjectUserId;
    const [activeSocietyRelations,activeGlobalRelations]=await Promise.all([
      societyId?this.prisma.$queryRaw<Array<{count:number}>>(Prisma.sql`
        SELECT (
          (SELECT COUNT(*) FROM "SocietyMembership" WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid AND "active"=true)
          +(SELECT COUNT(*) FROM "UnitOwnership" WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid AND "active"=true AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP))
          +(SELECT COUNT(*) FROM "UnitOccupancy" WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid AND "active"=true AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP))
        )::int AS count
      `):Promise.resolve([{count:0}]),
      !societyId?this.prisma.$queryRaw<Array<{count:number}>>(Prisma.sql`
        SELECT (
          (SELECT COUNT(*) FROM "SocietyMembership" WHERE "userId"=${userId}::uuid AND "active"=true)
          +(SELECT COUNT(*) FROM "UnitOwnership" WHERE "userId"=${userId}::uuid AND "active"=true AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP))
          +(SELECT COUNT(*) FROM "UnitOccupancy" WHERE "userId"=${userId}::uuid AND "active"=true AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP))
        )::int AS count
      `):Promise.resolve([{count:0}]),
    ]);
    const blockers:string[]=[];
    if(privacyCase.legalHold) blockers.push('LEGAL_HOLD_ACTIVE');
    if(privacyCase.retentionDecision!=='ALLOW') blockers.push('RETENTION_REVIEW_NOT_ALLOWED');
    if(societyId&&(activeSocietyRelations[0]?.count??0)>0) blockers.push('ACTIVE_SOCIETY_RELATIONSHIP');
    if(!societyId&&(activeGlobalRelations[0]?.count??0)>0) blockers.push('ACTIVE_ACCOUNT_RELATIONSHIP');

    return {
      caseId,
      scope:societyId?'SOCIETY':'PLATFORM',
      executable:blockers.length===0&&!['COMPLETED','REJECTED','CANCELLED'].includes(privacyCase.status),
      blockers,
      erase:[
        'active authentication sessions',
        'push notification device registrations',
        'pseudonymous product-usage events attributable to the subject',
        ...(societyId?[]:[
          'independent-home address records are anonymised while immutable booking references remain intact',
          'provider-onboarding contact and evidence-reference fields',
          'consumer-service proposal/evidence/dispute free-text fields',
          'canonical account phone/email/name',
        ]),
      ],
      retain:[
        'financial/accounting evidence',
        'security and gate audit evidence',
        'privacy-case and legal-hold evidence',
        'historical ownership/occupancy references required for auditability',
      ],
    };
  }

  async executeErasure(societyId:string|undefined,actorUserId:string,caseId:string){
    const plan=await this.erasurePlan(societyId,caseId);
    if(!plan.executable) throw new BadRequestException(`Erasure cannot execute: ${plan.blockers.join(', ')||'case is closed'}`);

    return this.prisma.$transaction(async tx=>{
      const cases=await tx.$queryRaw<PrivacyCase[]>(Prisma.sql`
        SELECT "id","societyId","subjectUserId","requestType","status","legalHold","retentionDecision"
        FROM "PrivacyRequestCase"
        WHERE "id"=${caseId}::uuid
          AND "societyId" IS NOT DISTINCT FROM ${societyId??null}::uuid
        FOR UPDATE
      `);
      const current=cases[0];
      if(!current) throw new NotFoundException('Privacy request not found');
      if(current.requestType!=='ERASURE') throw new BadRequestException('Erasure plan is only available for ERASURE cases');
      if(['COMPLETED','REJECTED','CANCELLED'].includes(current.status)) throw new BadRequestException('Erasure cannot execute: case is closed');
      if(current.legalHold) throw new BadRequestException('Erasure cannot execute: LEGAL_HOLD_ACTIVE');
      if(current.retentionDecision!=='ALLOW') throw new BadRequestException('Erasure cannot execute: RETENTION_REVIEW_NOT_ALLOWED');

      const userId=current.subjectUserId;
      const users=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        SELECT "id" FROM "User"
        WHERE "id"=${userId}::uuid
        FOR UPDATE
      `);
      if(!users[0]) throw new NotFoundException('Privacy request subject not found');

      const activeRelations=societyId
        ? await tx.$queryRaw<Array<{count:number}>>(Prisma.sql`
            SELECT (
              (SELECT COUNT(*) FROM "SocietyMembership" WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid AND "active"=true)
              +(SELECT COUNT(*) FROM "UnitOwnership" WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid AND "active"=true AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP))
              +(SELECT COUNT(*) FROM "UnitOccupancy" WHERE "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid AND "active"=true AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP))
            )::int AS count
          `)
        : await tx.$queryRaw<Array<{count:number}>>(Prisma.sql`
            SELECT (
              (SELECT COUNT(*) FROM "SocietyMembership" WHERE "userId"=${userId}::uuid AND "active"=true)
              +(SELECT COUNT(*) FROM "UnitOwnership" WHERE "userId"=${userId}::uuid AND "active"=true AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP))
              +(SELECT COUNT(*) FROM "UnitOccupancy" WHERE "userId"=${userId}::uuid AND "active"=true AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP))
            )::int AS count
          `);
      if((activeRelations[0]?.count??0)>0){
        throw new BadRequestException(`Erasure cannot execute: ${societyId?'ACTIVE_SOCIETY_RELATIONSHIP':'ACTIVE_ACCOUNT_RELATIONSHIP'}`);
      }

      const subjectHash=createHash('sha256').update(userId).digest('hex');
      const revoked=await tx.$executeRaw(Prisma.sql`
        UPDATE "Session" SET "revokedAt"=COALESCE("revokedAt",CURRENT_TIMESTAMP),"revocationReason"='PRIVACY_ERASURE'
        WHERE "userId"=${userId}::uuid ${societyId?Prisma.sql`AND "societyId"=${societyId}::uuid`:Prisma.empty}
      `);
      const devices=await tx.$executeRaw(Prisma.sql`
        DELETE FROM "DevicePushToken" WHERE "userId"=${userId}::uuid ${societyId?Prisma.sql`AND "societyId"=${societyId}::uuid`:Prisma.empty}
      `);
      const usage=await tx.$executeRaw(Prisma.sql`
        DELETE FROM "OperationalUsageEvent" WHERE "subjectHash"=${subjectHash}
          ${societyId?Prisma.sql`AND "societyId"=${societyId}::uuid`:Prisma.sql`AND "societyId" IS NULL`}
      `);

      let homes=0;
      let providerApplicationsMinimised=0;
      let bookingProposalsMinimised=0;
      let completionEvidenceMinimised=0;
      let serviceDisputesMinimised=0;
      let accountAnonymized=false;
      if(!societyId){
        homes=await tx.$executeRaw(Prisma.sql`
          UPDATE "ConsumerHome"
          SET "label"='Erased home',"addressLine1"='Erased',"addressLine2"=NULL,
              "locality"='Erased',"city"='Erased',"state"='Erased',"postalCode"='999999',
              "latitude"=NULL,"longitude"=NULL,"active"=false,"updatedAt"=CURRENT_TIMESTAMP
          WHERE "userId"=${userId}::uuid
        `);
        providerApplicationsMinimised=await tx.$executeRaw(Prisma.sql`
          UPDATE "ProviderOnboardingApplication"
          SET "contactName"=NULL,"phone"=${`erased:${userId}`},"email"=NULL,"description"=NULL,"evidenceRefs"='[]'::jsonb,"updatedAt"=CURRENT_TIMESTAMP
          WHERE "applicantUserId"=${userId}::uuid
        `);
        bookingProposalsMinimised=await tx.$executeRaw(Prisma.sql`
          UPDATE "ProviderBookingProposal" p
          SET "note"=NULL
          WHERE p."createdByUserId"=${userId}::uuid OR p."respondedByUserId"=${userId}::uuid
             OR EXISTS (SELECT 1 FROM "ConsumerServiceBooking" b WHERE b."id"=p."bookingId" AND b."userId"=${userId}::uuid)
        `);
        completionEvidenceMinimised=await tx.$executeRaw(Prisma.sql`
          UPDATE "ConsumerServiceCompletionEvidence" e
          SET "reference"=NULL,"note"=NULL
          WHERE e."actorUserId"=${userId}::uuid
             OR EXISTS (SELECT 1 FROM "ConsumerServiceBooking" b WHERE b."id"=e."bookingId" AND b."userId"=${userId}::uuid)
        `);
        serviceDisputesMinimised=await tx.$executeRaw(Prisma.sql`
          UPDATE "ConsumerServiceDispute"
          SET "detail"='Erased by privacy request',"resolutionNote"=NULL,"updatedAt"=CURRENT_TIMESTAMP
          WHERE "userId"=${userId}::uuid
        `);
        await tx.$executeRaw(Prisma.sql`
          UPDATE "User" SET
            "phone"=${`erased:${userId}`},
            "email"=NULL,
            "name"=NULL,
            "status"='DELETED'::"UserStatus",
            "updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${userId}::uuid
        `);
        accountAnonymized=true;
      }

      const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        UPDATE "PrivacyRequestCase"
        SET "status"='COMPLETED',"closedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${caseId}::uuid
          AND "societyId" IS NOT DISTINCT FROM ${societyId??null}::uuid
          AND "status" NOT IN ('COMPLETED','REJECTED','CANCELLED')
          AND "legalHold"=false AND "retentionDecision"='ALLOW'
        RETURNING "id"
      `);
      if(!rows[0]) throw new BadRequestException('Privacy case changed; refresh and retry');
      const evidence={
        scope:societyId?'SOCIETY':'PLATFORM',
        revokedSessions:revoked,
        deletedDeviceRegistrations:devices,
        deletedUsageEvents:usage,
        anonymisedConsumerHomes:homes,
        providerApplicationsMinimised,
        bookingProposalsMinimised,
        completionEvidenceMinimised,
        serviceDisputesMinimised,
        accountAnonymized,
        retainedCategories:plan.retain,
      };
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PrivacyRequestEvent" ("societyId","caseId","actorUserId","eventType","summary","metadataJson")
        VALUES (${societyId??null}::uuid,${caseId}::uuid,${actorUserId}::uuid,'ERASURE_EXECUTED',
          'Privacy erasure/minimisation execution completed',${JSON.stringify(evidence)}::jsonb)
      `);
      return {caseId,status:'COMPLETED',...evidence};
    });
  }

  private async subjectCase(userId:string,societyId:string|undefined,caseId:string){
    const rows=await this.prisma.$queryRaw<PrivacyCase[]>(Prisma.sql`
      SELECT "id","societyId","subjectUserId","requestType","status","legalHold","retentionDecision"
      FROM "PrivacyRequestCase"
      WHERE "id"=${caseId}::uuid AND "subjectUserId"=${userId}::uuid
        AND "societyId" IS NOT DISTINCT FROM ${societyId??null}::uuid LIMIT 1
    `);
    if(!rows[0]) throw new NotFoundException('Privacy request not found');
    return rows[0];
  }

  private async caseByScope(societyId:string|undefined,caseId:string){
    const rows=await this.prisma.$queryRaw<PrivacyCase[]>(Prisma.sql`
      SELECT "id","societyId","subjectUserId","requestType","status","legalHold","retentionDecision"
      FROM "PrivacyRequestCase"
      WHERE "id"=${caseId}::uuid AND "societyId" IS NOT DISTINCT FROM ${societyId??null}::uuid LIMIT 1
    `);
    if(!rows[0]) throw new NotFoundException('Privacy request not found');
    return rows[0];
  }
}
