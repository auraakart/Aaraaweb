import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { currentPayerPropertySql } from '../auth/property-scope.sql';
import { PrismaService } from '../prisma/prisma.service';
import { receiptReferenceSql } from './receipt-reference';

export function statementWindow(from: string, to: string) {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Use YYYY-MM-DD dates');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Invalid date');
    return date;
  };
  const start = parse(from), end = parse(to);
  const days = (end.getTime() - start.getTime()) / 86400000;
  if (days < 0 || days > 365) throw new BadRequestException('Choose up to 366 calendar days');
  return { start: new Date(start.getTime() - 19800000), end: new Date(end.getTime() + 86400000 - 19800000) };
}

// Activity statement, not a fabricated general ledger or closing balance.
export class ResidentStatementService {
  constructor(private readonly prisma: PrismaService) {}
  statement(societyId: string, userId: string, unitId: string, from: string, to: string) {
    const window = statementWindow(from, to);
    return this.prisma.withTenantContext(societyId, async tx => {
      const [property] = await tx.$queryRaw<Array<{ unitNumber: string; buildingName: string; societyName: string }>>(Prisma.sql`
        SELECT u."number" AS "unitNumber", b."name" AS "buildingName", s."name" AS "societyName"
        FROM "Unit" u JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=u."societyId"
        JOIN "Society" s ON s."id"=u."societyId"
        WHERE u."id"=${unitId}::uuid AND u."societyId"=${societyId}::uuid
          AND ${currentPayerPropertySql(societyId, userId, unitId)}`);
      if (!property) throw new NotFoundException('Property not found');
      const invoices = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT i."id", i."invoiceNumber", i."billingPeriod", i."amountPaise", i."status", i."createdAt", i."dueDate"
        FROM "MaintenanceInvoice" i WHERE i."societyId"=${societyId}::uuid AND i."unitId"=${unitId}::uuid
          AND i."createdAt">=${window.start} AND i."createdAt"<${window.end}
          AND ${currentPayerPropertySql(societyId, userId, unitId)}
        ORDER BY i."createdAt", i."id" LIMIT 1001`);
      const payments = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT p."id", i."invoiceNumber", p."amountPaise", p."status", p."createdAt", p."completedAt",
          CASE WHEN p."status" IN ('CAPTURED','REFUNDED') THEN ${receiptReferenceSql} ELSE NULL END AS "receiptNumber"
        FROM "Payment" p JOIN "MaintenanceInvoice" i ON i."id"=p."invoiceId" AND i."societyId"=p."societyId"
        WHERE p."societyId"=${societyId}::uuid AND i."unitId"=${unitId}::uuid AND p."purposeType"='MAINTENANCE_INVOICE'
          AND p."createdAt">=${window.start} AND p."createdAt"<${window.end}
          AND ${currentPayerPropertySql(societyId, userId, unitId)}
          AND (p."payerUserId"=${userId}::uuid OR EXISTS (
            SELECT 1 FROM "UnitOwnership" own WHERE own."societyId"=${societyId}::uuid
              AND own."unitId"=${unitId}::uuid AND own."userId"=${userId}::uuid
              AND own."active"=TRUE AND own."verified"=TRUE AND own."effectiveFrom"<=CURRENT_TIMESTAMP
              AND (own."effectiveTo" IS NULL OR own."effectiveTo">CURRENT_TIMESTAMP)))
        ORDER BY p."createdAt", p."id" LIMIT 1001`);
      if (invoices.length > 1000 || payments.length > 1000) throw new BadRequestException('Choose a shorter period; export exceeds 1000 records per section');
      return { unitId, ...property, from, to, currency: 'INR', invoices, payments,
        scope: 'MAINTENANCE_ACTIVITY', dateBasis: 'RECORD_CREATED_AT_ASIA_KOLKATA',
        boundary: 'Maintenance invoice and payment activity only. Amounts are original record amounts; refunded payments are labelled, not treated as net collections. No opening/closing balance, utility, advance or deposit ledger is implied.' };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
