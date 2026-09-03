import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type InvoiceRow = { id: string; societyId: string; unitId: string; amountPaise: number; status: 'ISSUED' | 'PAID' | 'VOID' };
type PaymentWebhookRow = { id: string; invoiceId: string; societyId: string; status: 'CREATED' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED' | 'REFUNDED' };

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

  listPaymentsMine(societyId: string, userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p."id", p."invoiceId", p."amountPaise", p."status",
        p."createdAt", p."completedAt", i."invoiceNumber", i."billingPeriod",
        u."number" AS "unitNumber", b."name" AS "buildingName"
      FROM "Payment" p
      JOIN "MaintenanceInvoice" i ON i."id" = p."invoiceId" AND i."societyId" = p."societyId"
      JOIN "Unit" u ON u."id" = i."unitId" AND u."societyId" = p."societyId"
      JOIN "Building" b ON b."id" = u."buildingId" AND b."societyId" = p."societyId"
      WHERE p."societyId" = ${societyId}::uuid
        AND EXISTS (
          SELECT 1 FROM "UnitOwnership" uo
          WHERE uo."unitId" = i."unitId" AND uo."societyId" = ${societyId}::uuid
            AND uo."userId" = ${userId}::uuid AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        )
      ORDER BY p."createdAt" DESC
    `);
  }

  getReceipt(societyId: string, userId: string, paymentId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p."id" AS "paymentId", CONCAT('AGR-', UPPER(SUBSTRING(p."id"::text, 1, 8))) AS "receiptNumber",
        p."amountPaise", p."status", p."completedAt",
        i."invoiceNumber", i."billingPeriod", i."paidAt",
        u."number" AS "unitNumber", b."name" AS "buildingName", s."name" AS "societyName"
      FROM "Payment" p
      JOIN "MaintenanceInvoice" i ON i."id" = p."invoiceId" AND i."societyId" = p."societyId"
      JOIN "Unit" u ON u."id" = i."unitId" AND u."societyId" = p."societyId"
      JOIN "Building" b ON b."id" = u."buildingId" AND b."societyId" = p."societyId"
      JOIN "Society" s ON s."id" = p."societyId"
      WHERE p."id" = ${paymentId}::uuid AND p."societyId" = ${societyId}::uuid
        AND p."status" IN ('CAPTURED', 'REFUNDED')
        AND EXISTS (
          SELECT 1 FROM "UnitOwnership" uo
          WHERE uo."unitId" = i."unitId" AND uo."societyId" = ${societyId}::uuid
            AND uo."userId" = ${userId}::uuid AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        )
      LIMIT 1
    `).then((rows) => {
      const receipt = (rows as unknown[])[0];
      if (!receipt) throw new NotFoundException('Receipt not found');
      return receipt;
    });
  }

  listPaymentAudit(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p."id", p."providerOrderId", p."providerPaymentId", p."amountPaise", p."status",
        p."createdAt", p."completedAt", i."invoiceNumber", u."number" AS "unitNumber", b."name" AS "buildingName",
        COALESCE(json_agg(json_build_object('type', pe."type", 'occurredAt', pe."occurredAt", 'providerEventId', pe."providerEventId")
          ORDER BY pe."occurredAt") FILTER (WHERE pe."id" IS NOT NULL), '[]') AS "events"
      FROM "Payment" p
      JOIN "MaintenanceInvoice" i ON i."id" = p."invoiceId" AND i."societyId" = p."societyId"
      JOIN "Unit" u ON u."id" = i."unitId" AND u."societyId" = p."societyId"
      JOIN "Building" b ON b."id" = u."buildingId" AND b."societyId" = p."societyId"
      LEFT JOIN "PaymentEvent" pe ON pe."paymentId" = p."id" AND pe."societyId" = p."societyId"
      WHERE p."societyId" = ${societyId}::uuid
      GROUP BY p."id", i."invoiceNumber", u."number", b."name"
      ORDER BY p."createdAt" DESC
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
      const existing = await tx.$queryRaw<{ invoiceId: string }[]>(Prisma.sql`SELECT * FROM "Payment" WHERE "societyId"=${societyId}::uuid AND "payerUserId"=${userId}::uuid AND "idempotencyKey"=${normalizedKey} LIMIT 1`);
      if (existing[0]) {
        if (existing[0].invoiceId !== invoiceId) throw new BadRequestException('Idempotency key is already used for another invoice');
        return existing[0];
      }
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
      const orders = await tx.$queryRaw<PaymentWebhookRow[]>(Prisma.sql`
        SELECT "id", "invoiceId", "societyId", "status" FROM "Payment"
        WHERE "providerOrderId"=${event.providerOrderId} AND "provider"='gateway-adapter'
        FOR UPDATE
      `);
      const order = orders[0];
      if (!order) throw new NotFoundException('Payment order not found');
      const claimed = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO "PaymentEvent" ("societyId","paymentId","providerEventId","type","payloadDigest")
        VALUES (${order.societyId}::uuid,${order.id}::uuid,${event.eventId},${`WEBHOOK_${event.status}`},${createHash('sha256').update(canonical).digest('hex')})
        ON CONFLICT ("providerEventId") DO NOTHING RETURNING "id"
      `);
      if (!claimed[0]) return { duplicate: true };
      const rows = await tx.$queryRaw<{ id: string; invoiceId: string; societyId: string }[]>(Prisma.sql`
        UPDATE "Payment" SET "status"=${event.status}::"PaymentStatus", "providerPaymentId"=${event.providerPaymentId},
          "completedAt"=CASE WHEN ${event.status}='CAPTURED' THEN CURRENT_TIMESTAMP ELSE "completedAt" END, "updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${order.id}::uuid
          AND ((${event.status} IN ('CAPTURED','FAILED') AND "status" IN ('CREATED','AUTHORIZED'))
            OR (${event.status}='REFUNDED' AND "status"='CAPTURED'))
        RETURNING "id","invoiceId","societyId"
      `);
      const payment = rows[0];
      if (!payment) throw new BadRequestException('Invalid payment state transition');
      if (event.status === 'CAPTURED') await tx.$executeRaw(Prisma.sql`UPDATE "MaintenanceInvoice" SET "status"='PAID',"paidAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${payment.invoiceId}::uuid AND "societyId"=${payment.societyId}::uuid AND "status"='ISSUED'`);
      if (event.status === 'REFUNDED') await tx.$executeRaw(Prisma.sql`UPDATE "MaintenanceInvoice" SET "status"='ISSUED',"paidAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${payment.invoiceId}::uuid AND "societyId"=${payment.societyId}::uuid AND "status"='PAID'`);
      return { ok: true, paymentId: payment.id, status: event.status };
    });
  }
}
