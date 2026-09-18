import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type SettlementStatus='DRAFT'|'APPROVED'|'PAID'|'CANCELLED';
type BatchRow={
  id:string;providerId:string;status:SettlementStatus;currency:string;
  grossAmountPaise:bigint|number;platformFeePaise:bigint|number;providerAmountPaise:bigint|number;
  createdByUserId:string;approvedByUserId:string|null;approvedAt:Date|null;
  paidByUserId:string|null;paidAt:Date|null;paymentReference:string|null;createdAt:Date;updatedAt:Date;
};

@Injectable()
export class ProviderSettlementService{
  constructor(private readonly prisma:PrismaService){}

  list(){
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT b.*,p."businessName",
        (SELECT COUNT(*)::int FROM "ConsumerProviderSettlementEntry" e WHERE e."batchId"=b."id") AS "entryCount"
      FROM "ConsumerProviderSettlementBatch" b
      JOIN "ServiceProvider" p ON p."id"=b."providerId"
      ORDER BY b."createdAt" DESC
      LIMIT 500
    `);
  }

  async eligible(providerId:string){
    await this.assertProvider(providerId);
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        pay."id" AS "paymentId",
        pay."bookingId",
        pay."grossAmountPaise",
        pay."platformFeePaise",
        pay."providerAmountPaise",
        pay."currency",
        pay."capturedAt",
        b."offeringName",
        b."scheduledFrom",
        b."scheduledUntil"
      FROM "ConsumerServicePayment" pay
      JOIN "ConsumerServiceBooking" b ON b."id"=pay."bookingId"
      WHERE b."providerId"=${providerId}::uuid
        AND b."status"='COMPLETED'::"ServiceBookingStatus"
        AND pay."status"='CAPTURED'::"ConsumerServicePaymentStatus"
        AND pay."platformFeePaise" IS NOT NULL
        AND pay."providerAmountPaise" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "ConsumerProviderSettlementEntry" e WHERE e."paymentId"=pay."id"
        )
      ORDER BY pay."capturedAt",pay."id"
      LIMIT 1000
    `);
  }

  async createDraft(actorUserId:string,providerId:string){
    await this.assertProvider(providerId);
    const id=randomUUID();
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`settlement:${providerId}`}))`);
      const eligible=await tx.$queryRaw<Array<{
        paymentId:string;bookingId:string;grossAmountPaise:number;platformFeePaise:number;providerAmountPaise:number;currency:string;capturedAt:Date;
      }>>(Prisma.sql`
        SELECT pay."id" AS "paymentId",pay."bookingId",pay."grossAmountPaise",pay."platformFeePaise",pay."providerAmountPaise",pay."currency",pay."capturedAt"
        FROM "ConsumerServicePayment" pay
        JOIN "ConsumerServiceBooking" b ON b."id"=pay."bookingId"
        WHERE b."providerId"=${providerId}::uuid
          AND b."status"='COMPLETED'::"ServiceBookingStatus"
          AND pay."status"='CAPTURED'::"ConsumerServicePaymentStatus"
          AND pay."platformFeePaise" IS NOT NULL
          AND pay."providerAmountPaise" IS NOT NULL
          AND pay."capturedAt" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "ConsumerProviderSettlementEntry" e WHERE e."paymentId"=pay."id")
        ORDER BY pay."capturedAt",pay."id"
        FOR UPDATE OF pay
        LIMIT 1000
      `);
      if(!eligible.length)throw new BadRequestException('No completed captured split-ready payments are eligible for settlement');
      if(eligible.some(row=>row.currency!=='INR'||row.grossAmountPaise!==row.platformFeePaise+row.providerAmountPaise)){
        throw new BadRequestException('Eligible payment has invalid settlement economics');
      }
      const gross=eligible.reduce((sum,row)=>sum+row.grossAmountPaise,0);
      const fee=eligible.reduce((sum,row)=>sum+row.platformFeePaise,0);
      const provider=eligible.reduce((sum,row)=>sum+row.providerAmountPaise,0);

      const batches=await tx.$queryRaw<BatchRow[]>(Prisma.sql`
        INSERT INTO "ConsumerProviderSettlementBatch" (
          "id","providerId","status","currency","grossAmountPaise","platformFeePaise","providerAmountPaise","createdByUserId","createdAt","updatedAt"
        ) VALUES (
          ${id}::uuid,${providerId}::uuid,'DRAFT','INR',${gross},${fee},${provider},${actorUserId}::uuid,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
        ) RETURNING *
      `);
      for(const row of eligible){
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "ConsumerProviderSettlementEntry" (
            "id","batchId","providerId","paymentId","bookingId","grossAmountPaise","platformFeePaise","providerAmountPaise","currency","capturedAt","createdAt"
          ) VALUES (
            ${randomUUID()}::uuid,${id}::uuid,${providerId}::uuid,${row.paymentId}::uuid,${row.bookingId}::uuid,
            ${row.grossAmountPaise},${row.platformFeePaise},${row.providerAmountPaise},${row.currency},${row.capturedAt},CURRENT_TIMESTAMP
          )
        `);
      }
      await this.event(tx,id,actorUserId,'CREATED',null,'DRAFT',null);
      return {...batches[0],entryCount:eligible.length};
    });
  }

  async approve(actorUserId:string,batchId:string){
    return this.prisma.$transaction(async tx=>{
      const current=await this.lockBatch(tx,batchId);
      if(current.status!=='DRAFT')throw new BadRequestException('Only DRAFT settlement batches can be approved');
      const invalid=await tx.$queryRaw<Array<{count:number}>>(Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "ConsumerProviderSettlementEntry" e
        JOIN "ConsumerServicePayment" p ON p."id"=e."paymentId"
        JOIN "ConsumerServiceBooking" b ON b."id"=e."bookingId"
        WHERE e."batchId"=${batchId}::uuid
          AND (p."status"<>'CAPTURED'::"ConsumerServicePaymentStatus" OR b."status"<>'COMPLETED'::"ServiceBookingStatus")
      `);
      if((invalid[0]?.count??0)>0)throw new BadRequestException('Settlement contains payment or booking evidence that is no longer eligible');
      const rows=await tx.$queryRaw<BatchRow[]>(Prisma.sql`
        UPDATE "ConsumerProviderSettlementBatch"
        SET "status"='APPROVED',"approvedByUserId"=${actorUserId}::uuid,"approvedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${batchId}::uuid AND "status"='DRAFT'
        RETURNING *
      `);
      if(!rows[0])throw new BadRequestException('Settlement changed concurrently');
      await this.event(tx,batchId,actorUserId,'APPROVED','DRAFT','APPROVED',null);
      return rows[0];
    });
  }

  async markPaid(actorUserId:string,batchId:string,reference:string){
    const normalized=reference.trim();
    if(normalized.length<3||normalized.length>200)throw new BadRequestException('Payment reference must be between 3 and 200 characters');
    return this.prisma.$transaction(async tx=>{
      const current=await this.lockBatch(tx,batchId);
      if(current.status!=='APPROVED')throw new BadRequestException('Only APPROVED settlement batches can be marked paid');
      const rows=await tx.$queryRaw<BatchRow[]>(Prisma.sql`
        UPDATE "ConsumerProviderSettlementBatch"
        SET "status"='PAID',"paidByUserId"=${actorUserId}::uuid,"paidAt"=CURRENT_TIMESTAMP,
            "paymentReference"=${normalized},"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${batchId}::uuid AND "status"='APPROVED'
        RETURNING *
      `);
      if(!rows[0])throw new BadRequestException('Settlement changed concurrently');
      await this.event(tx,batchId,actorUserId,'PAID','APPROVED','PAID',normalized);
      return rows[0];
    });
  }

  async cancel(actorUserId:string,batchId:string){
    return this.prisma.$transaction(async tx=>{
      const current=await this.lockBatch(tx,batchId);
      if(current.status!=='DRAFT')throw new BadRequestException('Only DRAFT settlement batches can be cancelled');
      const rows=await tx.$queryRaw<BatchRow[]>(Prisma.sql`
        UPDATE "ConsumerProviderSettlementBatch"
        SET "status"='CANCELLED',"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${batchId}::uuid AND "status"='DRAFT'
        RETURNING *
      `);
      if(!rows[0])throw new BadRequestException('Settlement changed concurrently');
      await this.event(tx,batchId,actorUserId,'CANCELLED','DRAFT','CANCELLED',null);
      return rows[0];
    });
  }

  entries(batchId:string){
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT e.*,b."offeringName",b."providerName",b."scheduledFrom",b."scheduledUntil"
      FROM "ConsumerProviderSettlementEntry" e
      JOIN "ConsumerServiceBooking" b ON b."id"=e."bookingId"
      WHERE e."batchId"=${batchId}::uuid
      ORDER BY e."capturedAt",e."id"
    `);
  }

  events(batchId:string){
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT "id","actorUserId","eventType","fromStatus","toStatus","reference","occurredAt"
      FROM "ConsumerProviderSettlementEvent"
      WHERE "batchId"=${batchId}::uuid ORDER BY "occurredAt","id"
    `);
  }

  private async assertProvider(providerId:string){
    const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM "ServiceProvider" WHERE "id"=${providerId}::uuid LIMIT 1
    `);
    if(!rows[0])throw new NotFoundException('Service provider not found');
  }

  private async lockBatch(tx:Prisma.TransactionClient,batchId:string){
    const rows=await tx.$queryRaw<BatchRow[]>(Prisma.sql`
      SELECT * FROM "ConsumerProviderSettlementBatch" WHERE "id"=${batchId}::uuid FOR UPDATE
    `);
    if(!rows[0])throw new NotFoundException('Provider settlement batch not found');
    return rows[0];
  }

  private event(tx:Prisma.TransactionClient,batchId:string,actorUserId:string,eventType:string,fromStatus:string|null,toStatus:string|null,reference:string|null){
    return tx.$executeRaw(Prisma.sql`
      INSERT INTO "ConsumerProviderSettlementEvent" (
        "id","batchId","actorUserId","eventType","fromStatus","toStatus","reference","occurredAt"
      ) VALUES (
        ${randomUUID()}::uuid,${batchId}::uuid,${actorUserId}::uuid,${eventType},${fromStatus},${toStatus},${reference},CURRENT_TIMESTAMP
      )
    `);
  }
}
