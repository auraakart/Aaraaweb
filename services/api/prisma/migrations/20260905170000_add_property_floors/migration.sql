CREATE TABLE "PropertyFloor" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "buildingId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PropertyFloor_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Unit" ADD COLUMN "floorId" UUID;

CREATE UNIQUE INDEX "PropertyFloor_buildingId_name_key" ON "PropertyFloor"("buildingId", "name");
CREATE INDEX "PropertyFloor_societyId_buildingId_sortOrder_idx" ON "PropertyFloor"("societyId", "buildingId", "sortOrder");
CREATE INDEX "Unit_floorId_idx" ON "Unit"("floorId");

ALTER TABLE "PropertyFloor" ADD CONSTRAINT "PropertyFloor_societyId_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropertyFloor" ADD CONSTRAINT "PropertyFloor_buildingId_fkey"
  FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_floorId_fkey"
  FOREIGN KEY ("floorId") REFERENCES "PropertyFloor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing units remain valid with a nullable floorId. New Admin property setup
-- requires an explicit floor. This avoids fabricating floor data during upgrade.
