import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationRealtimeService } from '../notifications/notification-realtime.service';
import { PrismaService } from '../prisma/prisma.service';
import { utilityChargeParents } from './utility-charge-parents';

type IssueUtilityInvoiceInput = {
  billingPeriod: string;
  dueDate: string;
};

type IssuedInvoice = {
  id: string;
  invoiceNumber: string;
  amountPaise: number;
  unitId: string;
  dueDate: Date | string;
  alreadyIssued: boolean;
};

@Injectable()
export class UtilityInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime?: NotificationRealtimeService,
  ) {}

  async issueFromDraft(societyId: string, actorUserId: string, draftId: string, input: IssueUtilityInvoiceInput) {
    const billingPeriod = input.billingPeriod.trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(billingPeriod)) {
      throw new BadRequestException('billingPeriod must use YYYY-MM format');
    }
    const dueDate = this.parseDateOnly(input.dueDate);

    const invoice = await this.prisma.withTenantContext(societyId, async (tx): Promise<IssuedInvoice> => {
      const drafts = await tx.$queryRaw<Array<{
        id: string;
        unitId: string;
        meterId: string;
        totalPaise: number;
        status: 'DRAFT' | 'ISSUED' | 'VOID';
        periodStart: Date;
        periodEnd: Date;
        meterCode: string;
        meterType: string;
      }>>(Prisma.sql`
        SELECT d."id",d."unitId",d."meterId",d."totalPaise",d."status",d."periodStart",d."periodEnd",
          m."code" AS "meterCode",m."meterType"
        FROM "UtilityChargeDraft" d
        JOIN "UtilityMeter" m ON m."id"=d."meterId" AND m."societyId"=d."societyId"
        WHERE d."id"=${draftId}::uuid AND d."societyId"=${societyId}::uuid AND ${utilityChargeParents()}
        FOR UPDATE OF d
      `);
      const draft = drafts[0];
      if (!draft) throw new NotFoundException('Utility charge draft not found');
      if (draft.status === 'VOID') throw new BadRequestException('Voided utility charge drafts cannot be issued');
      if (!Number.isSafeInteger(draft.totalPaise) || draft.totalPaise <= 0) {
        throw new BadRequestException('Utility charge draft total must be greater than zero before invoice issuance');
      }

      const existingRows = await tx.$queryRaw<Array<{
        id: string; invoiceNumber: string; amountPaise: number; unitId: string; dueDate: Date;
      }>>(Prisma.sql`
        SELECT "id","invoiceNumber","amountPaise","unitId","dueDate"
        FROM "MaintenanceInvoice"
        WHERE "societyId"=${societyId}::uuid AND "sourceUtilityChargeDraftId"=${draftId}::uuid
        LIMIT 1
      `);
      if (existingRows[0]) {
        if (existingRows[0].unitId !== draft.unitId || existingRows[0].amountPaise !== draft.totalPaise) {
          throw new ConflictException('Linked utility invoice does not match its charge draft');
        }
        return { ...existingRows[0], alreadyIssued: true };
      }
      if (draft.status !== 'DRAFT') throw new BadRequestException('Utility charge draft is not available for issuance');

      const invoiceNumber = `UTIL-${billingPeriod.replace('-', '')}-${draftId.slice(0, 8).toUpperCase()}`;
      const description = `${draft.meterType} utility charge for meter ${draft.meterCode}`;
      const rows = await tx.$queryRaw<Array<{
        id: string; invoiceNumber: string; amountPaise: number; unitId: string; dueDate: Date;
      }>>(Prisma.sql`
        INSERT INTO "MaintenanceInvoice" (
          "societyId","unitId","createdById","invoiceNumber","billingPeriod","description","amountPaise","dueDate","sourceUtilityChargeDraftId"
        ) VALUES (
          ${societyId}::uuid,${draft.unitId}::uuid,${actorUserId}::uuid,${invoiceNumber},${billingPeriod},${description},
          ${draft.totalPaise},${dueDate}::date,${draftId}::uuid
        )
        RETURNING "id","invoiceNumber","amountPaise","unitId","dueDate"
      `);
      const created = rows[0];

      await tx.$executeRaw(Prisma.sql`
        UPDATE "UtilityChargeDraft"
        SET "status"='ISSUED',"issuedByUserId"=${actorUserId}::uuid,"issuedAt"=CURRENT_TIMESTAMP
        WHERE "id"=${draftId}::uuid AND "societyId"=${societyId}::uuid AND "status"='DRAFT'
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "UtilityChargeEvent" ("societyId","draftId","actorUserId","action","note")
        VALUES (${societyId}::uuid,${draftId}::uuid,${actorUserId}::uuid,'DRAFT_ISSUED',${created.invoiceNumber})
      `);
      return { ...created, alreadyIssued: false };
    });

    if (!invoice.alreadyIssued && this.realtime) {
      const recipients = await this.prisma.withTenantContext(societyId, tx => tx.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
        SELECT recipients."userId" FROM (
        SELECT "userId" FROM "UnitOwnership"
        WHERE "societyId"=${societyId}::uuid AND "unitId"=${invoice.unitId}::uuid
          AND "verified"=true AND "active"=true AND "effectiveFrom"<=CURRENT_TIMESTAMP
          AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP)
        UNION
        SELECT "userId" FROM "UnitOccupancy"
        WHERE "societyId"=${societyId}::uuid AND "unitId"=${invoice.unitId}::uuid
          AND "relation"='TENANT' AND "active"=true AND "effectiveFrom"<=CURRENT_TIMESTAMP
          AND ("effectiveTo" IS NULL OR "effectiveTo">CURRENT_TIMESTAMP)
        ) recipients
        WHERE EXISTS (
          SELECT 1 FROM "Unit" u JOIN "Building" b ON b."id"=u."buildingId" AND b."societyId"=u."societyId"
          WHERE u."id"=${invoice.unitId}::uuid AND u."societyId"=${societyId}::uuid
        )
      `));
      const due = typeof invoice.dueDate === 'string' ? invoice.dueDate : invoice.dueDate.toISOString().slice(0, 10);
      for (const { userId } of recipients) {
        this.realtime.publishResident({
          type: 'MAINTENANCE_DUE_ISSUED',
          societyId,
          userId,
          invoiceId: invoice.id,
          title: 'Utility payment due',
          body: `Invoice ${invoice.invoiceNumber} for ₹${(invoice.amountPaise / 100).toFixed(2)} is due on ${due}.`,
          createdAt: new Date().toISOString(),
        });
      }
    }

    return invoice;
  }

  private parseDateOnly(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('dueDate must use YYYY-MM-DD format');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException('Invalid dueDate');
    }
    return value;
  }
}
