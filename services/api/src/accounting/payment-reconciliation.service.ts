import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type OperationInput={operationType:'STATUS_QUERY'|'REFUND';provider:string;amountPaise?:number;idempotencyKey:string};
type OperationResultInput={status:'ACCEPTED'|'SETTLED'|'FAILED'|'UNKNOWN';providerOperationId?:string;failureCode?:string;failureMessage?:string};
type ObservationInput={providerPaymentId?:string;observedProviderStatus:string;observedAmountPaise:number};

@Injectable()
export class PaymentReconciliationService{
  constructor(private readonly prisma:PrismaService){}

  listCases(societyId:string){return this.prisma.$queryRaw(Prisma.sql`
    SELECT "id","paymentId","status","provider","providerPaymentId","observedProviderStatus","observedAmountPaise"::text AS "observedAmountPaise",
           "expectedCapturedPaise"::text AS "expectedCapturedPaise","expectedRefundedPaise"::text AS "expectedRefundedPaise","reason","lastCheckedAt","resolvedAt","updatedAt",
           CASE
             WHEN "status"='ACTION_REQUIRED' THEN 'HIGH'
             WHEN "status"='MISMATCH' THEN 'HIGH'
             WHEN "status"='PENDING' AND ("lastCheckedAt" IS NULL OR "lastCheckedAt"<CURRENT_TIMESTAMP-INTERVAL '24 hours') THEN 'MEDIUM'
             ELSE 'LOW'
           END AS "priority",
           CASE
             WHEN "status"='ACTION_REQUIRED' THEN 'Review provider failure evidence and request a status query or refund only when supported by payment evidence.'
             WHEN "status"='MISMATCH' THEN 'Compare provider evidence with the expected amount and status, then resolve the discrepancy with a reason.'
             WHEN "status"='PENDING' THEN 'Request or await a provider status observation before resolving the case.'
             WHEN "status"='MATCHED' THEN 'Review the matched evidence and resolve the case when verification is complete.'
             WHEN "status"='RESOLVED' THEN 'No action required.'
             ELSE 'Review reconciliation evidence.'
           END AS "nextAction"
    FROM "PaymentReconciliationCase" WHERE "societyId"=${societyId}::uuid
    ORDER BY
      CASE WHEN "status"='RESOLVED' THEN 1 ELSE 0 END,
      CASE
        WHEN "status" IN ('ACTION_REQUIRED','MISMATCH') THEN 0
        WHEN "status"='PENDING' AND ("lastCheckedAt" IS NULL OR "lastCheckedAt"<CURRENT_TIMESTAMP-INTERVAL '24 hours') THEN 1
        ELSE 2
      END,
      "updatedAt" ASC
    LIMIT 250
  `);}

  async getCase(societyId:string,id:string){const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`
    SELECT "id","paymentId","status","provider","providerPaymentId","observedProviderStatus","observedAmountPaise"::text AS "observedAmountPaise",
           "expectedCapturedPaise"::text AS "expectedCapturedPaise","expectedRefundedPaise"::text AS "expectedRefundedPaise","reason","lastCheckedAt","resolvedByUserId","resolvedAt","createdAt","updatedAt"
    FROM "PaymentReconciliationCase" WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid LIMIT 1
  `);if(!rows.length)throw new NotFoundException('Reconciliation case not found');return rows[0];}

  async openOrRefreshCase(societyId:string,paymentId:string,provider:string){const providerName=provider.trim();if(!providerName)throw new BadRequestException('Provider is required');return this.prisma.$transaction(async tx=>{
    const p=await tx.$queryRaw<Array<{id:string;status:string;amountPaise:bigint}>>(Prisma.sql`SELECT "id","status","amountPaise" FROM "Payment" WHERE "societyId"=${societyId}::uuid AND "id"=${paymentId}::uuid FOR UPDATE`);if(!p.length)throw new NotFoundException('Payment not found');
    const refunds=await tx.$queryRaw<Array<{total:bigint}>>(Prisma.sql`SELECT COALESCE(SUM("amountPaise"),0)::bigint AS total FROM "PaymentRefund" WHERE "societyId"=${societyId}::uuid AND "paymentId"=${paymentId}::uuid`);
    const captured=(p[0].status==='CAPTURED'||p[0].status==='REFUNDED')?p[0].amountPaise:0n,refunded=refunds[0].total;
    const existing=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "PaymentReconciliationCase" WHERE "societyId"=${societyId}::uuid AND "paymentId"=${paymentId}::uuid AND "status"<>'RESOLVED' FOR UPDATE`);
    let id:string;if(existing.length){id=existing[0].id;await tx.$executeRaw(Prisma.sql`UPDATE "PaymentReconciliationCase" SET "provider"=${providerName},"expectedCapturedPaise"=${captured},"expectedRefundedPaise"=${refunded},"status"='PENDING',"reason"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid`);}else{const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`INSERT INTO "PaymentReconciliationCase" ("societyId","paymentId","provider","expectedCapturedPaise","expectedRefundedPaise") VALUES (${societyId}::uuid,${paymentId}::uuid,${providerName},${captured},${refunded}) RETURNING "id"`);id=rows[0].id;}
    return this.getCaseTx(tx,societyId,id);
  });}

  async recordObservation(societyId:string,id:string,input:ObservationInput){if(input.observedAmountPaise<0)throw new BadRequestException('Observed amount cannot be negative');const observed=input.observedProviderStatus.trim();if(!observed)throw new BadRequestException('Observed provider status is required');return this.prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<Array<{status:string;expectedCapturedPaise:bigint;expectedRefundedPaise:bigint}>>(Prisma.sql`SELECT "status","expectedCapturedPaise","expectedRefundedPaise" FROM "PaymentReconciliationCase" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE`);if(!rows.length)throw new NotFoundException('Reconciliation case not found');if(rows[0].status==='RESOLVED')throw new ConflictException('Resolved reconciliation case cannot be changed');
    const expectedNet=rows[0].expectedCapturedPaise-rows[0].expectedRefundedPaise;const normalized=observed.toUpperCase();let state:'MATCHED'|'MISMATCH'|'ACTION_REQUIRED';
    const amountMatches=BigInt(input.observedAmountPaise)===expectedNet;const expectedStatus=rows[0].expectedRefundedPaise===0n?'CAPTURED':rows[0].expectedRefundedPaise===rows[0].expectedCapturedPaise?'REFUNDED':'PARTIALLY_REFUNDED';
    const providerException=['FAILED','UNKNOWN','CHARGEBACK','CHARGED_BACK','DISPUTED','REVERSED'].includes(normalized);
    if(amountMatches&&normalized===expectedStatus)state='MATCHED';else if(providerException)state='ACTION_REQUIRED';else state='MISMATCH';
    await tx.$executeRaw(Prisma.sql`UPDATE "PaymentReconciliationCase" SET "providerPaymentId"=${input.providerPaymentId?.trim()||null},"observedProviderStatus"=${observed},"observedAmountPaise"=${input.observedAmountPaise},"status"=${state}::"PaymentReconciliationStatus","reason"=${state==='MATCHED'?null:`Expected ${expectedStatus} / ${expectedNet.toString()} paise`},"lastCheckedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid`);
    return this.getCaseTx(tx,societyId,id);
  });}

  async resolveCase(societyId:string,userId:string,id:string,reason:string){const why=reason.trim();if(!why)throw new BadRequestException('Resolution reason is required');const count=await this.prisma.$executeRaw(Prisma.sql`UPDATE "PaymentReconciliationCase" SET "status"='RESOLVED',"reason"=${why},"resolvedByUserId"=${userId}::uuid,"resolvedAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid AND "status"<>'RESOLVED'`);if(count===0)throw new ConflictException('Reconciliation case is missing or already resolved');return this.getCase(societyId,id);}

  async createOperation(societyId:string,userId:string,paymentId:string,input:OperationInput){const provider=input.provider.trim(),key=input.idempotencyKey.trim();if(!provider||!key)throw new BadRequestException('Provider and idempotency key are required');if(input.operationType==='REFUND'&&(!input.amountPaise||input.amountPaise<=0))throw new BadRequestException('Refund operation requires a positive amount');return this.prisma.$transaction(async tx=>{
    const existing=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "PaymentGatewayOperation" WHERE "societyId"=${societyId}::uuid AND "idempotencyKey"=${key} LIMIT 1`);if(existing.length)return this.getOperation(tx,societyId,existing[0].id);
    const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`INSERT INTO "PaymentGatewayOperation" ("societyId","paymentId","operationType","provider","amountPaise","idempotencyKey","requestedByUserId") VALUES (${societyId}::uuid,${paymentId}::uuid,${input.operationType}::"GatewayOperationType",${provider},${input.amountPaise??null},${key},${userId}::uuid) RETURNING "id"`);return this.getOperation(tx,societyId,rows[0].id);
  }).catch(e=>this.rethrow(e,'Gateway operation could not be created'));}

  async recordOperationResult(societyId:string,id:string,input:OperationResultInput){const rows=await this.prisma.$queryRaw<Array<{status:string}>>(Prisma.sql`UPDATE "PaymentGatewayOperation" SET "status"=${input.status}::"GatewayOperationStatus","providerOperationId"=COALESCE(${input.providerOperationId?.trim()||null},"providerOperationId"),"failureCode"=${input.failureCode?.trim()||null},"failureMessage"=${input.failureMessage?.trim()||null},"settledAt"=CASE WHEN ${input.status}='SETTLED' THEN CURRENT_TIMESTAMP ELSE "settledAt" END,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid RETURNING "status"`);if(!rows.length)throw new NotFoundException('Gateway operation not found');const client=this.prisma as unknown as Prisma.TransactionClient;return this.getOperation(client,societyId,id);}

  listOperations(societyId:string,paymentId:string){return this.prisma.$queryRaw(Prisma.sql`SELECT "id","paymentId","operationType","status","provider","providerOperationId","amountPaise"::text AS "amountPaise","idempotencyKey","failureCode","failureMessage","requestedAt","settledAt" FROM "PaymentGatewayOperation" WHERE "societyId"=${societyId}::uuid AND "paymentId"=${paymentId}::uuid ORDER BY "createdAt" DESC`);}
  private async getCaseTx(tx:Prisma.TransactionClient,societyId:string,id:string){const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`SELECT "id","paymentId","status","provider","providerPaymentId","observedProviderStatus","observedAmountPaise"::text AS "observedAmountPaise","expectedCapturedPaise"::text AS "expectedCapturedPaise","expectedRefundedPaise"::text AS "expectedRefundedPaise","reason","lastCheckedAt","resolvedByUserId","resolvedAt","createdAt","updatedAt" FROM "PaymentReconciliationCase" WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid`);return rows[0];}
  private async getOperation(tx:Prisma.TransactionClient,societyId:string,id:string){const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`SELECT "id","paymentId","operationType","status","provider","providerOperationId","amountPaise"::text AS "amountPaise","idempotencyKey","failureCode","failureMessage","requestedAt","settledAt" FROM "PaymentGatewayOperation" WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid`);return rows[0];}
  private rethrow(error:unknown,fallback:string):never{if(error instanceof BadRequestException||error instanceof ConflictException||error instanceof NotFoundException)throw error;const m=error instanceof Error?error.message:'';if(m.includes('unique')||m.includes('duplicate key'))throw new ConflictException('Gateway operation already exists');if(m.includes('foreign key'))throw new BadRequestException('Payment does not belong to this society or does not exist');if(m.includes('immutable')||m.includes('append-only'))throw new ConflictException(m);throw new BadRequestException(fallback);}
}
