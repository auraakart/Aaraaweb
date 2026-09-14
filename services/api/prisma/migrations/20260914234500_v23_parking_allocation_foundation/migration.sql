CREATE TABLE "ParkingSlot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "buildingId" UUID,
  "code" TEXT NOT NULL,
  "label" TEXT,
  "slotType" TEXT NOT NULL DEFAULT 'RESIDENT',
  "evReady" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "locationNote" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParkingSlot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParkingSlot_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "ParkingSlot_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL,
  CONSTRAINT "ParkingSlot_type_check" CHECK ("slotType" IN ('RESIDENT','VISITOR','TEMPORARY','ACCESSIBLE','STAFF')),
  CONSTRAINT "ParkingSlot_code_nonblank" CHECK (length(btrim("code")) > 0),
  CONSTRAINT "ParkingSlot_society_code_key" UNIQUE ("societyId", "code")
);

CREATE TABLE "ParkingAllocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "slotId" UUID NOT NULL,
  "householdId" UUID NOT NULL,
  "vehicleId" UUID NOT NULL,
  "startsAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMPTZ,
  "endedAt" TIMESTAMPTZ,
  "assignedByUserId" UUID NOT NULL,
  "endedByUserId" UUID,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParkingAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParkingAllocation_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "ParkingAllocation_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ParkingSlot"("id") ON DELETE RESTRICT,
  CONSTRAINT "ParkingAllocation_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE RESTRICT,
  CONSTRAINT "ParkingAllocation_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "HouseholdVehicle"("id") ON DELETE RESTRICT,
  CONSTRAINT "ParkingAllocation_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "ParkingAllocation_endedByUserId_fkey" FOREIGN KEY ("endedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "ParkingAllocation_end_after_start" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt"),
  CONSTRAINT "ParkingAllocation_end_actor_check" CHECK (("endedAt" IS NULL AND "endedByUserId" IS NULL) OR ("endedAt" IS NOT NULL AND "endedByUserId" IS NOT NULL))
);

CREATE UNIQUE INDEX "ParkingAllocation_active_slot_key"
  ON "ParkingAllocation"("slotId") WHERE "endedAt" IS NULL;
CREATE UNIQUE INDEX "ParkingAllocation_active_vehicle_key"
  ON "ParkingAllocation"("vehicleId") WHERE "endedAt" IS NULL;
CREATE INDEX "ParkingAllocation_society_household_idx"
  ON "ParkingAllocation"("societyId", "householdId", "endedAt");
CREATE INDEX "ParkingAllocation_society_active_idx"
  ON "ParkingAllocation"("societyId", "endedAt", "startsAt");
CREATE INDEX "ParkingSlot_society_active_type_idx"
  ON "ParkingSlot"("societyId", "active", "slotType");

CREATE TABLE "ParkingEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "slotId" UUID,
  "allocationId" UUID,
  "actorUserId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParkingEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParkingEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "ParkingEvent_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ParkingSlot"("id") ON DELETE SET NULL,
  CONSTRAINT "ParkingEvent_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "ParkingAllocation"("id") ON DELETE SET NULL,
  CONSTRAINT "ParkingEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "ParkingEvent_action_check" CHECK ("action" IN ('SLOT_CREATED','SLOT_UPDATED','ALLOCATED','RELEASED'))
);
CREATE INDEX "ParkingEvent_society_time_idx" ON "ParkingEvent"("societyId", "occurredAt" DESC);

CREATE OR REPLACE FUNCTION validate_parking_slot_scope()
RETURNS trigger AS $$
BEGIN
  IF NEW."buildingId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Building" b WHERE b."id"=NEW."buildingId" AND b."societyId"=NEW."societyId"
  ) THEN
    RAISE EXCEPTION 'Parking slot building must belong to the same society';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ParkingSlot_scope_guard"
BEFORE INSERT OR UPDATE OF "societyId", "buildingId" ON "ParkingSlot"
FOR EACH ROW EXECUTE FUNCTION validate_parking_slot_scope();

CREATE OR REPLACE FUNCTION validate_parking_allocation_scope()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "ParkingSlot" ps
    WHERE ps."id"=NEW."slotId" AND ps."societyId"=NEW."societyId" AND ps."active"=true
  ) THEN
    RAISE EXCEPTION 'Parking allocation slot must be active in the same society';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "HouseholdVehicle" hv
    WHERE hv."id"=NEW."vehicleId" AND hv."householdId"=NEW."householdId"
      AND hv."societyId"=NEW."societyId" AND hv."active"=true
  ) THEN
    RAISE EXCEPTION 'Parking allocation vehicle must be active in the household and society';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Household" h WHERE h."id"=NEW."householdId" AND h."societyId"=NEW."societyId"
  ) THEN
    RAISE EXCEPTION 'Parking allocation household must belong to the same society';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ParkingAllocation_scope_guard"
BEFORE INSERT OR UPDATE OF "societyId", "slotId", "householdId", "vehicleId" ON "ParkingAllocation"
FOR EACH ROW EXECUTE FUNCTION validate_parking_allocation_scope();

CREATE OR REPLACE FUNCTION prevent_parking_event_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ParkingEvent rows are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ParkingEvent_append_only_update"
BEFORE UPDATE ON "ParkingEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_parking_event_mutation();
CREATE TRIGGER "ParkingEvent_append_only_delete"
BEFORE DELETE ON "ParkingEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_parking_event_mutation();
