CREATE TABLE "FacilityAsset" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(240) NOT NULL,
  "category" VARCHAR(120) NOT NULL,
  "location" VARCHAR(240),
  "manufacturer" VARCHAR(160),
  "model" VARCHAR(160),
  "serialNumber" VARCHAR(160),
  "installedAt" TIMESTAMP(3),
  "warrantyEndsAt" TIMESTAMP(3),
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilityAsset_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityAsset_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityAsset_status_check" CHECK ("status" IN ('ACTIVE','OUT_OF_SERVICE','RETIRED')),
  CONSTRAINT "FacilityAsset_warranty_check" CHECK ("warrantyEndsAt" IS NULL OR "installedAt" IS NULL OR "warrantyEndsAt" >= "installedAt")
);
CREATE UNIQUE INDEX "FacilityAsset_society_code_key" ON "FacilityAsset"("societyId","code");
CREATE INDEX "FacilityAsset_society_status_category_idx" ON "FacilityAsset"("societyId","status","category");

CREATE TABLE "FacilityWorkOrder" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "assetId" UUID,
  "workType" VARCHAR(32) NOT NULL,
  "priority" VARCHAR(24) NOT NULL DEFAULT 'MEDIUM',
  "status" VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  "title" VARCHAR(240) NOT NULL,
  "description" TEXT,
  "scheduledAt" TIMESTAMP(3),
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "assignedUserId" UUID,
  "createdByUserId" UUID NOT NULL,
  "completionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityWorkOrder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilityWorkOrder_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityWorkOrder_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FacilityAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityWorkOrder_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityWorkOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityWorkOrder_type_check" CHECK ("workType" IN ('CORRECTIVE','PREVENTIVE','INSPECTION')),
  CONSTRAINT "FacilityWorkOrder_priority_check" CHECK ("priority" IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT "FacilityWorkOrder_status_check" CHECK ("status" IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  CONSTRAINT "FacilityWorkOrder_dates_check" CHECK ("dueAt" IS NULL OR "scheduledAt" IS NULL OR "dueAt" >= "scheduledAt")
);
CREATE INDEX "FacilityWorkOrder_society_status_due_idx" ON "FacilityWorkOrder"("societyId","status","dueAt");
CREATE INDEX "FacilityWorkOrder_society_asset_created_idx" ON "FacilityWorkOrder"("societyId","assetId","createdAt" DESC);
