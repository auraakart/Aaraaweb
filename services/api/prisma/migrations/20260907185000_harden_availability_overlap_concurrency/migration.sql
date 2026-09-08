CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "ConsumerOfferingAvailabilityWindow"
  ADD CONSTRAINT "ConsumerOfferingAvailabilityWindow_no_active_overlap"
  EXCLUDE USING GIST (
    "offeringId" WITH =,
    "dayOfWeek" WITH =,
    int4range("startMinute", "endMinute", '[)') WITH &&
  )
  WHERE ("active" = true);
