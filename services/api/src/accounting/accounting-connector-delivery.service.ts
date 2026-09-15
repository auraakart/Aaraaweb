import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AccountingConnectorDeliveryView={
  id:string;
  exportJobId:string;
  provider:string;
  status:'QUEUED'|'PROCESSING'|'ACCEPTED'|'DELIVERED'|'FAILED'|'UNKNOWN';
  attemptCount:number;
  lastAttemptAt:Date|null;
  nextAttemptAt:Date|null;
  providerReceiptId:string|null;
  failureCode:string|null;
  failureMessage:string|null;
  createdAt:Date;
  updatedAt:Date;
  completedAt:Date|null;
};

type DeliveryMetrics={
  totalCount:number;
  pendingCount:number;
  deliveredCount:number;
  failedCount:number;
  retryExhaustedCount:number;
  oldestPendingAt:Date|null;
  terminalSuccessRatePct:number|null;
};
type ProviderMetrics={
  provider:string;
  totalCount:number;
  pendingCount:number;
  deliveredCount:number;
  failedCount:number;
  oldestPendingAt:Date|null;
  terminalSuccessRatePct:number|null;
};

@Injectable()
export class AccountingConnectorDeliveryService{
  constructor(private readonly prisma:PrismaService){}

  list(societyId:string){return this.prisma.$queryRaw<AccountingConnectorDeliveryView[]>(Prisma.sql`
    SELECT "id","exportJobId","provider","status","attemptCount","lastAttemptAt","nextAttemptAt","providerReceiptId","failureCode","failureMessage","createdAt","updatedAt","completedAt"
    FROM "AccountingConnectorDelivery"
    WHERE "societyId"=${societyId}::uuid
    ORDER BY "createdAt" DESC LIMIT 100
  `);}

  async metrics(societyId:string){
    const [totals,providers]=await Promise.all([
      this.prisma.$queryRaw<DeliveryMetrics[]>(Prisma.sql`
        SELECT
          COUNT(*)::int AS "totalCount",
          COUNT(*) FILTER (WHERE "status" IN ('QUEUED','PROCESSING','ACCEPTED','UNKNOWN'))::int AS "pendingCount",
          COUNT(*) FILTER (WHERE "status"='DELIVERED')::int AS "deliveredCount",
          COUNT(*) FILTER (WHERE "status"='FAILED')::int AS "failedCount",
          COUNT(*) FILTER (WHERE "failureCode"='DELIVERY_RETRY_EXHAUSTED')::int AS "retryExhaustedCount",
          MIN("createdAt") FILTER (WHERE "status" IN ('QUEUED','PROCESSING','ACCEPTED','UNKNOWN')) AS "oldestPendingAt",
          CASE WHEN COUNT(*) FILTER (WHERE "status" IN ('DELIVERED','FAILED'))=0 THEN NULL
               ELSE ROUND(100.0*COUNT(*) FILTER (WHERE "status"='DELIVERED')/COUNT(*) FILTER (WHERE "status" IN ('DELIVERED','FAILED')),2)::double precision END AS "terminalSuccessRatePct"
        FROM "AccountingConnectorDelivery" WHERE "societyId"=${societyId}::uuid
      `),
      this.prisma.$queryRaw<ProviderMetrics[]>(Prisma.sql`
        SELECT "provider",
          COUNT(*)::int AS "totalCount",
          COUNT(*) FILTER (WHERE "status" IN ('QUEUED','PROCESSING','ACCEPTED','UNKNOWN'))::int AS "pendingCount",
          COUNT(*) FILTER (WHERE "status"='DELIVERED')::int AS "deliveredCount",
          COUNT(*) FILTER (WHERE "status"='FAILED')::int AS "failedCount",
          MIN("createdAt") FILTER (WHERE "status" IN ('QUEUED','PROCESSING','ACCEPTED','UNKNOWN')) AS "oldestPendingAt",
          CASE WHEN COUNT(*) FILTER (WHERE "status" IN ('DELIVERED','FAILED'))=0 THEN NULL
               ELSE ROUND(100.0*COUNT(*) FILTER (WHERE "status"='DELIVERED')/COUNT(*) FILTER (WHERE "status" IN ('DELIVERED','FAILED')),2)::double precision END AS "terminalSuccessRatePct"
        FROM "AccountingConnectorDelivery" WHERE "societyId"=${societyId}::uuid
        GROUP BY "provider" ORDER BY "provider"
      `),
    ]);
    return {totals:totals[0]??{totalCount:0,pendingCount:0,deliveredCount:0,failedCount:0,retryExhaustedCount:0,oldestPendingAt:null,terminalSuccessRatePct:null},providers};
  }

  async retry(societyId:string,userId:string,id:string){
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<AccountingConnectorDeliveryView[]>(Prisma.sql`
        SELECT "id","exportJobId","provider","status","attemptCount","lastAttemptAt","nextAttemptAt","providerReceiptId","failureCode","failureMessage","createdAt","updatedAt","completedAt"
        FROM "AccountingConnectorDelivery"
        WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid
        FOR UPDATE
      `);
      const current=rows[0];
      if(!current)throw new NotFoundException('Accounting connector delivery not found');
      if(!['FAILED','UNKNOWN'].includes(current.status))throw new BadRequestException('Only failed or unknown connector deliveries can be retried manually');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "AccountingConnectorDeliveryAction" ("societyId","deliveryId","actorUserId","action","fromStatus","previousAttemptCount")
        VALUES (${societyId}::uuid,${id}::uuid,${userId}::uuid,'MANUAL_RETRY',${current.status},${current.attemptCount})
      `);
      const updated=await tx.$queryRaw<AccountingConnectorDeliveryView[]>(Prisma.sql`
        UPDATE "AccountingConnectorDelivery"
        SET "status"='QUEUED',"attemptCount"=0,"nextAttemptAt"=CURRENT_TIMESTAMP,"leaseUntil"=NULL,"completedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid
        RETURNING "id","exportJobId","provider","status","attemptCount","lastAttemptAt","nextAttemptAt","providerReceiptId","failureCode","failureMessage","createdAt","updatedAt","completedAt"
      `);
      return updated[0];
    });
  }
}
