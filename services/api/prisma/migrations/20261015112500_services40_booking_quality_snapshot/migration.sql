-- Services 4.0.2: booking-time quality checklist commitment.
-- Snapshots are immutable via application contract; no retroactive updates.
-- No technician completion gate, payment or warranty changes.
CREATE TABLE "ConsumerServiceQualityChecklistSnapshot" (
  "bookingId" UUID PRIMARY KEY REFERENCES "ConsumerServiceBooking"("id") ON DELETE RESTRICT,
  "offeringId" UUID NOT NULL REFERENCES "ServiceOffering"("id") ON DELETE RESTRICT,
  "templateVersion" INTEGER NOT NULL CHECK ("templateVersion" > 0),
  "items" JSONB NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceQualityChecklistSnapshot_items_check"
    CHECK (jsonb_typeof("items") = 'array' AND jsonb_array_length("items") <= 20)
);
CREATE INDEX "ConsumerServiceQualityChecklistSnapshot_offering_idx"
  ON "ConsumerServiceQualityChecklistSnapshot" ("offeringId", "capturedAt" DESC);
