CREATE TYPE "VehicleType" AS ENUM ('TWO_WHEELER', 'CAR', 'OTHER');

CREATE TABLE "Household" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "displayName" TEXT,
  "accessPreferences" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HouseholdVehicle" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "householdId" UUID NOT NULL,
  "plateNumber" TEXT NOT NULL,
  "vehicleType" "VehicleType" NOT NULL,
  "make" TEXT,
  "model" TEXT,
  "color" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HouseholdVehicle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmergencyContact" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "householdId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "relation" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Household_unitId_key" ON "Household"("unitId");
CREATE INDEX "Household_societyId_idx" ON "Household"("societyId");
CREATE UNIQUE INDEX "HouseholdVehicle_societyId_plateNumber_key" ON "HouseholdVehicle"("societyId", "plateNumber");
CREATE INDEX "HouseholdVehicle_householdId_active_idx" ON "HouseholdVehicle"("householdId", "active");
CREATE INDEX "EmergencyContact_householdId_active_priority_idx" ON "EmergencyContact"("householdId", "active", "priority");

ALTER TABLE "Household" ADD CONSTRAINT "Household_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Household" ADD CONSTRAINT "Household_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdVehicle" ADD CONSTRAINT "HouseholdVehicle_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdVehicle" ADD CONSTRAINT "HouseholdVehicle_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmergencyContact" ADD CONSTRAINT "EmergencyContact_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
