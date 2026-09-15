import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfiguredHttpAccountingConnectorAdapter } from './configured-http-accounting-connector.adapter';

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

type DeliveryMetrics={totalCount:number;pendingCount:number;deliveredCount:number;failedCount:number;retryExhaustedCount:number;oldestPendingAt:Date|null;terminalSuccessRatePct:number|null};
type ProviderMetrics={provider:string;totalCount:number;pendingCount:number;deliveredCount:number;failedCount:number;oldestPendingAt:Date|null;terminalSuccessRatePct:number|null};
export type DeliveryActionView={id:string;deliveryId:string;actorUserId:string;action:'MANUAL_RETRY';fromStatus:'FAILED'|'UNKNOWN';previousAttemptCount:number;occurredAt:Date};
type DeliveryEvidenceRow={
  deliveryId:string;exportJobId:string;provider:string;deliveryStatus:AccountingConnectorDeliveryView['status'];attemptCount:number;idempotencyKey:string;
  lastAttemptAt:Date|null;nextAttemptAt:Date|null;providerReceiptId:string|null;failureCode:string|null;failureMessage:string|null;deliveryCreatedAt:Date;deliveryUpdatedAt:Date;deliveryCompletedAt:Date|null;
  contractVersion:string;format:'CSV'|'JSONL';fromDate:Date;toDate:Date;exportStatus:string;recordCount:number|null;exportCreatedAt:Date;exportCompletedAt:Date|null;
  artifactKey:string;filename:string;contentType:string;sha256:string;byteLength:number;artifactCreatedAt:Date;
};

@Injectable()
export class AccountingConnectorDeliveryService{
  constructor(private readonly prisma:PrismaService,private readonly connector:ConfiguredHttpAccountingConnectorAdapter){}

  list(societyId:string){return this.prisma.$queryRaw<AccountingConnectorDeliveryView[]>(Prisma.sql`
    SELECT "id","exportJobId","provider","status","attemptCount","lastAttemptAt","nextAttemptAt","providerReceiptId","failureCode","failureMessage","createdAt","updatedAt","completedAt"
    FROM "AccountingConnectorDelivery" WHERE "societyId"=${societyId}::uuid ORDER BY "createdAt" DESC LIMIT 100
  `);}

  actions(societyId:string){return this.prisma.$queryRaw<DeliveryActionView[]>(Prisma.sql`
    SELECT "id","deliveryId","actorUserId","action","fromStatus","previousAttemptCount","occurredAt"
    FROM "AccountingConnectorDeliveryAction" WHERE "societyId"=${societyId}::uuid ORDER BY "occurredAt" DESC LIMIT 100
  `);}

  readiness(){
    const connector=this.connector.readiness();
    const autoDeliveryEnabled=process.env.ACCOUNTING_CONNECTOR_AUTO_DELIVER==='true';
    return {...connector,autoDeliveryEnabled,state:!connector.bridgeConfigured?'NOT_CONFIGURED':autoDeliveryEnabled?'ACTIVE':'READY_DISABLED',networkCheckPerformed:false};
  }

  async evidence(societyId:string,id:string){
    const rows=await this.prisma.$queryRaw<DeliveryEvidenceRow[]>(Prisma.sql`
      SELECT d."id" AS "deliveryId",d."exportJobId",d."provider",d."status" AS "deliveryStatus",d."attemptCount",d."idempotencyKey",
        d."lastAttemptAt",d."nextAttemptAt",d."providerReceiptId",d."failureCode",d."failureMessage",d."createdAt" AS "deliveryCreatedAt",d."updatedAt" AS "deliveryUpdatedAt",d."completedAt" AS "deliveryCompletedAt",
        j."contractVersion",j."format",j."fromDate",j."toDate",j."status" AS "exportStatus",j."recordCount",j."createdAt" AS "exportCreatedAt",j."completedAt" AS "exportCompletedAt",
        a."id" AS "artifactKey",a."filename",a."contentType",a."sha256",a."byteLength",a."createdAt" AS "artifactCreatedAt"
      FROM "AccountingConnectorDelivery" d
      JOIN "AccountingExportJob" j ON j."id"=d."exportJobId" AND j."societyId"=d."societyId"
      JOIN "AccountingExportArtifact" a ON a."jobId"=j."id" AND a."societyId"=j."societyId"
      WHERE d."societyId"=${societyId}::uuid AND d."id"=${id}::uuid
      LIMIT 1
    `);
    const row=rows[0];
    if(!row)throw new NotFoundException('Accounting connector delivery evidence not found');
    const actions=await this.prisma.$queryRaw<DeliveryActionView[]>(Prisma.sql`
      SELECT "id","deliveryId","actorUserId","action","fromStatus","previousAttemptCount","occurredAt"
      FROM "AccountingConnectorDeliveryAction"
      WHERE "societyId"=${societyId}::uuid AND "deliveryId"=${id}::uuid
      ORDER BY "occurredAt","id"
    `);
    return {
      evidenceVersion:'aaraagate.accounting.connector-evidence.v1',
      generatedAt:new Date(),
      delivery:{id:row.deliveryId,provider:row.provider,status:row.deliveryStatus,attemptCount:row.attemptCount,idempotencyKey:row.idempotencyKey,lastAttemptAt:row.lastAttemptAt,nextAttemptAt:row.nextAttemptAt,providerReceiptId:row.providerReceiptId,failureCode:row.failureCode,failureMessage:row.failureMessage,createdAt:row.deliveryCreatedAt,updatedAt:row.deliveryUpdatedAt,completedAt:row.deliveryCompletedAt},
      export:{id:row.exportJobId,contractVersion:row.contractVersion,format:row.format,fromDate:row.fromDate,toDate:row.toDate,status:row.exportStatus,recordCount:row.recordCount,createdAt:row.exportCreatedAt,completedAt:row.exportCompletedAt},
      artifact:{id:row.artifactKey,filename:row.filename,contentType:row.contentType,sha256:row.sha256,byteLength:row.byteLength,createdAt:row.artifactCreatedAt},
      actions,
    };
  }

  async metrics(societyId:string){
    const [totals,providers]=await Promise.all([
      this.prisma.$queryRaw<DeliveryMetrics[]>(Prisma.sql`
        SELECT COUNT(*)::int AS "totalCount",
          COUNT(*) FILTER (WHERE "status" IN ('QUEUED','PROCESSING','ACCEPTED','UNKNOWN'))::int AS "pendingCount",
          COUNT(*) FILTER (WHERE "status"='DELIVERED')::int AS "deliveredCount",
          COUNT(*) FILTER (WHERE "status"='FAILED')::int AS "failedCount",
          COUNT(*) FILTER (WHERE "failureCode"='DELIVERY_RETRY_EXHAUSTED')::int AS "retryExhaustedCount",
          MIN("createdAt") FILTER (WHERE "status" IN ('QUEUED','PROCESSING','ACCEPTED','UNKNOWN')) AS "oldestPendingAt",
          CASE WHEN COUNT(*) FILTER (WHERE "status" IN ('DELIVERED','FAILED'))=0 THEN NULL ELSE ROUND(100.0*COUNT(*) FILTER (WHERE "status"='DELIVERED')/COUNT(*) FILTER (WHERE "status" IN ('DELIVERED','FAILED')),2)::double precision END AS "terminalSuccessRatePct"
        FROM "AccountingConnectorDelivery" WHERE "societyId"=${societyId}::uuid
      `),
      this.prisma.$queryRaw<ProviderMetrics[]>(Prisma.sql`
        SELECT "provider",COUNT(*)::int AS "totalCount",
          COUNT(*) FILTER (WHERE "status" IN ('QUEUED','PROCESSING','ACCEPTED','UNKNOWN'))::int AS "pendingCount",
          COUNT(*) FILTER (WHERE "status"='DELIVERED')::int AS "deliveredCount",
          COUNT(*) FILTER (WHERE "status"='FAILED')::int AS "failedCount",
          MIN("createdAt") FILTER (WHERE "status" IN ('QUEUED','PROCESSING','ACCEPTED','UNKNOWN')) AS "oldestPendingAt",
          CASE WHEN COUNT(*) FILTER (WHERE "status" IN ('DELIVERED','FAILED'))=0 THEN NULL ELSE ROUND(100.0*COUNT(*) FILTER (WHERE "status"='DELIVERED')/COUNT(*) FILTER (WHERE "status" IN ('DELIVERED','FAILED')),2)::double precision END AS "terminalSuccessRatePct"
        FROM "AccountingConnectorDelivery" WHERE "societyId"=${societyId}::uuid GROUP BY "provider" ORDER BY "provider"
      `),
    ]);
    return {totals:totals[0]??{totalCount:0,pendingCount:0,deliveredCount:0,failedCount:0,retryExhaustedCount:0,oldestPendingAt:null,terminalSuccessRatePct:null},providers};
  }

  async retry(societyId:string,userId:string,id:string){
    return this.prisma.$transaction(async tx=>{
      const rows=await tx.$queryRaw<AccountingConnectorDeliveryView[]>(Prisma.sql`
        SELECT "id","exportJobId","provider","status","attemptCount","lastAttemptAt","nextAttemptAt","providerReceiptId","failureCode","failureMessage","createdAt","updatedAt","completedAt"
        FROM "AccountingConnectorDelivery" WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid FOR UPDATE
      `);
      const current=rows[0];
      if(!current)throw new NotFoundException('Accounting connector delivery not found');
      if(!['FAILED','UNKNOWN'].includes(current.status))throw new BadRequestException('Only failed or unknown connector deliveries can be retried manually');
      await tx.$executeRaw(Prisma.sql`INSERT INTO "AccountingConnectorDeliveryAction" ("societyId","deliveryId","actorUserId","action","fromStatus","previousAttemptCount") VALUES (${societyId}::uuid,${id}::uuid,${userId}::uuid,'MANUAL_RETRY',${current.status},${current.attemptCount})`);
      const updated=await tx.$queryRaw<AccountingConnectorDeliveryView[]>(Prisma.sql`
        UPDATE "AccountingConnectorDelivery" SET "status"='QUEUED',"attemptCount"=0,"nextAttemptAt"=CURRENT_TIMESTAMP,"leaseUntil"=NULL,"completedAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid
        RETURNING "id","exportJobId","provider","status","attemptCount","lastAttemptAt","nextAttemptAt","providerReceiptId","failureCode","failureMessage","createdAt","updatedAt","completedAt"
      `);
      return updated[0];
    });
  }
}
