import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PaymentWebhookEvent, PaymentWebhookRow } from './billing.service';

type PaymentWebhookReceiptRow = {
  id: string;
  societyId: string;
  paymentId: string;
  payloadDigest: string;
  processingStatus: 'RECEIVED' | 'PROCESSED' | 'FAILED';
};

export class PaymentWebhookProcessor {
  constructor(private readonly prisma: PrismaService) {}

  async process(societyId: string, receiptId: string, event: PaymentWebhookEvent) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const receipts = await tx.$queryRaw<PaymentWebhookReceiptRow[]>(Prisma.sql`
          SELECT "id","societyId","paymentId","payloadDigest","processingStatus"
          FROM "PaymentWebhookReceipt"
          WHERE "id"=${receiptId}::uuid AND "societyId"=${societyId}::uuid
          FOR UPDATE
        `);
        const receipt = receipts[0];
        if (!receipt) throw new NotFoundException('Payment webhook receipt not found');
        if (receipt.processingStatus === 'PROCESSED') return { duplicate: true, receiptId };

        const orders = await tx.$queryRaw<PaymentWebhookRow[]>(Prisma.sql`
          SELECT "id","invoiceId","amenityBookingId","societyId","purposeType","status"
          FROM "Payment"
          WHERE "id"=${receipt.paymentId}::uuid AND "societyId"=${societyId}::uuid
            AND "providerOrderId"=${event.providerOrderId} AND "provider"='gateway-adapter'
          FOR UPDATE
        `);
        const order = orders[0];
        if (!order) throw new NotFoundException('Payment order not found');

        const claimed = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          INSERT INTO "PaymentEvent" ("societyId","paymentId","providerEventId","type","payloadDigest")
          VALUES (
            ${order.societyId}::uuid,${order.id}::uuid,${event.eventId},
            ${`WEBHOOK_${event.status}`},${receipt.payloadDigest}
          )
          ON CONFLICT ("providerEventId") DO NOTHING RETURNING "id"
        `);
        if (!claimed[0]) {
          await tx.$executeRaw(Prisma.sql`
            UPDATE "PaymentWebhookReceipt"
            SET "processingStatus"='PROCESSED',"processedAt"=COALESCE("processedAt",CURRENT_TIMESTAMP),
                "lastError"=NULL,"updatedAt"=CURRENT_TIMESTAMP
            WHERE "id"=${receiptId}::uuid
          `);
          return { duplicate: true, receiptId };
        }

        const rows = await tx.$queryRaw<Array<{id:string;invoiceId:string|null;amenityBookingId:string|null;societyId:string;purposeType:string}>>(Prisma.sql`
          UPDATE "Payment"
          SET "status"=${event.status}::"PaymentStatus",
              "providerPaymentId"=${event.providerPaymentId},
              "completedAt"=CASE WHEN ${event.status}='CAPTURED' THEN CURRENT_TIMESTAMP ELSE "completedAt" END,
              "updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${order.id}::uuid
            AND ((${event.status} IN ('CAPTURED','FAILED') AND "status" IN ('CREATED','AUTHORIZED'))
              OR (${event.status}='REFUNDED' AND "status"='CAPTURED'))
          RETURNING "id","invoiceId","amenityBookingId","societyId","purposeType"
        `);
        const payment = rows[0];
        if (!payment) throw new BadRequestException('Invalid payment state transition');

        if (payment.purposeType === 'MAINTENANCE_INVOICE' && payment.invoiceId) {
          if (event.status === 'CAPTURED') {
            await tx.$executeRaw(Prisma.sql`
              UPDATE "MaintenanceInvoice"
              SET "status"='PAID',"paidAt"=CURRENT_TIMESTAMP,"updatedAt"=CURRENT_TIMESTAMP
              WHERE "id"=${payment.invoiceId}::uuid AND "societyId"=${payment.societyId}::uuid AND "status"='ISSUED'
            `);
          }
          if (event.status === 'REFUNDED') {
            await tx.$executeRaw(Prisma.sql`
              UPDATE "MaintenanceInvoice"
              SET "status"='ISSUED',"paidAt"=NULL,"updatedAt"=CURRENT_TIMESTAMP
              WHERE "id"=${payment.invoiceId}::uuid AND "societyId"=${payment.societyId}::uuid AND "status"='PAID'
            `);
          }
        }

        if (payment.purposeType === 'AMENITY_DEPOSIT' && payment.amenityBookingId) {
          if (event.status === 'CAPTURED') {
            await tx.$executeRaw(Prisma.sql`
              UPDATE "AmenityBooking"
              SET "depositStatus"=CASE
                    WHEN "status" IN ('PENDING','CONFIRMED','CHECKED_IN') THEN 'CAPTURED'
                    ELSE 'REFUND_REQUIRED'
                  END,
                  "updatedAt"=CURRENT_TIMESTAMP
              WHERE "id"=${payment.amenityBookingId}::uuid AND "societyId"=${payment.societyId}::uuid
                AND "depositPaise">0 AND "depositStatus" IN ('PAYMENT_REQUIRED','VOIDED')
            `);
          }
          if (event.status === 'REFUNDED') {
            await tx.$executeRaw(Prisma.sql`
              UPDATE "AmenityBooking"
              SET "depositStatus"='REFUNDED',"updatedAt"=CURRENT_TIMESTAMP
              WHERE "id"=${payment.amenityBookingId}::uuid AND "societyId"=${payment.societyId}::uuid
                AND "depositPaise">0 AND "depositStatus" IN ('CAPTURED','REFUND_REQUIRED')
            `);
          }
        }

        await tx.$executeRaw(Prisma.sql`
          UPDATE "PaymentWebhookReceipt"
          SET "processingStatus"='PROCESSED',"processedAt"=CURRENT_TIMESTAMP,
              "lastError"=NULL,"updatedAt"=CURRENT_TIMESTAMP
          WHERE "id"=${receiptId}::uuid
        `);
        return { ok: true, paymentId: payment.id, status: event.status, receiptId };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown payment webhook processing error';
      await this.prisma.$executeRaw(Prisma.sql`
        UPDATE "PaymentWebhookReceipt"
        SET "processingStatus"='FAILED',"lastError"=${message},"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${receiptId}::uuid AND "societyId"=${societyId}::uuid AND "processingStatus"<>'PROCESSED'
      `).catch(() => undefined);
      throw error;
    }
  }
}
