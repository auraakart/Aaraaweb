CREATE OR REPLACE FUNCTION enforce_amenity_waitlist_blackout()
RETURNS trigger AS $$
DECLARE
  schedule_json jsonb;
BEGIN
  SELECT a."schedule" INTO schedule_json
  FROM "Amenity" a
  WHERE a."id" = NEW."amenityId"
    AND a."societyId" = NEW."societyId";

  IF schedule_json IS NULL OR NOT (schedule_json ? 'blackouts') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(schedule_json -> 'blackouts', '[]'::jsonb)) blackout
    WHERE NEW."startsAt" < (blackout ->> 'end')::timestamptz
      AND NEW."endsAt" > (blackout ->> 'start')::timestamptz
  ) THEN
    RAISE EXCEPTION 'Amenity waitlist is unavailable during the configured maintenance blackout';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AmenityWaitlist_blackout_guard" ON "AmenityWaitlistEntry";
CREATE TRIGGER "AmenityWaitlist_blackout_guard"
BEFORE INSERT OR UPDATE OF "amenityId", "societyId", "startsAt", "endsAt", "status" ON "AmenityWaitlistEntry"
FOR EACH ROW
WHEN (NEW."status" = 'WAITING')
EXECUTE FUNCTION enforce_amenity_waitlist_blackout();

CREATE OR REPLACE FUNCTION enforce_amenity_blackout_waitlist_policy()
RETURNS trigger AS $$
BEGIN
  IF (OLD."schedule" -> 'blackouts') IS DISTINCT FROM (NEW."schedule" -> 'blackouts')
     AND EXISTS (
       SELECT 1
       FROM "AmenityWaitlistEntry" w
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(NEW."schedule" -> 'blackouts', '[]'::jsonb)) blackout
       WHERE w."societyId" = NEW."societyId"
         AND w."amenityId" = NEW."id"
         AND w."status" = 'WAITING'
         AND w."endsAt" > CURRENT_TIMESTAMP
         AND w."startsAt" < (blackout ->> 'end')::timestamptz
         AND w."endsAt" > (blackout ->> 'start')::timestamptz
     ) THEN
    RAISE EXCEPTION 'Amenity blackout conflicts with an existing future waitlist entry';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Amenity_blackout_waitlist_policy_guard" ON "Amenity";
CREATE TRIGGER "Amenity_blackout_waitlist_policy_guard"
BEFORE UPDATE OF "schedule" ON "Amenity"
FOR EACH ROW EXECUTE FUNCTION enforce_amenity_blackout_waitlist_policy();

COMMENT ON FUNCTION enforce_amenity_waitlist_blackout()
  IS 'Extends the existing schedule.blackouts authority to amenity waitlist inserts and updates.';
COMMENT ON FUNCTION enforce_amenity_blackout_waitlist_policy()
  IS 'Prevents blackout policy changes from silently invalidating future waiting entries.';
