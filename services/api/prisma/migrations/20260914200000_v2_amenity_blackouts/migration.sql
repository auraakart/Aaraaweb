CREATE OR REPLACE FUNCTION validate_amenity_weekly_schedule()
RETURNS trigger AS $$
DECLARE
  weekly jsonb;
  blackouts jsonb;
  day_key text;
  windows jsonb;
  window_item jsonb;
  blackout_item jsonb;
  start_text text;
  end_text text;
  blackout_start timestamptz;
  blackout_end timestamptz;
BEGIN
  IF NEW."schedule" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."schedule" ? 'weekly' THEN
    weekly := NEW."schedule" -> 'weekly';
    IF jsonb_typeof(weekly) <> 'object' THEN
      RAISE EXCEPTION 'Amenity schedule.weekly must be an object';
    END IF;

    FOR day_key, windows IN SELECT key, value FROM jsonb_each(weekly)
    LOOP
      IF day_key NOT IN ('mon','tue','wed','thu','fri','sat','sun') THEN
        RAISE EXCEPTION 'Unsupported amenity weekday key: %', day_key;
      END IF;
      IF jsonb_typeof(windows) <> 'array' THEN
        RAISE EXCEPTION 'Amenity schedule day % must be an array', day_key;
      END IF;

      FOR window_item IN SELECT value FROM jsonb_array_elements(windows)
      LOOP
        IF jsonb_typeof(window_item) <> 'object'
           OR NOT (window_item ? 'start')
           OR NOT (window_item ? 'end') THEN
          RAISE EXCEPTION 'Amenity schedule windows require start and end';
        END IF;
        start_text := window_item ->> 'start';
        end_text := window_item ->> 'end';
        IF start_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
           OR end_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
          RAISE EXCEPTION 'Amenity schedule times must use HH:MM 24-hour format';
        END IF;
        IF start_text >= end_text THEN
          RAISE EXCEPTION 'Amenity schedule window start must be before end';
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  IF NEW."schedule" ? 'blackouts' THEN
    blackouts := NEW."schedule" -> 'blackouts';
    IF jsonb_typeof(blackouts) <> 'array' THEN
      RAISE EXCEPTION 'Amenity schedule.blackouts must be an array';
    END IF;

    FOR blackout_item IN SELECT value FROM jsonb_array_elements(blackouts)
    LOOP
      IF jsonb_typeof(blackout_item) <> 'object'
         OR NOT (blackout_item ? 'start')
         OR NOT (blackout_item ? 'end') THEN
        RAISE EXCEPTION 'Amenity blackout windows require start and end';
      END IF;
      BEGIN
        blackout_start := (blackout_item ->> 'start')::timestamptz;
        blackout_end := (blackout_item ->> 'end')::timestamptz;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Amenity blackout timestamps must be valid ISO-8601 timestamps';
      END;
      IF blackout_start >= blackout_end THEN
        RAISE EXCEPTION 'Amenity blackout start must be before end';
      END IF;
      IF blackout_item ? 'reason' AND length(blackout_item ->> 'reason') > 200 THEN
        RAISE EXCEPTION 'Amenity blackout reason must be 200 characters or fewer';
      END IF;
    END LOOP;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (OLD."schedule" -> 'weekly') IS DISTINCT FROM (NEW."schedule" -> 'weekly')
     AND EXISTS (
       SELECT 1 FROM "AmenityBooking" b
       WHERE b."societyId" = NEW."societyId"
         AND b."amenityId" = NEW."id"
         AND b."status" IN ('PENDING','CONFIRMED')
         AND b."endsAt" > CURRENT_TIMESTAMP
     ) THEN
    RAISE EXCEPTION 'Amenity weekly schedule cannot change while future active bookings exist';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (OLD."schedule" -> 'blackouts') IS DISTINCT FROM (NEW."schedule" -> 'blackouts')
     AND EXISTS (
       SELECT 1
       FROM "AmenityBooking" b
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(NEW."schedule" -> 'blackouts', '[]'::jsonb)) blackout
       WHERE b."societyId" = NEW."societyId"
         AND b."amenityId" = NEW."id"
         AND b."status" IN ('PENDING','CONFIRMED')
         AND b."endsAt" > CURRENT_TIMESTAMP
         AND b."startsAt" < (blackout ->> 'end')::timestamptz
         AND b."endsAt" > (blackout ->> 'start')::timestamptz
     ) THEN
    RAISE EXCEPTION 'Amenity blackout conflicts with an existing future booking';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_amenity_blackout_booking()
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
    RAISE EXCEPTION 'Amenity is unavailable during the configured maintenance blackout';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AmenityBooking_blackout_guard" ON "AmenityBooking";
CREATE TRIGGER "AmenityBooking_blackout_guard"
BEFORE INSERT OR UPDATE OF "amenityId", "societyId", "startsAt", "endsAt" ON "AmenityBooking"
FOR EACH ROW EXECUTE FUNCTION enforce_amenity_blackout_booking();

COMMENT ON FUNCTION enforce_amenity_blackout_booking()
  IS 'Rejects amenity bookings that overlap schedule.blackouts maintenance or closure windows.';
