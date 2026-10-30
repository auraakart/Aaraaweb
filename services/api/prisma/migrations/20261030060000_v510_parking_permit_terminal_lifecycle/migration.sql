-- Closing an existing permit releases capacity and records its terminal event.
-- Visitor check-in consumes the pass; slot deactivation must not trap permits.
-- Retain structural scope and pass-window validation for every operation.
CREATE OR REPLACE FUNCTION validate_parking_permit_scope()
RETURNS trigger AS $$
DECLARE
  pass_from TIMESTAMPTZ;
  pass_until TIMESTAMPTZ;
  closing_existing BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    closing_existing := OLD."status" = 'ACTIVE'
      AND NEW."status" IN ('CANCELLED', 'COMPLETED')
      AND ROW(NEW."societyId", NEW."slotId", NEW."visitorId", NEW."visitorPassId", NEW."startsAt", NEW."endsAt")
        IS NOT DISTINCT FROM ROW(OLD."societyId", OLD."slotId", OLD."visitorId", OLD."visitorPassId", OLD."startsAt", OLD."endsAt");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "ParkingSlot" ps
    WHERE ps."id"=NEW."slotId"
      AND ps."societyId"=NEW."societyId"
      AND (closing_existing OR (ps."active"=true AND ps."slotType" IN ('VISITOR','TEMPORARY','ACCESSIBLE')))
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
    AND (closing_existing OR (vp."status"='ACTIVE' AND v."status"='APPROVED'));

  IF pass_from IS NULL THEN
    RAISE EXCEPTION 'Parking permit requires an active approved visitor pass in the same society';
  END IF;

  IF NEW."startsAt" < pass_from OR NEW."endsAt" > pass_until THEN
    RAISE EXCEPTION 'Parking permit window must be contained within visitor pass validity';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
