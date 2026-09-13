CREATE TABLE "FacilityMaintenancePlan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "assetId" UUID NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "description" TEXT,
  "frequencyDays" INTEGER NOT NULL,
  "leadDays" INTEGER NOT NULL DEFAULT 0,
  "priority" VARCHAR(24) NOT NULL DEFAULT 'MEDIUM',
  "assignedUserId" UUID,
  "nextDueAt" TIMESTAMP(3) NOT NULL,
  "lastGeneratedAt" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityMaintenancePlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilityMaintenancePlan_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityMaintenancePlan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FacilityAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityMaintenancePlan_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityMaintenancePlan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityMaintenancePlan_frequency_check" CHECK ("frequencyDays" > 0),
  CONSTRAINT "FacilityMaintenancePlan_lead_check" CHECK ("leadDays" >= 0 AND "leadDays" < "frequencyDays"),
  CONSTRAINT "FacilityMaintenancePlan_priority_check" CHECK ("priority" IN ('LOW','MEDIUM','HIGH','CRITICAL'))
);
CREATE INDEX "FacilityMaintenancePlan_society_due_idx" ON "FacilityMaintenancePlan"("societyId","active","nextDueAt");
CREATE UNIQUE INDEX "FacilityWorkOrder_maintenance_plan_due_key" ON "FacilityWorkOrder"(("description")) WHERE "workType"='PREVENTIVE' AND "description" LIKE 'maintenance-plan:%';
