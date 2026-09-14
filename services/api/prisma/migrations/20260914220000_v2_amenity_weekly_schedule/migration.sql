CREATE OR REPLACE FUNCTION validate_amenity_weekly_schedule()
RETURNS trigger AS $$
DECLARE
  weekly jsonb;
  day_key text;
  windows jsonb;
  window_item jsonb;
  start_text text;
  end_text text;
BEGIN
  IF NEW."schedule" IS NULL OR NOT (NEW."schedule" ? 'weekly') THEN
    RETURN NEW;
  END IF;

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

  IF TG_OP = 'UPDATE'
     AND OLD."schedule" IS DISTINCT FROM NEW."schedule"
     AND EXISTS (
       SELECT 1 FROM "AmenityBooking" b
       WHERE b."societyId" = NEW."societyId"
         AND b."amenityId" = NEW."id"
         AND b."status" IN ('PENDING','CONFIRMED')
         AND b."endsAt" > CURRENT_TIMESTAMP
     ) THEN
    RAISE EXCEPTION 'Amenity weekly schedule cannot change while future active bookings exist';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Amenity_weekly_schedule_guard"
BEFORE INSERT OR UPDATE OF "schedule" ON "Amenity"
FOR EACH ROW EXECUTE FUNCTION validate_amenity_weekly_schedule();

CREATE OR REPLACE FUNCTION enforce_amenity_weekly_booking_schedule()
RETURNS trigger AS $$
DECLARE
  schedule_json jsonb;
  weekly jsonb;
  windows jsonb;
  local_start timestamp;
  local_end timestamp;
  day_key text;
  allowed boolean;
BEGIN
  SELECT a."schedule" INTO schedule_json
  FROM "Amenity" a
  WHERE a."id" = NEW."amenityId"
    AND a."societyId" = NEW."societyId";

  IF schedule_json IS NULL OR NOT (schedule_json ? 'weekly') THEN
    RETURN NEW;
  END IF;

  weekly := schedule_json -> 'weekly';
  local_start := NEW."startsAt" AT TIME ZONE 'Asia/Kolkata';
  local_end := NEW."endsAt" AT TIME ZONE 'Asia/Kolkata';

  IF local_start::date <> local_end::date THEN
    RAISE EXCEPTION 'Amenity booking must fit within one India-local operating day';
  END IF;

  day_key := CASE EXTRACT(ISODOW FROM local_start)::int
    WHEN 1 THEN 'mon'
    WHEN 2 THEN 'tue'
    WHEN 3 THEN 'wed'
    WHEN 4 THEN 'thu'
    WHEN 5 THEN 'fri'
    WHEN 6 THEN 'sat'
    WHEN 7 THEN 'sun'
  END;

  windows := weekly -> day_key;
  IF windows IS NULL OR jsonb_array_length(windows) = 0 THEN
    RAISE EXCEPTION 'Amenity is closed for the requested India-local day';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(windows) AS window_item
    WHERE local_start::time >= (window_item ->> 'start')::time
      AND local_end::time <= (window_item ->> 'end')::time
  ) INTO allowed;

  IF NOT allowed THEN
    RAISE EXCEPTION 'Amenity booking is outside configured operating hours';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AmenityBooking_weekly_schedule_guard"
BEFORE INSERT OR UPDATE OF "amenityId", "societyId", "startsAt", "endsAt" ON "AmenityBooking"
FOR EACH ROW EXECUTE FUNCTION enforce_amenity_weekly_booking_schedule();

COMMENT ON FUNCTION enforce_amenity_weekly_booking_schedule()
  IS 'Enforces optional schedule.weekly windows in Asia/Kolkata; schedules without weekly retain legacy unrestricted behavior.';
