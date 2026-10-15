-- Services 4.0.3: append-only technician assessments against booked checklist items.
-- No completion enforcement and no payment / warranty changes.
CREATE TABLE "ConsumerServiceQualityEvidence" (
  "id" UUID PRIMARY KEY,
  "bookingId" UUID NOT NULL REFERENCES "ConsumerServiceBooking"("id") ON DELETE RESTRICT,
  "assignmentId" UUID NOT NULL REFERENCES "ConsumerServiceAssignment"("id") ON DELETE RESTRICT,
  "agentId" UUID NOT NULL REFERENCES "ConsumerProviderAgent"("id") ON DELETE RESTRICT,
  "actorUserId" UUID REFERENCES "User"("id") ON DELETE SET NULL,
  "itemId" VARCHAR(40) NOT NULL,
  "passed" BOOLEAN NOT NULL,
  "note" VARCHAR(500),
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceQualityEvidence_item_id_check" CHECK ("itemId" ~ '^[a-z][a-z0-9_]{1,39}$')
);
CREATE INDEX "ConsumerServiceQualityEvidence_booking_history_idx"
  ON "ConsumerServiceQualityEvidence" ("bookingId", "recordedAt", "id");
CREATE INDEX "ConsumerServiceQualityEvidence_assignment_history_idx"
  ON "ConsumerServiceQualityEvidence" ("assignmentId", "recordedAt", "id");
