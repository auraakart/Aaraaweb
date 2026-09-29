CREATE OR REPLACE FUNCTION enforce_amenity_no_show_fair_use()
RETURNS trigger AS $$
DECLARE
  restriction_count integer;
  lookback_days integer;
  block_days integer;
  no_show_count integer;
  latest_no_show timestamptz;
BEGIN
  SELECT
    NULLIF(a."bookingRules"->>'noShowRestrictionCount','')::integer,
    NULLIF(a."bookingRules"->>'noShowLookbackDays','')::integer,
    NULLIF(a."bookingRules"->>'noShowBlockDays','')::integer
  INTO restriction_count, lookback_days, block_days
  FROM "Amenity" a
  WHERE a."id"=NEW."amenityId"
    AND a."societyId"=NEW."societyId";

  IF restriction_count IS NULL OR lookback_days IS NULL OR block_days IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::integer,MAX(b."noShowAt")
  INTO no_show_count,latest_no_show
  FROM "AmenityBooking" b
  WHERE b."societyId"=NEW."societyId"
    AND b."amenityId"=NEW."amenityId"
    AND b."userId"=NEW."userId"
    AND b."status"='NO_SHOW'
    AND b."noShowAt" IS NOT NULL
    AND b."noShowAt">=CURRENT_TIMESTAMP-make_interval(days=>lookback_days);

  IF no_show_count>=restriction_count
     AND latest_no_show IS NOT NULL
     AND latest_no_show+make_interval(days=>block_days)>CURRENT_TIMESTAMP THEN
    RAISE EXCEPTION 'Amenity booking is temporarily restricted by the configured no-show fair-use policy';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "AmenityBooking_no_show_fair_use_guard" ON "AmenityBooking";
CREATE TRIGGER "AmenityBooking_no_show_fair_use_guard"
BEFORE INSERT ON "AmenityBooking"
FOR EACH ROW
WHEN (NEW."status" IN ('PENDING','CONFIRMED'))
EXECUTE FUNCTION enforce_amenity_no_show_fair_use();

DROP TRIGGER IF EXISTS "AmenityWaitlist_no_show_fair_use_guard" ON "AmenityWaitlistEntry";
CREATE TRIGGER "AmenityWaitlist_no_show_fair_use_guard"
BEFORE INSERT ON "AmenityWaitlistEntry"
FOR EACH ROW
WHEN (NEW."status"='WAITING')
EXECUTE FUNCTION enforce_amenity_no_show_fair_use();

COMMENT ON FUNCTION enforce_amenity_no_show_fair_use()
  IS 'Defense-in-depth for optional non-financial amenity no-show fair-use restrictions on new bookings and waitlist joins.';
