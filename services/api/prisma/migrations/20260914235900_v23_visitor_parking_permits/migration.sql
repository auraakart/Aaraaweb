CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "ParkingPermit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "slotId" UUID NOT NULL,
  "visitorId" UUID NOT NULL,
  "visitorPassId" UUID NOT NULL,
  "plateNumber" TEXT NOT NULL,
  "startsAt" TIMESTAMPTZ NOT NULL,
  "endsAt" TIMESTAMPTZ NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" UUID NOT NULL,
  "cancelledByUserId" UUID,
  "cancelledAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParkingPermit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParkingPermit_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "ParkingPermit_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ParkingSlot"("id") ON DELETE RESTRICT,
  CONSTRAINT "ParkingPermit_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE RESTRICT,
  CONSTRAINT "ParkingPermit_visitorPassId_fkey" FOREIGN KEY ("visitorPassId") REFERENCES "VisitorPass"("id") ON DELETE RESTRICT,
  CONSTRAINT "ParkingPermit_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "ParkingPermit_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "ParkingPermit_status_check" CHECK ("status" IN ('ACTIVE','CANCELLED','COMPLETED')),
  CONSTRAINT "ParkingPermit_window_check" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "ParkingPermit_plate_nonblank" CHECK (length(btrim("plateNumber")) > 0),
  CONSTRAINT "ParkingPermit_cancel_check" CHECK (
    ("status" <> 'CANCELLED' AND "cancelledAt" IS NULL AND "cancelledByUserId" IS NULL)
    OR ("status" = 'CANCELLED' AND "cancelledAt" IS NOT NULL AND "cancelledByUserId" IS NOT NULL)
  ),
  CONSTRAINT "ParkingPermit_complete_check" CHECK (
    ("status" <> 'COMPLETED' AND "completedAt" IS NULL)
    OR ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL)
  )
);

ALTER TABLE "ParkingPermit"
  ADD CONSTRAINT "ParkingPermit_active_slot_window_excl"
  EXCLUDE USING gist (
    "slotId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE ("status" = 'ACTIVE');

CREATE INDEX "ParkingPermit_society_window_idx"
  ON "ParkingPermit"("societyId", "status", "startsAt", "endsAt");
CREATE INDEX "ParkingPermit_visitor_idx"
  ON "ParkingPermit"("societyId", "visitorId", "createdAt" DESC);
CREATE INDEX "ParkingPermit_slot_idx"
  ON "ParkingPermit"("slotId", "status", "startsAt", "endsAt");

ALTER TABLE "ParkingEvent" ADD COLUMN "permitId" UUID;
ALTER TABLE "ParkingEvent"
  ADD CONSTRAINT "ParkingEvent_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "ParkingPermit"("id") ON DELETE SET NULL;
ALTER TABLE "ParkingEvent" DROP CONSTRAINT IF EXISTS "ParkingEvent_action_check";
ALTER TABLE "ParkingEvent" ADD CONSTRAINT "ParkingEvent_action_check"
  CHECK ("action" IN ('SLOT_CREATED','SLOT_UPDATED','ALLOCATED','RELEASED','PERMIT_CREATED','PERMIT_CANCELLED','PERMIT_COMPLETED'));

CREATE OR REPLACE FUNCTION validate_parking_permit_scope()
RETURNS trigger AS $$
DECLARE
  pass_from TIMESTAMPTZ;
  pass_until TIMESTAMPTZ;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "ParkingSlot" ps
    WHERE ps."id"=NEW."slotId"
      AND ps."societyId"=NEW."societyId"
      AND ps."active"=true
      AND ps."slotType" IN ('VISITOR','TEMPORARY','ACCESSIBLE')
  ) THEN
    RAISE EXCEPTION 'Parking permit slot must be an active visitor, temporary or accessible slot in the same society';
  END IF;

  SELECT vp."validFrom", vp."validUntil"
    INTO pass_from, pass_until
  FROM "VisitorPass" vp
  JOIN "Visitor" v ON v."id"=vp."visitorId" AND v."societyId"=vp."societyId"
  WHERE vp."id"=NEW."visitorPassId"
    AND vp."visitorId"=NEW."visitorId"
    AND vp."societyId"=NEW."societyId"
    AND vp."status"='ACTIVE'
    AND v."status"='APPROVED';

  IF pass_from IS NULL THEN
    RAISE EXCEPTION 'Parking permit requires an active approved visitor pass in the same society';
  END IF;

  IF NEW."startsAt" < pass_from OR NEW."endsAt" > pass_until THEN
    RAISE EXCEPTION 'Parking permit window must be contained within visitor pass validity';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ParkingPermit_scope_guard"
BEFORE INSERT OR UPDATE OF "societyId", "slotId", "visitorId", "visitorPassId", "startsAt", "endsAt", "status" ON "ParkingPermit"
FOR EACH ROW EXECUTE FUNCTION validate_parking_permit_scope();
