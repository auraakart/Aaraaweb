ALTER TABLE "EmergencyContact"
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "EmergencyContact_society_household_idempotency_key"
  ON "EmergencyContact"("societyId", "householdId", "idempotencyKey");
