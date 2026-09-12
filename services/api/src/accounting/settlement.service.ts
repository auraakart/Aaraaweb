import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AllocationInput = { paymentId: string; amountPaise: number; idempotencyKey: string };

@Injectable()
export class SettlementService {
  constructor(private readonly prisma: PrismaService) {}

  async allocate(societyId: string, userId: string, receivableId: string, input: AllocationInput) {
    if (input.amountPaise <= 0) throw new BadRequestException('Allocation amount must be positive');
    const key = input.idempotencyKey.trim();
    if (!key) throw new BadRequestException('Idempotency key is required');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "ReceivableAllocation"
        WHERE "societyId" = ${societyId}::uuid AND "idempotencyKey" = ${key}
        LIMIT 1
      `);
      if (existing.length) return this.getAllocation(tx, societyId, existing[0].id);

      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO "ReceivableAllocation" (
          "societyId", "receivableId", "paymentId", "amountPaise", "idempotencyKey", "allocatedByUserId"
        ) VALUES (
          ${societyId}::uuid, ${receivableId}::uuid, ${input.paymentId}::uuid, ${input.amountPaise}, ${key}, ${userId}::uuid
        ) RETURNING "id"
      `);
      return this.getAllocation(tx, societyId, rows[0].id);
    }).catch((error) => this.rethrow(error));
  }

  listPaymentAllocations(societyId: string, paymentId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT a."id", a."receivableId", a."paymentId", a."amountPaise"::text AS "amountPaise",
             COALESCE((SELECT SUM(r."amountPaise") FROM "ReceivableAllocationReversal" r WHERE r."societyId"=a."societyId" AND r."allocationId"=a."id"),0)::text AS "reversedPaise",
             (a."amountPaise"-COALESCE((SELECT SUM(r."amountPaise") FROM "ReceivableAllocationReversal" r WHERE r."societyId"=a."societyId" AND r."allocationId"=a."id"),0))::text AS "reversiblePaise",
             a."idempotencyKey", a."allocatedByUserId", a."allocatedAt"
      FROM "ReceivableAllocation" a
      WHERE a."societyId" = ${societyId}::uuid AND a."paymentId" = ${paymentId}::uuid
      ORDER BY a."allocatedAt", a."id"
    `);
  }

  async paymentAvailability(societyId: string, paymentId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ amountPaise: bigint; status: string; grossAllocatedPaise: bigint; reversedPaise: bigint; refundedPaise: bigint }>>(Prisma.sql`
      SELECT p."amountPaise", p."status",
             COALESCE((SELECT SUM(a."amountPaise") FROM "ReceivableAllocation" a WHERE a."paymentId"=p."id" AND a."societyId"=p."societyId"),0)::bigint AS "grossAllocatedPaise",
             COALESCE((SELECT SUM(r."amountPaise") FROM "ReceivableAllocationReversal" r JOIN "ReceivableAllocation" a ON a."id"=r."allocationId" AND a."societyId"=r."societyId" WHERE a."paymentId"=p."id" AND a."societyId"=p."societyId"),0)::bigint AS "reversedPaise",
             COALESCE((SELECT SUM(rf."amountPaise") FROM "PaymentRefund" rf WHERE rf."paymentId"=p."id" AND rf."societyId"=p."societyId"),0)::bigint AS "refundedPaise"
      FROM "Payment" p
      WHERE p."societyId" = ${societyId}::uuid AND p."id" = ${paymentId}::uuid
    `);
    if (!rows.length) throw new NotFoundException('Payment not found');
    const row = rows[0];
    const netAllocated=row.grossAllocatedPaise-row.reversedPaise;
    const available=row.amountPaise-netAllocated-row.refundedPaise;
    return {
      paymentId,
      status: row.status,
      amountPaise: row.amountPaise.toString(),
      allocatedPaise: netAllocated.toString(),
      grossAllocatedPaise: row.grossAllocatedPaise.toString(),
      reversedPaise: row.reversedPaise.toString(),
      refundedPaise: row.refundedPaise.toString(),
      unallocatedPaise: available.toString(),
      availablePaise: available.toString(),
    };
  }

  private async getAllocation(tx: Prisma.TransactionClient, societyId: string, allocationId: string) {
    const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      SELECT a."id", a."receivableId", a."paymentId", a."amountPaise"::text AS "amountPaise",
             a."idempotencyKey", a."allocatedByUserId", a."allocatedAt",
             r."status" AS "receivableStatus"
      FROM "ReceivableAllocation" a
      JOIN "Receivable" r ON r."id" = a."receivableId" AND r."societyId" = a."societyId"
      WHERE a."societyId" = ${societyId}::uuid AND a."id" = ${allocationId}::uuid
    `);
    return rows[0];
  }

  private rethrow(error: unknown): never {
    if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException) throw error;
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Only captured payments') || message.includes('exceeds') || message.includes('Void receivable')) {
      throw new ConflictException(message);
    }
    if (message.includes('does not belong') || message.includes('foreign key')) throw new BadRequestException(message || 'Invalid settlement reference');
    if (message.includes('unique') || message.includes('duplicate key')) throw new ConflictException('Allocation already exists');
    throw new BadRequestException('Payment allocation could not be completed');
  }
}
