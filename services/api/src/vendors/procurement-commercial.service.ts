import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProcurementCommercialService {
  constructor(private readonly prisma: PrismaService) {}

  listQuotes(societyId: string, requestId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT q.*, v."code" AS "vendorCode", v."name" AS "vendorName"
      FROM "ProcurementQuote" q
      JOIN "SocietyVendor" v ON v."id"=q."vendorId" AND v."societyId"=q."societyId"
      WHERE q."societyId"=${societyId}::uuid AND q."requestId"=${requestId}::uuid
      ORDER BY q."amountPaise" ASC, q."createdAt" ASC
    `);
  }

  async addQuote(societyId: string, actorUserId: string, requestId: string, input: {
    vendorId: string; quoteReference?: string; amountPaise: number; validUntil?: string; notes?: string;
  }) {
    if (input.amountPaise < 0) throw new BadRequestException('Quote amount cannot be negative');
    const [request] = await this.prisma.$queryRaw<Array<{ status: string }>>(Prisma.sql`
      SELECT "status" FROM "ProcurementRequest"
      WHERE "id"=${requestId}::uuid AND "societyId"=${societyId}::uuid LIMIT 1
    `);
    if (!request) throw new NotFoundException('Procurement request not found');
    if (!['DRAFT','SUBMITTED'].includes(request.status)) throw new BadRequestException('Quotes can only be added before request approval');

    const [vendor] = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "SocietyVendor"
      WHERE "id"=${input.vendorId}::uuid AND "societyId"=${societyId}::uuid AND "status"='ACTIVE' LIMIT 1
    `);
    if (!vendor) throw new BadRequestException('Quote vendor must be active in the current society');

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "ProcurementQuote" (
        "societyId","requestId","vendorId","quoteReference","amountPaise","validUntil","notes","createdByUserId"
      ) VALUES (
        ${societyId}::uuid,${requestId}::uuid,${input.vendorId}::uuid,${input.quoteReference?.trim()||null},
        ${input.amountPaise},${input.validUntil||null}::date,${input.notes?.trim()||null},${actorUserId}::uuid
      ) RETURNING *
    `);
    return rows[0];
  }

  async selectQuote(societyId: string, actorUserId: string, requestId: string, quoteId: string, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const [request] = await tx.$queryRaw<Array<{ id: string; status: string }>>(Prisma.sql`
        SELECT "id","status" FROM "ProcurementRequest"
        WHERE "id"=${requestId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE
      `);
      if (!request) throw new NotFoundException('Procurement request not found');
      if (request.status !== 'SUBMITTED') throw new BadRequestException('Quote selection requires a submitted procurement request');

      const [quote] = await tx.$queryRaw<Array<{ id: string; vendorId: string }>>(Prisma.sql`
        SELECT q."id",q."vendorId"
        FROM "ProcurementQuote" q
        JOIN "SocietyVendor" v ON v."id"=q."vendorId" AND v."societyId"=q."societyId"
        WHERE q."id"=${quoteId}::uuid AND q."requestId"=${requestId}::uuid AND q."societyId"=${societyId}::uuid
          AND q."status"='RECEIVED' AND v."status"='ACTIVE'
        FOR UPDATE
      `);
      if (!quote) throw new BadRequestException('Selected quote must be received from an active vendor in this society');

      await tx.$executeRaw(Prisma.sql`
        UPDATE "ProcurementQuote" SET "status"=CASE WHEN "id"=${quoteId}::uuid THEN 'SELECTED' ELSE 'REJECTED' END,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "requestId"=${requestId}::uuid AND "societyId"=${societyId}::uuid AND "status" IN ('RECEIVED','SELECTED')
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE "ProcurementRequest" SET "selectedQuoteId"=${quoteId}::uuid,"preferredVendorId"=${quote.vendorId}::uuid,"updatedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${requestId}::uuid AND "societyId"=${societyId}::uuid
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ProcurementRequestEvent" ("societyId","requestId","actorUserId","eventType","note")
        VALUES (${societyId}::uuid,${requestId}::uuid,${actorUserId}::uuid,'QUOTE_SELECTED',${note?.trim()||'Vendor quote selected'})
      `);
      return { requestId, quoteId, vendorId: quote.vendorId };
    });
  }

  async issuePurchaseOrder(societyId: string, actorUserId: string, requestId: string, input: { poNumber: string; terms?: string }) {
    const poNumber = input.poNumber.trim().toUpperCase();
    if (!poNumber) throw new BadRequestException('PO number is required');
    return this.prisma.$transaction(async (tx) => {
      const [request] = await tx.$queryRaw<Array<{ id: string; status: string; selectedQuoteId: string | null }>>(Prisma.sql`
        SELECT "id","status","selectedQuoteId" FROM "ProcurementRequest"
        WHERE "id"=${requestId}::uuid AND "societyId"=${societyId}::uuid FOR UPDATE
      `);
      if (!request) throw new NotFoundException('Procurement request not found');
      if (request.status !== 'APPROVED') throw new BadRequestException('Purchase order requires an approved procurement request');
      if (!request.selectedQuoteId) throw new BadRequestException('Purchase order requires a selected quotation');

      const [quote] = await tx.$queryRaw<Array<{ id: string; vendorId: string; amountPaise: bigint }>>(Prisma.sql`
        SELECT q."id",q."vendorId",q."amountPaise"
        FROM "ProcurementQuote" q
        JOIN "SocietyVendor" v ON v."id"=q."vendorId" AND v."societyId"=q."societyId"
        WHERE q."id"=${request.selectedQuoteId}::uuid AND q."requestId"=${requestId}::uuid AND q."societyId"=${societyId}::uuid
          AND q."status"='SELECTED' AND v."status"='ACTIVE'
        FOR UPDATE
      `);
      if (!quote) throw new BadRequestException('Selected quotation is no longer valid for PO issuance');

      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO "PurchaseOrder" (
          "societyId","requestId","quoteId","vendorId","poNumber","amountPaise","terms","issuedByUserId"
        ) VALUES (
          ${societyId}::uuid,${requestId}::uuid,${quote.id}::uuid,${quote.vendorId}::uuid,${poNumber},${quote.amountPaise},
          ${input.terms?.trim()||null},${actorUserId}::uuid
        ) RETURNING *
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ProcurementRequestEvent" ("societyId","requestId","actorUserId","eventType","note")
        VALUES (${societyId}::uuid,${requestId}::uuid,${actorUserId}::uuid,'PO_ISSUED',${`Purchase order ${poNumber} issued`})
      `);
      return rows[0];
    });
  }

  listPurchaseOrders(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT po.*, pr."requestNumber", v."code" AS "vendorCode", v."name" AS "vendorName"
      FROM "PurchaseOrder" po
      JOIN "ProcurementRequest" pr ON pr."id"=po."requestId" AND pr."societyId"=po."societyId"
      JOIN "SocietyVendor" v ON v."id"=po."vendorId" AND v."societyId"=po."societyId"
      WHERE po."societyId"=${societyId}::uuid
      ORDER BY po."issuedAt" DESC LIMIT 250
    `);
  }
}
