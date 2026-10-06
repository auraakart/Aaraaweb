import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type InvoiceRow = { id: string; societyId: string; unitId: string; amountPaise: number; status: 'ISSUED' | 'PAID' | 'VOID' };

export class PaymentOrderService {
  constructor(private readonly prisma: PrismaService) {}

  async createPayment(societyId: string, userId: string, invoiceId: string, idempotencyKey: string) {
    const authorized = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT i."id" FROM "MaintenanceInvoice" i
      WHERE i."id"=${invoiceId}::uuid AND i."societyId"=${societyId}::uuid
        AND (EXISTS (
          SELECT 1 FROM "UnitOwnership" uo
          WHERE uo."unitId" = i."unitId"
            AND uo."societyId" = ${societyId}::uuid
            AND uo."userId" = ${userId}::uuid
            AND uo."verified" = true
            AND uo."active" = true
            AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
        ) OR EXISTS (
          SELECT 1 FROM "UnitOccupancy" ur
          WHERE ur."unitId" = i."unitId"
            AND ur."societyId" = ${societyId}::uuid
            AND ur."userId" = ${userId}::uuid
            AND ur."relation" = 'TENANT'
            AND ur."active" = true
            AND ur."effectiveFrom" <= CURRENT_TIMESTAMP
            AND (ur."effectiveTo" IS NULL OR ur."effectiveTo" > CURRENT_TIMESTAMP)
        ))
      LIMIT 1
    `);
    if (!authorized[0]) throw new NotFoundException('Invoice not found');

    const normalizedKey = idempotencyKey.trim();
    return this.prisma.$transaction(async (tx) => {
      const invoices = await tx.$queryRaw<InvoiceRow[]>(Prisma.sql`
        SELECT i.* FROM "MaintenanceInvoice" i
        WHERE i."id"=${invoiceId}::uuid AND i."societyId"=${societyId}::uuid
          AND (EXISTS (
            SELECT 1 FROM "UnitOwnership" uo
            WHERE uo."unitId" = i."unitId"
              AND uo."societyId" = ${societyId}::uuid
              AND uo."userId" = ${userId}::uuid
              AND uo."verified" = true
              AND uo."active" = true
              AND uo."effectiveFrom" <= CURRENT_TIMESTAMP
              AND (uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP)
          ) OR EXISTS (
            SELECT 1 FROM "UnitOccupancy" ur
            WHERE ur."unitId" = i."unitId"
              AND ur."societyId" = ${societyId}::uuid
              AND ur."userId" = ${userId}::uuid
              AND ur."relation" = 'TENANT'
              AND ur."active" = true
              AND ur."effectiveFrom" <= CURRENT_TIMESTAMP
              AND (ur."effectiveTo" IS NULL OR ur."effectiveTo" > CURRENT_TIMESTAMP)
          ))
        FOR UPDATE
      `);
      const invoice = invoices[0];
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status !== 'ISSUED') throw new BadRequestException('Invoice is not payable');

      const existing = await tx.$queryRaw<Array<{ invoiceId: string } & Record<string, unknown>>>(Prisma.sql`
        SELECT * FROM "Payment"
        WHERE "societyId"=${societyId}::uuid AND "payerUserId"=${userId}::uuid AND "idempotencyKey"=${normalizedKey}
        LIMIT 1
      `);
      if (existing[0]) {
        if (existing[0].invoiceId !== invoiceId) throw new BadRequestException('Idempotency key is already used for another invoice');
        return existing[0];
      }

      const active = await tx.$queryRaw<Array<{ id:string; invoiceId:string; payerUserId:string; status:string } & Record<string, unknown>>>(Prisma.sql`
        SELECT * FROM "Payment"
        WHERE "societyId"=${societyId}::uuid AND "invoiceId"=${invoiceId}::uuid
          AND "status" IN ('CREATED','AUTHORIZED')
        ORDER BY "createdAt" DESC
        LIMIT 1
      `);
      if (active[0]) {
        if (active[0].payerUserId === userId) return active[0];
        throw new ConflictException('Payment is already in progress for this invoice');
      }

      const providerOrderId = `aaraagate_${randomUUID()}`;
      const rows = await tx.$queryRaw(Prisma.sql`
        INSERT INTO "Payment" ("societyId","invoiceId","purposeType","payerUserId","idempotencyKey","provider","providerOrderId","amountPaise")
        VALUES (${societyId}::uuid,${invoiceId}::uuid,'MAINTENANCE_INVOICE',${userId}::uuid,${normalizedKey},'gateway-adapter',${providerOrderId},${invoice.amountPaise})
        ON CONFLICT ("societyId","payerUserId","idempotencyKey") DO UPDATE SET "idempotencyKey"=EXCLUDED."idempotencyKey"
        RETURNING *
      `);
      const payment = (rows as { id: string }[])[0];
      await tx.$executeRaw(Prisma.sql`INSERT INTO "PaymentEvent" ("societyId","paymentId","actorUserId","type") VALUES (${societyId}::uuid,${payment.id}::uuid,${userId}::uuid,'ORDER_CREATED')`);
      return payment;
    });
  }

  async createAmenityDepositPayment(societyId:string,userId:string,bookingId:string,idempotencyKey:string) {
    const normalizedKey=idempotencyKey.trim();
    return this.prisma.$transaction(async(tx)=>{
      const bookings=await tx.$queryRaw<Array<{
        id:string;userId:string;status:string;depositPaise:number;depositStatus:string;depositDueAt:Date|null;paymentOpen:boolean;
      }>>(Prisma.sql`
        SELECT "id","userId","status"::text AS "status","depositPaise","depositStatus","depositDueAt",
               ("depositDueAt" IS NOT NULL AND "depositDueAt">CURRENT_TIMESTAMP) AS "paymentOpen"
        FROM "AmenityBooking"
        WHERE "id"=${bookingId}::uuid AND "societyId"=${societyId}::uuid AND "userId"=${userId}::uuid
        FOR UPDATE
      `);
      const booking=bookings[0];
      if(!booking) throw new NotFoundException('Amenity booking not found');

      const existing=await tx.$queryRaw<Array<{id:string;amenityBookingId:string|null;purposeType:string}&Record<string,unknown>>>(Prisma.sql`
        SELECT * FROM "Payment"
        WHERE "societyId"=${societyId}::uuid AND "payerUserId"=${userId}::uuid AND "idempotencyKey"=${normalizedKey}
        LIMIT 1
      `);
      if(existing[0]){
        if(existing[0].purposeType!=='AMENITY_DEPOSIT'||existing[0].amenityBookingId!==bookingId){
          throw new ConflictException('Idempotency key is already used for another payment');
        }
        return existing[0];
      }

      if(booking.status!=='CONFIRMED') throw new ConflictException('Amenity deposit can be paid only for a confirmed booking');
      if(booking.depositPaise<=0) throw new BadRequestException('Amenity booking does not require a refundable deposit');
      if(booking.depositStatus!=='PAYMENT_REQUIRED') throw new ConflictException(`Amenity deposit is ${booking.depositStatus.toLowerCase().replaceAll('_',' ')}`);
      if(!booking.paymentOpen) throw new ConflictException('Amenity deposit payment deadline has elapsed');

      const active=await tx.$queryRaw<Array<{id:string;payerUserId:string}&Record<string,unknown>>>(Prisma.sql`
        SELECT * FROM "Payment"
        WHERE "societyId"=${societyId}::uuid AND "amenityBookingId"=${bookingId}::uuid
          AND "purposeType"='AMENITY_DEPOSIT' AND "status" IN ('CREATED','AUTHORIZED','CAPTURED')
        ORDER BY "createdAt" DESC LIMIT 1
      `);
      if(active[0]) return active[0];

      const providerOrderId=`aaraagate_amenity_${randomUUID()}`;
      const rows=await tx.$queryRaw<Array<{id:string}&Record<string,unknown>>>(Prisma.sql`
        INSERT INTO "Payment" ("societyId","amenityBookingId","purposeType","payerUserId","idempotencyKey","provider","providerOrderId","amountPaise")
        VALUES (${societyId}::uuid,${bookingId}::uuid,'AMENITY_DEPOSIT',${userId}::uuid,${normalizedKey},'gateway-adapter',${providerOrderId},${booking.depositPaise})
        RETURNING *
      `);
      const payment=rows[0];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "PaymentEvent" ("societyId","paymentId","actorUserId","type")
        VALUES (${societyId}::uuid,${payment.id}::uuid,${userId}::uuid,'AMENITY_DEPOSIT_ORDER_CREATED')
      `);
      return payment;
    });
  }
}
