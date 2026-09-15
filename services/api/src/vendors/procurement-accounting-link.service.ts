import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProcurementAccountingLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async createExpenseDraftFromPurchaseOrder(
    societyId: string,
    actorUserId: string,
    purchaseOrderId: string,
    input: {
      expenseNumber: string;
      expenseDate: string;
      dueDate?: string;
      description?: string;
      expenseAccountId: string;
      fundId?: string;
      invoiceReference?: string;
    },
  ) {
    const expenseNumber = input.expenseNumber.trim().toUpperCase();
    if (!expenseNumber) throw new BadRequestException('Expense number is required');
    if (input.dueDate && input.dueDate < input.expenseDate) throw new BadRequestException('Due date cannot be before expense date');

    return this.prisma.$transaction(async (tx) => {
      const [po] = await tx.$queryRaw<Array<{
        id: string;
        requestId: string;
        vendorId: string;
        poNumber: string;
        amountPaise: bigint;
        vendorName: string;
      }>>(Prisma.sql`
        SELECT po."id",po."requestId",po."vendorId",po."poNumber",po."amountPaise",v."name" AS "vendorName"
        FROM "PurchaseOrder" po
        JOIN "SocietyVendor" v ON v."id"=po."vendorId" AND v."societyId"=po."societyId"
        WHERE po."id"=${purchaseOrderId}::uuid
          AND po."societyId"=${societyId}::uuid
          AND po."status"='ISSUED'
        FOR UPDATE
      `);
      if (!po) throw new NotFoundException('Issued purchase order not found');

      const existing = await tx.$queryRaw<Array<{ expenseId: string }>>(Prisma.sql`
        SELECT "expenseId" FROM "ProcurementExpenseLink"
        WHERE "purchaseOrderId"=${purchaseOrderId}::uuid AND "societyId"=${societyId}::uuid
        LIMIT 1
      `);
      if (existing[0]) throw new BadRequestException('Purchase order already has an accounting expense draft');

      const description = input.description?.trim() || `Purchase order ${po.poNumber}`;
      const expenses = await tx.$queryRaw<Array<{ id: string; expenseNumber: string; status: string; amountPaise: bigint }>>(Prisma.sql`
        INSERT INTO "SocietyExpense" (
          "societyId","expenseNumber","vendorName","invoiceReference","expenseDate","dueDate","description",
          "amountPaise","expenseAccountId","fundId","createdByUserId"
        ) VALUES (
          ${societyId}::uuid,${expenseNumber},${po.vendorName},${input.invoiceReference?.trim()||po.poNumber},
          ${input.expenseDate}::date,${input.dueDate||null}::date,${description},${po.amountPaise},
          ${input.expenseAccountId}::uuid,${input.fundId??null}::uuid,${actorUserId}::uuid
        ) RETURNING "id","expenseNumber","status","amountPaise"
      `);
      const expense = expenses[0];

      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ProcurementExpenseLink" ("societyId","purchaseOrderId","expenseId","linkedByUserId")
        VALUES (${societyId}::uuid,${purchaseOrderId}::uuid,${expense.id}::uuid,${actorUserId}::uuid)
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "ProcurementRequestEvent" ("societyId","requestId","actorUserId","eventType","note")
        VALUES (
          ${societyId}::uuid,${po.requestId}::uuid,${actorUserId}::uuid,'EXPENSE_DRAFT_LINKED',
          ${`Accounting expense ${expense.expenseNumber} created from purchase order ${po.poNumber}`}
        )
      `);
      return {
        purchaseOrderId: po.id,
        expenseId: expense.id,
        expenseNumber: expense.expenseNumber,
        status: expense.status,
        amountPaise: expense.amountPaise.toString(),
      };
    });
  }

  listLinks(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT l."id",l."purchaseOrderId",po."poNumber",l."expenseId",e."expenseNumber",e."status" AS "expenseStatus",
             e."amountPaise"::text AS "amountPaise",l."createdAt"
      FROM "ProcurementExpenseLink" l
      JOIN "PurchaseOrder" po ON po."id"=l."purchaseOrderId" AND po."societyId"=l."societyId"
      JOIN "SocietyExpense" e ON e."id"=l."expenseId" AND e."societyId"=l."societyId"
      WHERE l."societyId"=${societyId}::uuid
      ORDER BY l."createdAt" DESC
      LIMIT 250
    `);
  }
}
