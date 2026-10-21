import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ServiceBookingStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export type ConsumerPaymentStatus = 'CREATED' | 'PENDING' | 'CAPTURED' | 'FAILED' | 'REFUND_PENDING' | 'REFUNDED';

export type ConsumerPaymentTransitionInput = {
  status: ConsumerPaymentStatus;
  provider?: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  providerEventId?: string;
  providerReference?: string;
};

type ConsumerPaymentRow = {
  id: string;
  bookingId: string;
  userId: string;
  idempotencyKey: string;
  status: ConsumerPaymentStatus;
  currency: string;
  grossAmountPaise: number;
  platformFeePaise: number | null;
  providerAmountPaise: number | null;
  provider: string | null;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  capturedAt: Date | null;
  refundedAt: Date | null;
};

type CheckoutBookingRow = {
  commercialTermsSnapshot?: unknown;
  id: string;
  offeringName: string;
  status: ServiceBookingStatus;
  servicePricePaise: number;
};
type CheckoutQuoteRow = {
  id: string;
  scopeDescription: string;
  amountPaise: string;
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';
  createdAt: Date;
};
type CheckoutPaymentRow = {
  id: string;
  status: ConsumerPaymentStatus;
  currency: string;
  grossAmountPaise: string;
  createdAt: Date;
};

type BookingPaymentSourceRow = {
  id: string;
  userId: string;
  status: ServiceBookingStatus;
  servicePricePaise: number;
};

const ALLOWED_TRANSITIONS: Readonly<Record<ConsumerPaymentStatus, readonly ConsumerPaymentStatus[]>> = {
  CREATED: ['PENDING', 'FAILED'],
  PENDING: ['CAPTURED', 'FAILED'],
  CAPTURED: ['REFUND_PENDING'],
  FAILED: [],
  REFUND_PENDING: ['REFUNDED'],
  REFUNDED: [],
};

@Injectable()
export class ConsumerPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Services 4.3.1: an informational booking breakdown, not a payment quote.
   * Original payment intents charge the immutable booking price only;
   * approved extra-work scope never silently increases that price.
   */
  async getCheckoutBreakdown(userId: string, bookingId: string) {
    const bookingRows = await this.prisma.$queryRaw<CheckoutBookingRow[]>(Prisma.sql`
      SELECT b."id", b."offeringName", b."status", b."servicePricePaise", b."commercialTermsSnapshot"
      FROM "ConsumerServiceBooking" b
      WHERE b."id" = ${bookingId}::uuid AND b."userId" = ${userId}::uuid
      LIMIT 1
    `);
    const booking = bookingRows[0];
    if (!booking) throw new NotFoundException('Booking not found');
    if (!Number.isSafeInteger(booking.servicePricePaise) || booking.servicePricePaise < 0) {
      throw new BadRequestException('Booking contains an invalid saved service amount');
    }

    const [quotes, payments] = await Promise.all([
      this.prisma.$queryRaw<CheckoutQuoteRow[]>(Prisma.sql`
        SELECT q."id", q."scopeDescription", q."amountPaise"::text AS "amountPaise",
               q."status", q."createdAt"
        FROM "ConsumerServiceExtraWorkQuote" q
        JOIN "ConsumerServiceBooking" b ON b."id" = q."bookingId"
        WHERE b."id" = ${bookingId}::uuid AND b."userId" = ${userId}::uuid
        ORDER BY q."createdAt" DESC, q."id" DESC
        LIMIT 20
      `),
      this.prisma.$queryRaw<CheckoutPaymentRow[]>(Prisma.sql`
        SELECT pay."id", pay."status", pay."currency",
               pay."grossAmountPaise"::text AS "grossAmountPaise", pay."createdAt"
        FROM "ConsumerServicePayment" pay
        JOIN "ConsumerServiceBooking" b ON b."id" = pay."bookingId"
          AND b."userId" = pay."userId"
        WHERE b."id" = ${bookingId}::uuid AND b."userId" = ${userId}::uuid
        ORDER BY pay."createdAt" DESC, pay."id" DESC
        LIMIT 20
      `),
    ]);

    return {
      bookingId: booking.id,
      bookingStatus: booking.status,
      currency: 'INR' as const,
      readOnly: true,
      checkoutReady: false,
      amountPayablePaise: null,
      taxBreakdown: null,
      taxAssessmentStatus: 'NOT_DETERMINED' as const,
      // Services 4.3.3 — explain precisely which missing contract evidence
      // prevents any consolidated payable amount. These are not claims
      // about external finance/legal approvals or tax liability.
      readiness: {
        evaluationScope: 'THIS_BOOKING_PREVIEW_ONLY' as const,
        status: 'NOT_READY' as const,
        chargeAuthorized: false,
        blockers: [
          { code: 'SELLER_OF_RECORD_UNVERIFIED', label: 'Seller and invoice issuer not verified for this checkout' },
          { code: 'GST_TREATMENT_UNDETERMINED', label: 'Tax/GST treatment not established for this checkout' },
          { code: 'PARTS_LINE_ITEMS_UNAVAILABLE', label: 'Verified individual parts and labour line items not available' },
          { code: 'EXTRA_WORK_NOT_BILLABLE', label: 'Approved extra work has no consolidated charge authorization' },
          { code: 'SETTLEMENT_REFUND_RULES_UNVERIFIED', label: 'Settlement and refund rules not verified for consolidated checkout' },
        ],
      },
      commercialTerms: {
        snapshot: booking.commercialTermsSnapshot ?? null,
        source: 'RECORDED_BOOKING_TERMS' as const,
        providerDeclared: true,
        authorizesPayment: false,
      },
      baseService: {
        description: booking.offeringName,
        source: 'SAVED_BOOKING_PRICE' as const,
        amountPaise: booking.servicePricePaise,
      },
      extraWorkQuotes: quotes.map((q) => ({
        id: q.id,
        description: q.scopeDescription,
        quotedAmountPaise: q.amountPaise,
        status: q.status,
        includedInBasePayment: false,
        createsInvoice: false,
      })),
      quoteListLimitedTo: 20,
      baseBookingPayments: payments.map((p) => ({
        id: p.id,
        status: p.status,
        currency: p.currency,
        grossAmountPaise: p.grossAmountPaise,
      })),
      paymentListLimitedTo: 20,
      notes: [
        'Original booking payment and extra-work quote approval are separate.',
        'Approved extra-work is not included in the original payment intent.',
        'Tax, final invoice and consolidated checkout require separate verified finance rules.',
      ],
    };
  }

  listMine(userId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT
        p.*,
        b."offeringName",
        b."providerName",
        b."scheduledFrom",
        b."scheduledUntil"
      FROM "ConsumerServicePayment" p
      JOIN "ConsumerServiceBooking" b ON b."id" = p."bookingId" AND b."userId" = p."userId"
      WHERE p."userId" = ${userId}::uuid
      ORDER BY p."createdAt" DESC
    `);
  }

  listForBooking(userId: string, bookingId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p.*
      FROM "ConsumerServicePayment" p
      JOIN "ConsumerServiceBooking" b ON b."id" = p."bookingId" AND b."userId" = p."userId"
      WHERE p."userId" = ${userId}::uuid AND p."bookingId" = ${bookingId}::uuid
      ORDER BY p."createdAt" DESC
    `);
  }

  listPlatformPayments() {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT p.*, b."offeringName", b."providerName", b."scheduledFrom", b."scheduledUntil"
      FROM "ConsumerServicePayment" p
      JOIN "ConsumerServiceBooking" b ON b."id" = p."bookingId"
      ORDER BY p."createdAt" DESC
    `);
  }

  async listPlatformEvents(paymentId: string) {
    const payment = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ConsumerServicePayment" WHERE "id" = ${paymentId}::uuid LIMIT 1
    `);
    if (!payment[0]) throw new NotFoundException('Consumer payment not found');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT * FROM "ConsumerServicePaymentEvent"
      WHERE "paymentId" = ${paymentId}::uuid
      ORDER BY "occurredAt" ASC
    `);
  }

  async createIntent(userId: string, bookingId: string, idempotencyKey: string) {
    const normalizedKey = idempotencyKey.trim();
    if (normalizedKey.length < 8 || normalizedKey.length > 100) {
      throw new BadRequestException('Idempotency key must be between 8 and 100 characters');
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.$queryRaw<ConsumerPaymentRow[]>(Prisma.sql`
        SELECT *
        FROM "ConsumerServicePayment"
        WHERE "userId" = ${userId}::uuid AND "idempotencyKey" = ${normalizedKey}
        ORDER BY "createdAt" DESC
        LIMIT 1
        FOR UPDATE
      `);
      if (existing[0]) {
        if (existing[0].bookingId !== bookingId) {
          throw new BadRequestException('Idempotency key is already used for another booking');
        }
        return existing[0];
      }

      const bookingRows = await tx.$queryRaw<BookingPaymentSourceRow[]>(Prisma.sql`
        SELECT "id", "userId", "status", "servicePricePaise"
        FROM "ConsumerServiceBooking"
        WHERE "id" = ${bookingId}::uuid AND "userId" = ${userId}::uuid
        FOR UPDATE
      `);
      const booking = bookingRows[0];
      if (!booking) throw new NotFoundException('Booking not found');
      if (booking.status === ServiceBookingStatus.CANCELLED) {
        throw new BadRequestException('Cancelled booking cannot create a payment intent');
      }
      if (!Number.isSafeInteger(booking.servicePricePaise) || booking.servicePricePaise < 0) {
        throw new BadRequestException('Booking has an invalid payment amount');
      }

      const active = await tx.$queryRaw<ConsumerPaymentRow[]>(Prisma.sql`
        SELECT *
        FROM "ConsumerServicePayment"
        WHERE "bookingId" = ${bookingId}::uuid
          AND "userId" = ${userId}::uuid
          AND "status" IN (
            'CREATED'::"ConsumerServicePaymentStatus",
            'PENDING'::"ConsumerServicePaymentStatus",
            'CAPTURED'::"ConsumerServicePaymentStatus",
            'REFUND_PENDING'::"ConsumerServicePaymentStatus"
          )
        ORDER BY "createdAt" DESC
        LIMIT 1
        FOR UPDATE
      `);
      if (active[0]) return active[0];

      const paymentId = randomUUID();
      const rows = await tx.$queryRaw<ConsumerPaymentRow[]>(Prisma.sql`
        INSERT INTO "ConsumerServicePayment" (
          "id", "bookingId", "userId", "idempotencyKey", "status", "currency",
          "grossAmountPaise", "platformFeePaise", "providerAmountPaise", "createdAt", "updatedAt"
        ) VALUES (
          ${paymentId}::uuid,
          ${bookingId}::uuid,
          ${userId}::uuid,
          ${normalizedKey},
          'CREATED'::"ConsumerServicePaymentStatus",
          'INR',
          ${booking.servicePricePaise},
          NULL,
          NULL,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        RETURNING *
      `);
      const payment = rows[0];

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ConsumerServicePaymentEvent" (
          "id", "paymentId", "actorUserId", "type", "fromStatus", "toStatus", "occurredAt"
        ) VALUES (
          ${randomUUID()}::uuid,
          ${payment.id}::uuid,
          ${userId}::uuid,
          'INTENT_CREATED',
          NULL,
          'CREATED'::"ConsumerServicePaymentStatus",
          CURRENT_TIMESTAMP
        )
      `);

      return payment;
    });
  }

  async transition(actorUserId: string, paymentId: string, input: ConsumerPaymentTransitionInput) {
    return this.prisma.$transaction(async (tx) => {
      if (input.providerEventId) {
        const duplicate = await tx.$queryRaw<Array<{ paymentId: string }>>(Prisma.sql`
          SELECT "paymentId" FROM "ConsumerServicePaymentEvent"
          WHERE "providerEventId" = ${input.providerEventId}
          LIMIT 1
        `);
        if (duplicate[0]) {
          if (duplicate[0].paymentId !== paymentId) {
            throw new BadRequestException('Provider event is already linked to another payment');
          }
          const current = await tx.$queryRaw<ConsumerPaymentRow[]>(Prisma.sql`
            SELECT * FROM "ConsumerServicePayment" WHERE "id" = ${paymentId}::uuid LIMIT 1
          `);
          return current[0];
        }
      }

      const currentRows = await tx.$queryRaw<ConsumerPaymentRow[]>(Prisma.sql`
        SELECT * FROM "ConsumerServicePayment"
        WHERE "id" = ${paymentId}::uuid
        FOR UPDATE
      `);
      const current = currentRows[0];
      if (!current) throw new NotFoundException('Consumer payment not found');
      if (!ALLOWED_TRANSITIONS[current.status].includes(input.status)) {
        throw new BadRequestException(`Invalid payment transition from ${current.status} to ${input.status}`);
      }

      let capturePlatformFeePaise: number | null = null;
      let captureProviderAmountPaise: number | null = null;
      if (input.status === 'CAPTURED') {
        const commercial = await tx.$queryRaw<Array<{ settlementCommissionBps: number | null }>>(Prisma.sql`
          SELECT cp."settlementCommissionBps"
          FROM "ConsumerServicePayment" p
          JOIN "ConsumerServiceBooking" b ON b."id"=p."bookingId"
          LEFT JOIN "ConsumerProviderCommercialProfile" cp ON cp."providerId"=b."providerId"
          WHERE p."id"=${paymentId}::uuid
          LIMIT 1
        `);
        const commissionBps = commercial[0]?.settlementCommissionBps;
        if (commissionBps === null || commissionBps === undefined) {
          throw new BadRequestException('Provider settlement commission must be configured before payment capture');
        }
        capturePlatformFeePaise = Math.round((current.grossAmountPaise * commissionBps) / 10000);
        captureProviderAmountPaise = current.grossAmountPaise - capturePlatformFeePaise;
      }

      const rows = await tx.$queryRaw<ConsumerPaymentRow[]>(Prisma.sql`
        UPDATE "ConsumerServicePayment"
        SET
          "status" = ${input.status}::"ConsumerServicePaymentStatus",
          "provider" = COALESCE(${input.provider ?? null}, "provider"),
          "providerOrderId" = COALESCE(${input.providerOrderId ?? null}, "providerOrderId"),
          "providerPaymentId" = COALESCE(${input.providerPaymentId ?? null}, "providerPaymentId"),
          "platformFeePaise" = CASE WHEN ${input.status} = 'CAPTURED' THEN ${capturePlatformFeePaise} ELSE "platformFeePaise" END,
          "providerAmountPaise" = CASE WHEN ${input.status} = 'CAPTURED' THEN ${captureProviderAmountPaise} ELSE "providerAmountPaise" END,
          "capturedAt" = CASE WHEN ${input.status} = 'CAPTURED' THEN CURRENT_TIMESTAMP ELSE "capturedAt" END,
          "refundedAt" = CASE WHEN ${input.status} = 'REFUNDED' THEN CURRENT_TIMESTAMP ELSE "refundedAt" END,
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${paymentId}::uuid AND "status" = ${current.status}::"ConsumerServicePaymentStatus"
        RETURNING *
      `);
      if (!rows[0]) throw new BadRequestException('Payment changed concurrently; retry reconciliation');

      if (input.status === 'REFUND_PENDING') {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "ConsumerProviderSettlementRecovery" (
            "id","providerId","paymentId","settlementEntryId","providerAmountPaise","status","reason","createdAt"
          )
          SELECT
            ${randomUUID()}::uuid,e."providerId",e."paymentId",e."id",e."providerAmountPaise",'OPEN',
            'Consumer payment entered refund flow after provider settlement',CURRENT_TIMESTAMP
          FROM "ConsumerProviderSettlementEntry" e
          JOIN "ConsumerProviderSettlementBatch" b ON b."id"=e."batchId"
          WHERE e."paymentId"=${paymentId}::uuid AND b."status"='PAID'
          ON CONFLICT ("paymentId") DO NOTHING
        `);
      }

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ConsumerServicePaymentEvent" (
          "id", "paymentId", "actorUserId", "type", "fromStatus", "toStatus",
          "providerEventId", "providerReference", "occurredAt"
        ) VALUES (
          ${randomUUID()}::uuid,
          ${paymentId}::uuid,
          ${actorUserId}::uuid,
          ${`STATUS_${input.status}`},
          ${current.status}::"ConsumerServicePaymentStatus",
          ${input.status}::"ConsumerServicePaymentStatus",
          ${input.providerEventId ?? null},
          ${input.providerReference ?? null},
          CURRENT_TIMESTAMP
        )
      `);

      return rows[0];
    });
  }
}
