import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type UnappliedCashSummary = {
  paymentCount: number;
  unappliedPaise: string;
};

@Injectable()
export class PaymentAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async unappliedCashSummary(societyId: string): Promise<UnappliedCashSummary> {
    const rows = await this.prisma.$queryRaw<UnappliedCashSummary[]>(Prisma.sql`
      WITH allocation_totals AS (
        SELECT a."societyId",a."paymentId",SUM(a."amountPaise")::bigint AS "allocatedPaise"
        FROM "ReceivableAllocation" a
        WHERE a."societyId"=${societyId}::uuid AND a."paymentId" IS NOT NULL
        GROUP BY a."societyId",a."paymentId"
      ),
      reversal_totals AS (
        SELECT a."societyId",a."paymentId",SUM(r."amountPaise")::bigint AS "reversedPaise"
        FROM "ReceivableAllocationReversal" r
        JOIN "ReceivableAllocation" a ON a."id"=r."allocationId" AND a."societyId"=r."societyId"
        WHERE a."societyId"=${societyId}::uuid AND a."paymentId" IS NOT NULL
        GROUP BY a."societyId",a."paymentId"
      ),
      refund_totals AS (
        SELECT r."societyId",r."paymentId",SUM(r."amountPaise")::bigint AS "refundedPaise"
        FROM "PaymentRefund" r
        WHERE r."societyId"=${societyId}::uuid
        GROUP BY r."societyId",r."paymentId"
      ),
      available AS (
        SELECT p."id",
          GREATEST(
            p."amountPaise"::bigint
              - COALESCE(a."allocatedPaise",0)
              + COALESCE(rv."reversedPaise",0)
              - COALESCE(rf."refundedPaise",0),
            0::bigint
          ) AS "availablePaise"
        FROM "Payment" p
        LEFT JOIN allocation_totals a ON a."societyId"=p."societyId" AND a."paymentId"=p."id"
        LEFT JOIN reversal_totals rv ON rv."societyId"=p."societyId" AND rv."paymentId"=p."id"
        LEFT JOIN refund_totals rf ON rf."societyId"=p."societyId" AND rf."paymentId"=p."id"
        WHERE p."societyId"=${societyId}::uuid AND p."status"='CAPTURED'
      )
      SELECT COUNT(*) FILTER (WHERE "availablePaise">0)::int AS "paymentCount",
             COALESCE(SUM("availablePaise") FILTER (WHERE "availablePaise">0),0)::text AS "unappliedPaise"
      FROM available
    `);
    return rows[0] ?? { paymentCount: 0, unappliedPaise: '0' };
  }
}
