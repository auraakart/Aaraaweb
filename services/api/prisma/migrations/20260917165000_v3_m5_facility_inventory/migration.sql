CREATE TABLE "FacilityInventoryItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "sku" VARCHAR(80) NOT NULL,
  "name" VARCHAR(240) NOT NULL,
  "category" VARCHAR(120),
  "unit" VARCHAR(32) NOT NULL,
  "reorderLevel" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "onHandQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityInventoryItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilityInventoryItem_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityInventoryItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityInventoryItem_reorder_nonnegative" CHECK ("reorderLevel" >= 0),
  CONSTRAINT "FacilityInventoryItem_onhand_nonnegative" CHECK ("onHandQuantity" >= 0)
);

CREATE UNIQUE INDEX "FacilityInventoryItem_societyId_sku_key" ON "FacilityInventoryItem"("societyId", "sku");
CREATE INDEX "FacilityInventoryItem_societyId_active_idx" ON "FacilityInventoryItem"("societyId", "active");

CREATE TABLE "FacilityStockMovement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "inventoryItemId" UUID NOT NULL,
  "workOrderId" UUID,
  "movementType" VARCHAR(32) NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "balanceAfter" DECIMAL(14,3) NOT NULL,
  "reference" VARCHAR(160),
  "note" VARCHAR(1000),
  "actorUserId" UUID NOT NULL,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityStockMovement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilityStockMovement_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityStockMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "FacilityInventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityStockMovement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "FacilityWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityStockMovement_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityStockMovement_type_check" CHECK ("movementType" IN ('RECEIPT','ISSUE','ADJUSTMENT_IN','ADJUSTMENT_OUT')),
  CONSTRAINT "FacilityStockMovement_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "FacilityStockMovement_balance_nonnegative" CHECK ("balanceAfter" >= 0)
);

CREATE INDEX "FacilityStockMovement_societyId_item_time_idx" ON "FacilityStockMovement"("societyId", "inventoryItemId", "occurredAt" DESC);
CREATE INDEX "FacilityStockMovement_societyId_workOrder_idx" ON "FacilityStockMovement"("societyId", "workOrderId") WHERE "workOrderId" IS NOT NULL;
