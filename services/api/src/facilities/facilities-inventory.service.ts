import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type FacilityStockMovementType = 'RECEIPT'|'ISSUE'|'ADJUSTMENT_IN'|'ADJUSTMENT_OUT';

type CreateInventoryItemInput = {
  sku: string;
  name: string;
  category?: string;
  unit: string;
  reorderLevel?: number;
};

type RecordMovementInput = {
  movementType: FacilityStockMovementType;
  quantity: number;
  workOrderId?: string;
  reference?: string;
  note?: string;
};

@Injectable()
export class FacilitiesInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  listItems(societyId: string) {
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT *, ("onHandQuantity" <= "reorderLevel") AS "needsReorder"
      FROM "FacilityInventoryItem"
      WHERE "societyId"=${societyId}::uuid AND "active"=TRUE
      ORDER BY "name" ASC, "sku" ASC
    `);
  }

  async createItem(societyId: string, actorUserId: string, input: CreateInventoryItemInput) {
    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
      INSERT INTO "FacilityInventoryItem" (
        "societyId","sku","name","category","unit","reorderLevel","createdByUserId"
      ) VALUES (
        ${societyId}::uuid,
        ${input.sku.trim().toUpperCase()},
        ${input.name.trim()},
        ${input.category?.trim() || null},
        ${input.unit.trim()},
        ${input.reorderLevel ?? 0},
        ${actorUserId}::uuid
      )
      RETURNING *
    `);
    return rows[0];
  }

  async listMovements(societyId: string, inventoryItemId: string) {
    const item = await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM "FacilityInventoryItem"
      WHERE "id"=${inventoryItemId}::uuid AND "societyId"=${societyId}::uuid
      LIMIT 1
    `);
    if (!item.length) throw new BadRequestException('Inventory item not found');
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT * FROM "FacilityStockMovement"
      WHERE "societyId"=${societyId}::uuid AND "inventoryItemId"=${inventoryItemId}::uuid
      ORDER BY "occurredAt" DESC, "id" DESC
    `);
  }

  async recordMovement(societyId: string, actorUserId: string, inventoryItemId: string, input: RecordMovementInput) {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new BadRequestException('Movement quantity must be greater than zero');
    return this.prisma.$transaction(async (tx) => {
      const items = await tx.$queryRaw<Array<{id:string; onHandQuantity: unknown}>>(Prisma.sql`
        SELECT "id","onHandQuantity"
        FROM "FacilityInventoryItem"
        WHERE "id"=${inventoryItemId}::uuid AND "societyId"=${societyId}::uuid AND "active"=TRUE
        FOR UPDATE
      `);
      const item = items[0];
      if (!item) throw new BadRequestException('Inventory item not found');

      if (input.workOrderId) {
        const work = await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
          SELECT "id" FROM "FacilityWorkOrder"
          WHERE "id"=${input.workOrderId}::uuid AND "societyId"=${societyId}::uuid
          LIMIT 1
        `);
        if (!work.length) throw new BadRequestException('Facility work order not found');
      }

      const outbound = input.movementType === 'ISSUE' || input.movementType === 'ADJUSTMENT_OUT';
      const current = Number(item.onHandQuantity);
      const next = outbound ? current - input.quantity : current + input.quantity;
      if (next < -0.000001) throw new BadRequestException('Inventory movement would make stock negative');

      const updated = await tx.$queryRaw<Array<{onHandQuantity: unknown}>>(Prisma.sql`
        UPDATE "FacilityInventoryItem"
        SET "onHandQuantity" = "onHandQuantity" ${Prisma.raw(outbound ? '-' : '+')} ${input.quantity},
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id"=${inventoryItemId}::uuid AND "societyId"=${societyId}::uuid
        RETURNING "onHandQuantity"
      `);
      const balanceAfter = Number(updated[0].onHandQuantity);
      const movements = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        INSERT INTO "FacilityStockMovement" (
          "societyId","inventoryItemId","workOrderId","movementType","quantity","balanceAfter","reference","note","actorUserId"
        ) VALUES (
          ${societyId}::uuid,
          ${inventoryItemId}::uuid,
          ${input.workOrderId ?? null}::uuid,
          ${input.movementType},
          ${input.quantity},
          ${balanceAfter},
          ${input.reference?.trim() || null},
          ${input.note?.trim() || null},
          ${actorUserId}::uuid
        )
        RETURNING *
      `);
      return movements[0];
    });
  }
}
