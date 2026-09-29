CREATE OR REPLACE FUNCTION enforce_amenity_weekly_waitlist_schedule()
RETURNS trigger AS $$
DECLARE
  schedule_json jsonb; weekly jsonb; windows jsonb; local_start timestamp; local_end timestamp; day_key text; allowed boolean;
BEGIN
  SELECT a."schedule" INTO schedule_json FROM "Amenity" a WHERE a."id"=NEW."amenityId" AND a."societyId"=NEW."societyId";
  IF schedule_json IS NULL OR NOT (schedule_json ? 'weekly') THEN RETURN NEW; END IF;
  weekly:=schedule_json->'weekly';
  local_start:=NEW."startsAt" AT TIME ZONE 'Asia/Kolkata';
  local_end:=NEW."endsAt" AT TIME ZONE 'Asia/Kolkata';
  IF local_start::date<>local_end::date THEN RAISE EXCEPTION 'Amenity waitlist must fit within one India-local operating day'; END IF;
  day_key:=CASE EXTRACT(ISODOW FROM local_start)::int WHEN 1 THEN 'mon' WHEN 2 THEN 'tue' WHEN 3 THEN 'wed' WHEN 4 THEN 'thu' WHEN 5 THEN 'fri' WHEN 6 THEN 'sat' WHEN 7 THEN 'sun' END;
  windows:=weekly->day_key;
  IF windows IS NULL OR jsonb_array_length(windows)=0 THEN RAISE EXCEPTION 'Amenity waitlist is closed for the requested India-local day'; END IF;
  SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(windows) AS window_item WHERE local_start::time >= (window_item->>'start')::time AND local_end::time <= (window_item->>'end')::time) INTO allowed;
  IF NOT allowed THEN RAISE EXCEPTION 'Amenity waitlist is outside configured operating hours'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AmenityWaitlist_weekly_schedule_guard" ON "AmenityWaitlistEntry";
CREATE TRIGGER "AmenityWaitlist_weekly_schedule_guard"
BEFORE INSERT OR UPDATE OF "amenityId","societyId","startsAt","endsAt","status" ON "AmenityWaitlistEntry"
FOR EACH ROW WHEN (NEW."status"='WAITING')
EXECUTE FUNCTION enforce_amenity_weekly_waitlist_schedule();

CREATE OR REPLACE FUNCTION protect_amenity_weekly_waitlist_policy()
RETURNS trigger AS $$
BEGIN
  IF (OLD."schedule"->'weekly') IS DISTINCT FROM (NEW."schedule"->'weekly')
     AND EXISTS (SELECT 1 FROM "AmenityWaitlistEntry" w WHERE w."societyId"=NEW."societyId" AND w."amenityId"=NEW."id" AND w."status"='WAITING' AND w."endsAt">CURRENT_TIMESTAMP)
  THEN RAISE EXCEPTION 'Amenity weekly schedule cannot change while future waiting entries exist'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "Amenity_weekly_waitlist_policy_guard" ON "Amenity";
CREATE TRIGGER "Amenity_weekly_waitlist_policy_guard"
BEFORE UPDATE OF "schedule" ON "Amenity"
FOR EACH ROW EXECUTE FUNCTION protect_amenity_weekly_waitlist_policy();
