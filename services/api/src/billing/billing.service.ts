import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type InvoiceRow = { id: string; societyId: string; unitId: string; amountPaise: number; status: 'ISSUED' | 'PAID' | 'VOID' };

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  listMine(societyId: string, userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT i.*, u."number" AS "unitNumber", b."name" AS "buildingName"
      FROM "MaintenanceInvoice" i
      JOIN "Unit" u ON u."id" = i."unitId"
      JOIN "Building" b ON b."id" = u."buildingId"
      WHERE i."societyId" = ${societyId}::uuid AND u."societyId" = ${societyId}::uuid
        AND EXISTS (
          SELECT 1 FROM "UnitOwnership" uo
          WHERE uo."unitId" = i."unitId"
            AND uo."societyId" = ${societyId}::uuid
            AND uo."userId" = ${userId}::uuid
            AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        )
      ORDER BY i."dueDate" DESC
    `);
  }

  listForSociety(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT i.*, u."number" AS "unitNumber", b."name" AS "buildingName"
      FROM "MaintenanceInvoice" i JOIN "Unit" u ON u."id" = i."unitId" JOIN "Building" b ON b."id" = u."buildingId"
      WHERE i."societyId" = ${societyId}::uuid AND u."societyId" = ${societyId}::uuid
      ORDER BY i."dueDate" DESC
    `);
  }

  listBillableUnits(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT u."id", u."number" AS "unitNumber", b."name" AS "buildingName"
      FROM "Unit" u
      JOIN "Building" b ON b."id" = u."buildingId"
      WHERE u."societyId" = ${societyId}::uuid
        AND b."societyId" = ${societyId}::uuid
      ORDER BY b."name", u."number"
    `);
  }

  async issue(societyId: string, actorUserId: string, input: { unitId: string; billingPeriod: string; amountPaise: number; dueDate: string; description?: string }) {
    if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise < 100) throw new BadRequestException('Invoice amount must be at least one rupee');
    const units = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT "id" FROM "Unit" WHERE "id"=${input.unitId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);
    if (!units[0]) throw new NotFoundException('Unit not found');
    const invoiceNumber = `${input.billingPeriod.replace('-', '')}-${input.unitId.slice(0, 8).toUpperCase()}`;
    const rows = await this.prisma.$queryRaw(Prisma.sql`
      INSERT INTO "MaintenanceInvoice" ("societyId","unitId","createdById","invoiceNumber","billingPeriod","description","amountPaise","dueDate")
      VALUES (${societyId}::uuid,${input.unitId}::uuid,${actorUserId}::uuid,${invoiceNumber},${input.billingPeriod},${input.description?.trim() || null},${input.amountPaise},${input.dueDate}::date)
      RETURNING *
    `);
    return (rows as unknown[])[0];
  }

  async createPayment(societyId: string, userId: string, invoiceId: string, idempotencyKey: string) {
    const invoices = await this.prisma.$queryRaw<InvoiceRow[]>(Prisma.sql`
      SELECT i.* FROM "MaintenanceInvoice" i
      WHERE i."id"=${invoiceId}::uuid AND i."societyId"=${societyId}::uuid
        AND EXISTS (
          SELECT 1 FROM "UnitOwnership" uo
          WHERE uo."unitId" = i."unitId"
            AND uo."societyId" = ${societyId}::uuid
            AND uo."userId" = ${userId}::uuid
            AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        )
      LIMIT 1
    `);
    const invoice = invoices[0];
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'ISSUED') throw new BadRequestException('Invoice is not payable');
    const normalizedKey = idempotencyKey.trim();
    const providerOrderId = `aaraagate_${randomUUID()}`;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.$queryRaw(Prisma.sql`SELECT * FROM "Payment" WHERE "societyId"=${societyId}::uuid AND "payerUserId"=${userId}::uuid AND "idempotencyKey"=${normalizedKey} LIMIT 1`);
      if ((existing as unknown[])[0]) return (existing as unknown[])[0];
      const rows = await tx.$queryRaw(Prisma.sql`
        INSERT INTO "Payment" ("societyId","invoiceId","payerUserId","idempotencyKey","provider","providerOrderId","amountPaise")
        VALUES (${societyId}::uuid,${invoiceId}::uuid,${userId}::uuid,${normalizedKey},'gateway-adapter',${providerOrderId},${invoice.amountPaise})
        ON CONFLICT ("societyId","payerUserId","idempotencyKey") DO UPDATE SET "idempotencyKey"=EXCLUDED."idempotencyKey"
        RETURNING *
      `);
      const payment = (rows as { id: string }[])[0];
      await tx.$executeRaw(Prisma.sql`INSERT INTO "PaymentEvent" ("societyId","paymentId","actorUserId","type") VALUES (${societyId}::uuid,${payment.id}::uuid,${userId}::uuid,'ORDER_CREATED')`);
      return payment;
    });
  }

  async reconcile(signature: string | undefined, event: { eventId: string; providerOrderId: string; providerPaymentId: string; status: 'CAPTURED' | 'FAILED' | 'REFUNDED' }) {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) throw new UnauthorizedException('Payment webhook is not configured');
    const canonical = `${event.eventId}|${event.providerOrderId}|${event.providerPaymentId}|${event.status}`;
    const expected = createHmac('sha256', secret).update(canonical).digest('hex');
    if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new UnauthorizedException('Invalid payment signature');
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PaymentEvent" WHERE "providerEventId"=${event.eventId} LIMIT 1`);
      if ((duplicate as unknown[])[0]) return { duplicate: true };
      const rows = await tx.$queryRaw<{ id: string; invoiceId: string; societyId: string }[]>(Prisma.sql`
        UPDATE "Payment" SET "status"=${event.status}::"PaymentStatus", "providerPaymentId"=${event.providerPaymentId},
          "completedAt"=CASE WHEN ${event.status}='CAPTURED' THEN CURRENT_TIMESTAMP ELSE "completedAt" END, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "providerOrderId"=${event.providerOrderId} AND "provider"='gateway-adapter'
          AND ((${event.status} IN ('CAPTURED','FAILED') AND "status" IN ('CREATED','AUTHORIZED'))
            OR (${event.status}='REFUNDED' AND "status"='CAPTURED'))
        RETURNING "id","invoiceId","societyId"
      `);
      const payment = rows[0];
      if (!payment) throw new NotFoundException('Payment order not found');
      if (event.status === 'CAPTURED') await tx.$executeRaw(Prisma.sql`UPDATE "MaintenanceInvoice" SET "status"='PAID',"paidAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${payment.invoiceId}::uuid AND "societyId"=${payment.societyId}::uuid AND "status"='ISSUED'`);
      if (event.status === 'REFUNDED') await tx.$executeRaw(Prisma.sql`UPDATE "MaintenanceInvoice" SET "status"='ISSUED',"paidAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${payment.invoiceId}::uuid AND "societyId"=${payment.societyId}::uuid AND "status"='PAID'`);
      const digest = createHash('sha256').update(canonical).digest('hex');
      await tx.$executeRaw(Prisma.sql`INSERT INTO "PaymentEvent" ("societyId","paymentId","providerEventId","type","payloadDigest") VALUES (${payment.societyId}::uuid,${payment.id}::uuid,${event.eventId},${`WEBHOOK_${event.status}`},${digest})`);
      return { ok: true, paymentId: payment.id, status: event.status };
    });
  }
}
