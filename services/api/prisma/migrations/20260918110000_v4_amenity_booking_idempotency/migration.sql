ALTER TABLE "AmenityBooking"
  ADD COLUMN "idempotencyKey" VARCHAR(100);

ALTER TABLE "AmenityBooking"
  ADD CONSTRAINT "AmenityBooking_idempotency_not_blank"
  CHECK ("idempotencyKey" IS NULL OR btrim("idempotencyKey") <> '');

CREATE UNIQUE INDEX "AmenityBooking_society_user_idempotency_key"
  ON "AmenityBooking" ("societyId","userId","idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
