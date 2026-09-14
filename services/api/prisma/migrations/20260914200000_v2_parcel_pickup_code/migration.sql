ALTER TABLE "Parcel"
  ADD COLUMN "pickupCodeSalt" TEXT,
  ADD COLUMN "pickupCodeHash" TEXT,
  ADD COLUMN "pickupCodeIssuedAt" TIMESTAMPTZ,
  ADD COLUMN "pickupCodeExpiresAt" TIMESTAMPTZ,
  ADD COLUMN "pickupCodeAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pickupCodeLockedAt" TIMESTAMPTZ,
  ADD CONSTRAINT "Parcel_pickup_attempts_check" CHECK ("pickupCodeAttempts" >= 0),
  ADD CONSTRAINT "Parcel_pickup_code_state_check" CHECK (
    ("pickupCodeHash" IS NULL AND "pickupCodeSalt" IS NULL AND "pickupCodeIssuedAt" IS NULL AND "pickupCodeExpiresAt" IS NULL)
    OR
    ("pickupCodeHash" IS NOT NULL AND "pickupCodeSalt" IS NOT NULL AND "pickupCodeIssuedAt" IS NOT NULL AND "pickupCodeExpiresAt" IS NOT NULL AND "pickupCodeExpiresAt" > "pickupCodeIssuedAt")
  );

ALTER TABLE "ParcelEvent" DROP CONSTRAINT "ParcelEvent_action_check";
ALTER TABLE "ParcelEvent"
  ADD CONSTRAINT "ParcelEvent_action_check"
  CHECK ("action" IN ('RECEIVED','COLLECTED','RETURNED','PICKUP_CODE_ISSUED','PICKUP_CODE_FAILED','PICKUP_CODE_LOCKED','PICKUP_CODE_VERIFIED'));
