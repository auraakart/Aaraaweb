CREATE TABLE "ParkingPolicy" (
  "societyId" UUID NOT NULL,
  "maxActiveResidentAllocationsPerHousehold" INTEGER,
  "updatedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParkingPolicy_pkey" PRIMARY KEY ("societyId"),
  CONSTRAINT "ParkingPolicy_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "ParkingPolicy_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "ParkingPolicy_limit_positive" CHECK (
    "maxActiveResidentAllocationsPerHousehold" IS NULL
    OR "maxActiveResidentAllocationsPerHousehold" > 0
  )
);

ALTER TABLE "ParkingEvent" DROP CONSTRAINT IF EXISTS "ParkingEvent_action_check";
ALTER TABLE "ParkingEvent" ADD CONSTRAINT "ParkingEvent_action_check"
  CHECK ("action" IN (
    'SLOT_CREATED','SLOT_UPDATED','ALLOCATED','RELEASED',
    'PERMIT_CREATED','PERMIT_CANCELLED','PERMIT_COMPLETED','POLICY_UPDATED'
  ));

CREATE OR REPLACE FUNCTION validate_parking_allocation_scope()
RETURNS trigger AS $$
DECLARE
  slot_type TEXT;
  allocation_limit INTEGER;
  active_resident_count INTEGER;
BEGIN
  SELECT ps."slotType"
    INTO slot_type
  FROM "ParkingSlot" ps
  WHERE ps."id"=NEW."slotId"
    AND ps."societyId"=NEW."societyId"
    AND ps."active"=true;

  IF slot_type IS NULL THEN
    RAISE EXCEPTION 'Parking allocation slot must be active in the same society';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "HouseholdVehicle" hv
    WHERE hv."id"=NEW."vehicleId"
      AND hv."householdId"=NEW."householdId"
      AND hv."societyId"=NEW."societyId"
      AND hv."active"=true
  ) THEN
    RAISE EXCEPTION 'Parking allocation vehicle must be active in the household and society';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Household" h
    WHERE h."id"=NEW."householdId" AND h."societyId"=NEW."societyId"
  ) THEN
    RAISE EXCEPTION 'Parking allocation household must belong to the same society';
  END IF;

  IF slot_type='RESIDENT' AND NEW."endedAt" IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('parking-household:' || NEW."householdId"::text));

    SELECT pp."maxActiveResidentAllocationsPerHousehold"
      INTO allocation_limit
    FROM "ParkingPolicy" pp
    WHERE pp."societyId"=NEW."societyId";

    IF allocation_limit IS NOT NULL THEN
      SELECT count(*)::INTEGER
        INTO active_resident_count
      FROM "ParkingAllocation" pa
      JOIN "ParkingSlot" ps ON ps."id"=pa."slotId" AND ps."societyId"=pa."societyId"
      WHERE pa."societyId"=NEW."societyId"
        AND pa."householdId"=NEW."householdId"
        AND pa."endedAt" IS NULL
        AND ps."slotType"='RESIDENT'
        AND pa."id"<>NEW."id";

      IF active_resident_count >= allocation_limit THEN
        RAISE EXCEPTION 'Household has reached the configured resident parking allocation limit';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
