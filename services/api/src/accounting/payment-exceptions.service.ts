import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ReverseAllocationInput={amountPaise:number;reason:string;idempotencyKey:string};
type RefundInput={amountPaise:number;reason:string;idempotencyKey:string;providerReference?:string};

@Injectable()
export class PaymentExceptionsService{
  constructor(private readonly prisma:PrismaService){}

  async paymentSnapshot(societyId:string,paymentId:string){
    const rows=await this.prisma.$queryRaw<Array<{id:string;status:string;amountPaise:bigint;grossAllocated:bigint;reversedAllocated:bigint;refundedPaise:bigint}>>(Prisma.sql`
      SELECT p."id",p."status",p."amountPaise",
        COALESCE((SELECT SUM(a."amountPaise") FROM "ReceivableAllocation" a WHERE a."societyId"=p."societyId" AND a."paymentId"=p."id"),0)::bigint AS "grossAllocated",
        COALESCE((SELECT SUM(r."amountPaise") FROM "ReceivableAllocationReversal" r JOIN "ReceivableAllocation" a ON a."id"=r."allocationId" AND a."societyId"=r."societyId" WHERE a."societyId"=p."societyId" AND a."paymentId"=p."id"),0)::bigint AS "reversedAllocated",
        COALESCE((SELECT SUM(rf."amountPaise") FROM "PaymentRefund" rf WHERE rf."societyId"=p."societyId" AND rf."paymentId"=p."id"),0)::bigint AS "refundedPaise"
      FROM "Payment" p WHERE p."societyId"=${societyId}::uuid AND p."id"=${paymentId}::uuid LIMIT 1
    `);
    if(!rows.length)throw new NotFoundException('Payment not found');
    const x=rows[0],net=x.grossAllocated-x.reversedAllocated,refundable=x.amountPaise-net-x.refundedPaise;
    return {paymentId:x.id,status:x.status,amountPaise:x.amountPaise.toString(),grossAllocatedPaise:x.grossAllocated.toString(),reversedAllocatedPaise:x.reversedAllocated.toString(),netAllocatedPaise:net.toString(),refundedPaise:x.refundedPaise.toString(),refundablePaise:refundable.toString()};
  }

  listAllocationReversals(societyId:string,paymentId:string){return this.prisma.$queryRaw(Prisma.sql`
    SELECT r."id",r."allocationId",a."receivableId",r."amountPaise"::text AS "amountPaise",r."reason",r."idempotencyKey",r."reversedByUserId",r."reversedAt"
    FROM "ReceivableAllocationReversal" r JOIN "ReceivableAllocation" a ON a."id"=r."allocationId" AND a."societyId"=r."societyId"
    WHERE r."societyId"=${societyId}::uuid AND a."paymentId"=${paymentId}::uuid ORDER BY r."reversedAt",r."id"
  `);}

  listRefunds(societyId:string,paymentId:string){return this.prisma.$queryRaw(Prisma.sql`
    SELECT "id","paymentId","amountPaise"::text AS "amountPaise","reason","providerReference","idempotencyKey","refundedByUserId","refundedAt"
    FROM "PaymentRefund" WHERE "societyId"=${societyId}::uuid AND "paymentId"=${paymentId}::uuid ORDER BY "refundedAt","id"
  `);}

  async reverseAllocation(societyId:string,userId:string,allocationId:string,input:ReverseAllocationInput){
    if(input.amountPaise<=0)throw new BadRequestException('Reversal amount must be positive');
    const reason=input.reason.trim(),key=input.idempotencyKey.trim();if(!reason||!key)throw new BadRequestException('Reason and idempotency key are required');
    return this.prisma.$transaction(async tx=>{
      const existing=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "ReceivableAllocationReversal" WHERE "societyId"=${societyId}::uuid AND "idempotencyKey"=${key} LIMIT 1`);
      if(existing.length)return this.getReversal(tx,societyId,existing[0].id);
      const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        INSERT INTO "ReceivableAllocationReversal" ("societyId","allocationId","amountPaise","reason","idempotencyKey","reversedByUserId")
        VALUES (${societyId}::uuid,${allocationId}::uuid,${input.amountPaise},${reason},${key},${userId}::uuid) RETURNING "id"
      `);return this.getReversal(tx,societyId,rows[0].id);
    }).catch(e=>this.rethrow(e,'Allocation could not be reversed'));
  }

  async recordRefund(societyId:string,userId:string,paymentId:string,input:RefundInput){
    if(input.amountPaise<=0)throw new BadRequestException('Refund amount must be positive');
    const reason=input.reason.trim(),key=input.idempotencyKey.trim();if(!reason||!key)throw new BadRequestException('Reason and idempotency key are required');
    return this.prisma.$transaction(async tx=>{
      const existing=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "PaymentRefund" WHERE "societyId"=${societyId}::uuid AND "idempotencyKey"=${key} LIMIT 1`);
      if(existing.length)return this.getRefund(tx,societyId,existing[0].id);
      const rows=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        INSERT INTO "PaymentRefund" ("societyId","paymentId","amountPaise","reason","providerReference","idempotencyKey","refundedByUserId")
        VALUES (${societyId}::uuid,${paymentId}::uuid,${input.amountPaise},${reason},${input.providerReference?.trim()||null},${key},${userId}::uuid) RETURNING "id"
      `);return this.getRefund(tx,societyId,rows[0].id);
    }).catch(e=>this.rethrow(e,'Refund could not be recorded'));
  }

  private async getReversal(tx:Prisma.TransactionClient,societyId:string,id:string){const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`SELECT "id","allocationId","amountPaise"::text AS "amountPaise","reason","idempotencyKey","reversedByUserId","reversedAt" FROM "ReceivableAllocationReversal" WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid`);return rows[0];}
  private async getRefund(tx:Prisma.TransactionClient,societyId:string,id:string){const rows=await tx.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`SELECT "id","paymentId","amountPaise"::text AS "amountPaise","reason","providerReference","idempotencyKey","refundedByUserId","refundedAt" FROM "PaymentRefund" WHERE "societyId"=${societyId}::uuid AND "id"=${id}::uuid`);return rows[0];}
  private rethrow(error:unknown,fallback:string):never{if(error instanceof BadRequestException||error instanceof ConflictException||error instanceof NotFoundException)throw error;const m=error instanceof Error?error.message:'';if(m.includes('exceeds')||m.includes('Only captured payments')||m.includes('append-only'))throw new ConflictException(m);if(m.includes('does not belong')||m.includes('foreign key'))throw new BadRequestException(m||'Invalid payment exception reference');if(m.includes('unique')||m.includes('duplicate key'))throw new ConflictException('Payment exception already exists');throw new BadRequestException(fallback);}
}
