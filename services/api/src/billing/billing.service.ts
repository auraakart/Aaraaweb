import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { currentPayerPropertySql } from '../auth/property-scope.sql';
import { NotificationRealtimeService } from '../notifications/notification-realtime.service';
import type { ResidentMessageEvent } from '../notifications/notification-realtime.service';
import { PushDeliveryOutboxService } from '../notifications/push-delivery-outbox.service';
import { residentPushDedupeKey } from '../notifications/push-notification.service';
import { PaymentWebhookProcessor } from './payment-webhook.processor';
import { PaymentOrderService } from './payment-order.service';

export type PaymentWebhookRow = {
  id:string;invoiceId:string|null;amenityBookingId:string|null;societyId:string;purposeType:'MAINTENANCE_INVOICE'|'AMENITY_DEPOSIT';
  status:'CREATED'|'AUTHORIZED'|'CAPTURED'|'FAILED'|'REFUNDED';
};
export type PaymentWebhookEvent = { eventId: string; providerOrderId: string; providerPaymentId: string; status: 'CAPTURED' | 'FAILED' | 'REFUNDED' };
type PaymentWebhookReceiptRow = {
  id: string;
  societyId: string;
  paymentId: string;
  payloadDigest: string;
  processingStatus: 'RECEIVED' | 'PROCESSED' | 'FAILED';
};

@Injectable()
export class BillingService {
  private readonly webhookProcessor: PaymentWebhookProcessor;
  private readonly paymentOrders: PaymentOrderService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime?: NotificationRealtimeService,
    private readonly outbox?: PushDeliveryOutboxService,
  ) {
    this.webhookProcessor = new PaymentWebhookProcessor(prisma);
    this.paymentOrders = new PaymentOrderService(prisma);
  }

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
            AND uo."verified" = true
            AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        )
      ORDER BY i."dueDate" DESC
    `);
  }

  listPayable(societyId: string, userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT i.*, u."number" AS "unitNumber", b."name" AS "buildingName"
      FROM "MaintenanceInvoice" i
      JOIN "Unit" u ON u."id" = i."unitId" AND u."societyId" = i."societyId"
      JOIN "Building" b ON b."id" = u."buildingId" AND b."societyId" = i."societyId"
      WHERE i."societyId" = ${societyId}::uuid AND (
        EXISTS (
          SELECT 1 FROM "UnitOwnership" uo
          WHERE uo."unitId" = i."unitId" AND uo."societyId" = ${societyId}::uuid
            AND uo."userId" = ${userId}::uuid AND uo."verified" = true AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        ) OR EXISTS (
          SELECT 1 FROM "UnitOccupancy" ur
          WHERE ur."unitId" = i."unitId" AND ur."societyId" = ${societyId}::uuid
            AND ur."userId" = ${userId}::uuid AND ur."relation" = 'TENANT' AND ur."active" = true
            AND ur."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (ur."effectiveTo" IS NULL OR ur."effectiveTo" > CURRENT_TIMESTAMP)
        )
      )
      ORDER BY i."dueDate" DESC
    `);
  }

  async residentSummary(societyId:string,userId:string,unitId?:string) {
    const invoices=(await this.listPayable(societyId,userId)) as Array<{
      id:string;unitId:string;amountPaise:number;status:string;dueDate:Date|string;
    }>;
    const payments=(await this.listPaymentsMine(societyId,userId)) as Array<{
      invoiceId:string;amountPaise:number;status:string;createdAt:Date|string;completedAt:Date|string|null;
    }>;
    const scopedInvoices=unitId?invoices.filter(invoice=>invoice.unitId===unitId):invoices;
    const invoiceIds=new Set(scopedInvoices.map(invoice=>invoice.id));
    const scopedPayments=payments.filter(payment=>invoiceIds.has(payment.invoiceId));
    const open=scopedInvoices.filter(invoice=>invoice.status==='ISSUED');
    const today=new Date();today.setHours(0,0,0,0);
    const overdue=open.filter(invoice=>new Date(invoice.dueDate).getTime()<today.getTime());
    const nextDue=open.map(invoice=>new Date(invoice.dueDate)).filter(date=>Number.isFinite(date.getTime())).sort((a,b)=>a.getTime()-b.getTime())[0]??null;
    const recovery=scopedPayments.filter(payment=>['CREATED','AUTHORIZED','FAILED'].includes(payment.status));
    const completed=scopedPayments.filter(payment=>payment.status==='CAPTURED');
    return {
      unitId:unitId??null,
      outstandingPaise:open.reduce((sum,invoice)=>sum+Number(invoice.amountPaise),0),
      overduePaise:overdue.reduce((sum,invoice)=>sum+Number(invoice.amountPaise),0),
      openInvoiceCount:open.length,
      overdueInvoiceCount:overdue.length,
      paymentRecoveryCount:recovery.length,
      capturedPaymentCount:completed.length,
      nextDueDate:nextDue?.toISOString().slice(0,10)??null,
      checkoutPolicy:{
        mode:'FULL_INVOICE',
        residentPartialPayment:false,
        advanceBalanceVisibility:false,
        ownerAndCurrentTenantEligible:true,
        payerPrivateEvidence:true,
        explanation:'Resident checkout currently pays one invoice at a time. Accounting allocations and unapplied credits remain authoritative in the accounting domain and are not inferred in this resident summary.',
      },
    };
  }


  async getAutopayPreference(societyId:string,userId:string,unitId:string) {
    await this.assertCurrentPayer(societyId,userId,unitId);
    const rows=await this.prisma.$queryRaw<Array<{enabled:boolean;maxAmountPaise:number|null;debitDaysBefore:number;provider:string|null;providerMandateId:string|null;providerMandateStatus:string|null;updatedAt:Date}>>(Prisma.sql`
      SELECT "enabled","maxAmountPaise","debitDaysBefore","provider","providerMandateId","providerMandateStatus","updatedAt"
      FROM "PaymentAutopayPreference"
      WHERE "societyId"=${societyId}::uuid AND "unitId"=${unitId}::uuid AND "payerUserId"=${userId}::uuid LIMIT 1
    `);
    const row=rows[0];
    const mandateRecorded=!!row?.provider && !!row?.providerMandateId && row?.providerMandateStatus==='ACTIVE';
    return {unitId,enabled:row?.enabled??false,maxAmountPaise:row?.maxAmountPaise??null,debitDaysBefore:row?.debitDaysBefore??1,
      executionState:mandateRecorded?'MANDATE_RECORDED_NO_EXECUTOR':'PROVIDER_UNBOUND',automaticDebitAvailable:false,
      providerMandateStatus:row?.providerMandateStatus??null,updatedAt:row?.updatedAt??null,
      boundary:'This records the resident AutoPay preference only. No automatic debit is attempted or treated as successful until a payment-mandate provider and debit executor are explicitly integrated and confirmed.'};
  }

  async setAutopayPreference(societyId:string,userId:string,input:{unitId:string;enabled:boolean;maxAmountPaise?:number;debitDaysBefore:number}) {
    await this.assertCurrentPayer(societyId,userId,input.unitId);
    const rows=await this.prisma.$queryRaw<Array<{enabled:boolean;maxAmountPaise:number|null;debitDaysBefore:number;provider:string|null;providerMandateId:string|null;providerMandateStatus:string|null;updatedAt:Date}>>(Prisma.sql`
      INSERT INTO "PaymentAutopayPreference" ("societyId","unitId","payerUserId","enabled","maxAmountPaise","debitDaysBefore")
      VALUES (${societyId}::uuid,${input.unitId}::uuid,${userId}::uuid,${input.enabled},${input.maxAmountPaise??null},${input.debitDaysBefore})
      ON CONFLICT ("societyId","unitId","payerUserId") DO UPDATE SET
        "enabled"=EXCLUDED."enabled","maxAmountPaise"=EXCLUDED."maxAmountPaise","debitDaysBefore"=EXCLUDED."debitDaysBefore","updatedAt"=CURRENT_TIMESTAMP
      RETURNING "enabled","maxAmountPaise","debitDaysBefore","provider","providerMandateId","providerMandateStatus","updatedAt"
    `);
    const row=rows[0];
    const mandateRecorded=!!row?.provider && !!row?.providerMandateId && row?.providerMandateStatus==='ACTIVE';
    return {unitId:input.unitId,enabled:row?.enabled??input.enabled,maxAmountPaise:row?.maxAmountPaise??input.maxAmountPaise??null,
      debitDaysBefore:row?.debitDaysBefore??input.debitDaysBefore,executionState:mandateRecorded?'MANDATE_RECORDED_NO_EXECUTOR':'PROVIDER_UNBOUND',
      automaticDebitAvailable:false,providerMandateStatus:row?.providerMandateStatus??null,updatedAt:row?.updatedAt??null,
      boundary:'Preference saved. Automatic debit remains unavailable until a payment-mandate provider and debit executor are explicitly integrated and confirmed.'};
  }

  private async assertCurrentPayer(societyId:string,userId:string,unitId:string) {
    const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT u."id" FROM "Unit" u
      WHERE u."id"=${unitId}::uuid AND u."societyId"=${societyId}::uuid
        AND ${currentPayerPropertySql(societyId,userId,unitId)}
      LIMIT 1
    `);
    if(!rows[0]) throw new NotFoundException('Current owner or tenant relationship is required for this property payment preference');
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
        AND p."purposeType"='MAINTENANCE_INVOICE'
        AND (p."payerUserId" = ${userId}::uuid OR EXISTS (
          SELECT 1 FROM "UnitOwnership" uo
          WHERE uo."unitId" = i."unitId" AND uo."societyId" = ${societyId}::uuid
            AND uo."userId" = ${userId}::uuid AND uo."verified" = true AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        ))
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
        AND p."purposeType"='MAINTENANCE_INVOICE'
        AND p."status" IN ('CAPTURED', 'REFUNDED')
        AND (p."payerUserId" = ${userId}::uuid OR EXISTS (
          SELECT 1 FROM "UnitOwnership" uo
          WHERE uo."unitId" = i."unitId" AND uo."societyId" = ${societyId}::uuid
            AND uo."userId" = ${userId}::uuid AND uo."verified" = true AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        ))
      LIMIT 1
    `).then((rows) => {
      const receipt = (rows as unknown[])[0];
      if (!receipt) throw new NotFoundException('Receipt not found');
      return receipt;
    });
  }

  listPaymentAudit(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p."id",p."purposeType",p."providerOrderId",p."providerPaymentId",p."amountPaise",p."status",
        p."createdAt",p."completedAt",
        COALESCE(i."invoiceNumber",CONCAT('Amenity deposit · ',a."name")) AS "invoiceNumber",
        u."number" AS "unitNumber",b."name" AS "buildingName",
        COALESCE(json_agg(json_build_object('type', pe."type", 'occurredAt', pe."occurredAt", 'providerEventId', pe."providerEventId")
          ORDER BY pe."occurredAt") FILTER (WHERE pe."id" IS NOT NULL), '[]') AS "events"
      FROM "Payment" p
      LEFT JOIN "MaintenanceInvoice" i ON i."id"=p."invoiceId" AND i."societyId"=p."societyId"
      LEFT JOIN "AmenityBooking" ab ON ab."id"=p."amenityBookingId" AND ab."societyId"=p."societyId"
      LEFT JOIN "Amenity" a ON a."id"=ab."amenityId" AND a."societyId"=ab."societyId"
      JOIN "Unit" u ON u."id"=COALESCE(i."unitId",ab."unitId") AND u."societyId"=p."societyId"
      JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=p."societyId"
      LEFT JOIN "PaymentEvent" pe ON pe."paymentId"=p."id" AND pe."societyId"=p."societyId"
      WHERE p."societyId"=${societyId}::uuid
      GROUP BY p."id",i."invoiceNumber",a."name",u."number",b."name"
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
    const invoiceNumber = `${input.billingPeriod.replace('-', '')}-${input.unitId.slice(0, 8).toUpperCase()}`;
    const { invoice, events } = await this.prisma.$transaction(async (tx) => {
      const units = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "Unit"
        WHERE "id"=${input.unitId}::uuid AND "societyId"=${societyId}::uuid
        LIMIT 1
      `);
      if (!units[0]) throw new NotFoundException('Unit not found');

      const rows = await tx.$queryRaw<Array<{ id: string; invoiceNumber: string; amountPaise: number }>>(Prisma.sql`
        INSERT INTO "MaintenanceInvoice" ("societyId","unitId","createdById","invoiceNumber","billingPeriod","description","amountPaise","dueDate")
        VALUES (${societyId}::uuid,${input.unitId}::uuid,${actorUserId}::uuid,${invoiceNumber},${input.billingPeriod},${input.description?.trim() || null},${input.amountPaise},${input.dueDate}::date)
        RETURNING *
      `);
      const invoice = rows[0];
      const recipients = invoice && (this.realtime || this.outbox)
        ? await tx.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
            SELECT "userId" FROM "UnitOwnership"
            WHERE "societyId"=${societyId}::uuid AND "unitId"=${input.unitId}::uuid
              AND "verified"=true AND "active"=true AND "effectiveFrom"<=CURRENT_TIMESTAMP
              AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP)
            UNION
            SELECT "userId" FROM "UnitOccupancy"
            WHERE "societyId"=${societyId}::uuid AND "unitId"=${input.unitId}::uuid
              AND "relation"='TENANT' AND "active"=true AND "effectiveFrom"<=CURRENT_TIMESTAMP
              AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP)
          `)
        : [];
      const events: ResidentMessageEvent[] = invoice ? recipients.map(({ userId }) => ({
        type: 'MAINTENANCE_DUE_ISSUED', societyId, userId, unitId: input.unitId, invoiceId: invoice.id,
        title: 'Maintenance payment due',
        body: `Invoice ${invoice.invoiceNumber} for ₹${(invoice.amountPaise / 100).toFixed(2)} is due on ${input.dueDate}.`,
        createdAt: new Date().toISOString(),
      })) : [];
      // Persist delivery intent with the invoice. Post-commit realtime dispatch
      // reuses the same dedupe keys; a crash cannot lose the durable push work.
      for (const event of events) {
        if (this.outbox) await this.outbox.enqueue({
          targetScope: 'RESIDENT', societyId, userId: event.userId!,
          eventType: event.type, dedupeKey: residentPushDedupeKey(event),
          payload: event as unknown as Record<string, unknown>,
        }, tx);
      }
      return { invoice, events };
    });

    if (invoice && this.realtime) {
      events.forEach((event) => this.realtime?.publishResident(event));
    }
    return invoice;
  }

  createPayment(societyId: string, userId: string, invoiceId: string, idempotencyKey: string) {
    return this.paymentOrders.createPayment(societyId, userId, invoiceId, idempotencyKey);
  }

  createAmenityDepositPayment(societyId:string,userId:string,bookingId:string,idempotencyKey:string) {
    return this.paymentOrders.createAmenityDepositPayment(societyId,userId,bookingId,idempotencyKey);
  }

  listWebhookReceipts(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT r."id",r."paymentId",r."providerEventId",r."providerOrderId",r."providerPaymentId",
             r."eventStatus",r."processingStatus",r."receiveCount",r."lastReceivedAt",r."processedAt",
             r."lastError",r."replayCount",r."lastReplayedAt",r."lastReplayedByUserId",r."createdAt",
             p."status" AS "paymentStatus",p."purposeType",
             COALESCE(i."invoiceNumber",CONCAT('Amenity deposit · ',a."name")) AS "invoiceNumber"
      FROM "PaymentWebhookReceipt" r
      JOIN "Payment" p ON p."id"=r."paymentId" AND p."societyId"=r."societyId"
      LEFT JOIN "MaintenanceInvoice" i ON i."id"=p."invoiceId" AND i."societyId"=p."societyId"
      LEFT JOIN "AmenityBooking" ab ON ab."id"=p."amenityBookingId" AND ab."societyId"=p."societyId"
      LEFT JOIN "Amenity" a ON a."id"=ab."amenityId" AND a."societyId"=ab."societyId"
      WHERE r."societyId"=${societyId}::uuid
      ORDER BY r."createdAt" DESC
      LIMIT 200
    `);
  }

  async replayWebhookReceipt(societyId: string, actorUserId: string, receiptId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ payload: PaymentWebhookEvent }>>(Prisma.sql`
      UPDATE "PaymentWebhookReceipt"
      SET "replayCount"="replayCount"+1,
          "lastReplayedAt"=CURRENT_TIMESTAMP,
          "lastReplayedByUserId"=${actorUserId}::uuid,
          "updatedAt"=CURRENT_TIMESTAMP
      WHERE "id"=${receiptId}::uuid AND "societyId"=${societyId}::uuid
      RETURNING "payload"
    `);
    if (!rows[0]) throw new NotFoundException('Payment webhook receipt not found');
    return this.processWebhookReceipt(societyId, receiptId, rows[0].payload);
  }

  async reconcile(signature: string | undefined, event: PaymentWebhookEvent) {
    const digest = this.verifyWebhookSignature(signature, event);
    const orders = await this.prisma.$queryRaw<PaymentWebhookRow[]>(Prisma.sql`
      SELECT "id","invoiceId","amenityBookingId","societyId","purposeType","status"
      FROM "Payment"
      WHERE "providerOrderId"=${event.providerOrderId} AND "provider"='gateway-adapter'
      LIMIT 1
    `);
    const order = orders[0];
    if (!order) throw new NotFoundException('Payment order not found');

    const receipts = await this.prisma.$queryRaw<PaymentWebhookReceiptRow[]>(Prisma.sql`
      INSERT INTO "PaymentWebhookReceipt" (
        "societyId","paymentId","providerEventId","providerOrderId","providerPaymentId",
        "eventStatus","payload","payloadDigest"
      ) VALUES (
        ${order.societyId}::uuid,${order.id}::uuid,${event.eventId},${event.providerOrderId},
        ${event.providerPaymentId},${event.status},CAST(${JSON.stringify(event)} AS jsonb),${digest}
      )
      ON CONFLICT ("providerEventId") DO UPDATE
      SET "receiveCount"="PaymentWebhookReceipt"."receiveCount"+1,
          "lastReceivedAt"=CURRENT_TIMESTAMP,
          "updatedAt"=CURRENT_TIMESTAMP
      RETURNING "id","societyId","paymentId","payloadDigest","processingStatus"
    `);
    const receipt = receipts[0];
    if (!receipt) throw new BadRequestException('Payment webhook receipt could not be persisted');
    if (receipt.payloadDigest !== digest || receipt.paymentId !== order.id || receipt.societyId !== order.societyId) {
      throw new BadRequestException('Provider event id was reused with different payment data');
    }
    if (receipt.processingStatus === 'PROCESSED') return { duplicate: true, receiptId: receipt.id };

    return this.processWebhookReceipt(order.societyId, receipt.id, event);
  }

  private verifyWebhookSignature(signature: string | undefined, event: PaymentWebhookEvent) {
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) throw new UnauthorizedException('Payment webhook is not configured');
    const canonical = this.webhookCanonical(event);
    const expected = createHmac('sha256', secret).update(canonical).digest('hex');
    if (!signature || !/^[0-9a-f]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new UnauthorizedException('Invalid payment signature');
    }
    return createHash('sha256').update(canonical).digest('hex');
  }

  private webhookCanonical(event: PaymentWebhookEvent) {
    return `${event.eventId}|${event.providerOrderId}|${event.providerPaymentId}|${event.status}`;
  }

  private processWebhookReceipt(societyId: string, receiptId: string, event: PaymentWebhookEvent) {
    return this.webhookProcessor.process(societyId, receiptId, event);
  }


}
