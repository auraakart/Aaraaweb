import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type WaiverRequestInput={receivableId:string;amountPaise:number;reason:string;entryDate:string;journalEntryNumber:string;requestKey:string};
type ReviewInput={reason?:string};
type WaiverRow={id:string;periodId:string;description:string;status:string;sourceType:string;sourceId:string|null;externalReference:string|null;createdByUserId:string};

@Injectable()
export class WaiverApprovalService {
  constructor(private readonly prisma:PrismaService) {}

  list(societyId:string){
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT je."id",je."entryNumber",je."entryDate",je."description",je."status",je."sourceType",je."sourceId",je."externalReference",
             je."createdByUserId",je."postedByUserId",je."postedAt",je."updatedAt"
      FROM "JournalEntry" je
      WHERE je."societyId"=${societyId}::uuid AND je."sourceType" IN ('WAIVER_REQUEST','WAIVER_REQUEST_REJECTED')
      ORDER BY je."createdAt" DESC LIMIT 250
    `);
  }

  async request(societyId:string,userId:string,input:WaiverRequestInput){
    if(!Number.isSafeInteger(input.amountPaise)||input.amountPaise<=0) throw new BadRequestException('Waiver amount must be a positive integer paise value');
    const key=input.requestKey.trim();
    if(!key) throw new BadRequestException('Waiver request key is required');
    return this.prisma.$transaction(async tx=>{
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`${societyId}:waiver:${key}`}))`);
      const existing=await tx.$queryRaw<Array<{id:string;externalReference:string|null;status:string}>>(Prisma.sql`
        SELECT "id","externalReference","status"::text AS "status" FROM "JournalEntry"
        WHERE "societyId"=${societyId}::uuid AND "sourceType" IN ('WAIVER_REQUEST','WAIVER_REQUEST_REJECTED') AND "sourceId"=${key} LIMIT 1
      `);
      const ref=`${input.receivableId}|${input.amountPaise}`;
      if(existing.length){
        if(existing[0].externalReference!==ref) throw new ConflictException('Waiver request key was already used with different content');
        return {requestId:existing[0].id,status:existing[0].status,idempotent:true};
      }
      const receivables=await tx.$queryRaw<Array<{id:string;unitId:string;status:string;chargeRuleId:string|null}>>(Prisma.sql`
        SELECT "id","unitId","status"::text AS "status","chargeRuleId" FROM "Receivable"
        WHERE "id"=${input.receivableId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE
      `);
      const receivable=receivables[0];
      if(!receivable) throw new NotFoundException('Receivable not found');
      if(receivable.status==='VOID') throw new ConflictException('Void receivable cannot be waived');
      if(!receivable.chargeRuleId) throw new BadRequestException('Receivable has no charge rule account mapping');
      const rules=await tx.$queryRaw<Array<{receivableAccountId:string;incomeAccountId:string;fundId:string|null}>>(Prisma.sql`
        SELECT "receivableAccountId","incomeAccountId","fundId" FROM "ChargeRule"
        WHERE "id"=${receivable.chargeRuleId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1
      `);
      if(!rules.length) throw new BadRequestException('Charge rule account mapping unavailable');
      const periods=await tx.$queryRaw<Array<{id:string;status:string}>>(Prisma.sql`
        SELECT "id","status"::text AS "status" FROM "AccountingPeriod"
        WHERE "societyId"=${societyId}::uuid AND ${input.entryDate}::date BETWEEN "startsOn" AND "endsOn"
        ORDER BY "startsOn" DESC LIMIT 1 FOR UPDATE
      `);
      if(!periods.length||periods[0].status!=='OPEN') throw new ConflictException('Waiver date requires an open accounting period');
      const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        INSERT INTO "JournalEntry" ("societyId","periodId","entryNumber","entryDate","description","sourceType","sourceId","externalReference","createdByUserId")
        VALUES (${societyId}::uuid,${periods[0].id}::uuid,${input.journalEntryNumber.trim().toUpperCase()},${input.entryDate}::date,${input.reason.trim()},'WAIVER_REQUEST',${key},${ref},${userId}::uuid)
        RETURNING "id"
      `);
      const journalId=rows[0].id,r=rules[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "JournalLine" ("societyId","entryId","accountId","fundId","unitId","description","debitPaise","creditPaise") VALUES
        (${societyId}::uuid,${journalId}::uuid,${r.receivableAccountId}::uuid,${r.fundId}::uuid,${receivable.unitId}::uuid,${input.reason.trim()},0,${input.amountPaise}),
        (${societyId}::uuid,${journalId}::uuid,${r.incomeAccountId}::uuid,${r.fundId}::uuid,${receivable.unitId}::uuid,${input.reason.trim()},${input.amountPaise},0)
      `);
      return {requestId:journalId,status:'PENDING_APPROVAL',idempotent:false};
    });
  }

  async approve(societyId:string,reviewerId:string,journalId:string){
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<WaiverRow[]>(Prisma.sql`
        SELECT "id","periodId","description","status"::text AS "status","sourceType","sourceId","externalReference","createdByUserId"
        FROM "JournalEntry" WHERE "id"=${journalId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE
      `);
      const request=rows[0];
      if(!request) throw new NotFoundException('Waiver request not found');
      if(request.sourceType!=='WAIVER_REQUEST'||request.status!=='DRAFT') throw new ConflictException('Only pending waiver requests can be approved');
      if(request.createdByUserId===reviewerId) throw new ConflictException('Waiver requester cannot approve their own request');
      const [receivableId,amountRaw]=(request.externalReference??'').split('|');
      const amountPaise=Number(amountRaw);
      if(!receivableId||!Number.isSafeInteger(amountPaise)||amountPaise<=0) throw new ConflictException('Waiver request metadata is invalid');
      const periods=await tx.$queryRaw<Array<{status:string}>>(Prisma.sql`SELECT "status"::text AS "status" FROM "AccountingPeriod" WHERE "id"=${request.periodId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE`);
      if(!periods.length||periods[0].status!=='OPEN') throw new ConflictException('Waiver approval requires an open accounting period');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ReceivableAdjustment" ("societyId","receivableId","type","amountPaise","reason","journalEntryId","createdByUserId")
        VALUES (${societyId}::uuid,${receivableId}::uuid,'WAIVER'::"ReceivableAdjustmentType",${amountPaise},${request.description},${journalId}::uuid,${request.createdByUserId}::uuid)
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "JournalEntry" SET "status"='POSTED',"postedByUserId"=${reviewerId}::uuid,"postedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${journalId}::uuid AND "societyId"=${societyId}::uuid AND "status"='DRAFT'
      `);
      return {requestId:journalId,status:'APPROVED',approvedByUserId:reviewerId};
    });
  }

  async reject(societyId:string,reviewerId:string,journalId:string,input:ReviewInput){
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<WaiverRow[]>(Prisma.sql`
        SELECT "id","periodId","description","status"::text AS "status","sourceType","sourceId","externalReference","createdByUserId"
        FROM "JournalEntry" WHERE "id"=${journalId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE
      `);
      const request=rows[0];
      if(!request) throw new NotFoundException('Waiver request not found');
      if(request.sourceType!=='WAIVER_REQUEST'||request.status!=='DRAFT') throw new ConflictException('Only pending waiver requests can be rejected');
      if(request.createdByUserId===reviewerId) throw new ConflictException('Waiver requester cannot review their own request');
      const note=input.reason?.trim()||'Rejected by finance reviewer';
      await tx.$executeRaw(Prisma.sql`
        UPDATE "JournalEntry" SET "sourceType"='WAIVER_REQUEST_REJECTED',"description"=${`${request.description} | Rejected: ${note}`},"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${journalId}::uuid AND "societyId"=${societyId}::uuid AND "status"='DRAFT'
      `);
      return {requestId:journalId,status:'REJECTED',reviewedByUserId:reviewerId};
    });
  }
}
