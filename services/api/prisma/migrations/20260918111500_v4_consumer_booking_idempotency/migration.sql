ALTER TABLE "ConsumerServiceBooking"
  ADD COLUMN "idempotencyKey" VARCHAR(100);

ALTER TABLE "ConsumerServiceBooking"
  ADD CONSTRAINT "ConsumerServiceBooking_idempotency_not_blank"
  CHECK ("idempotencyKey" IS NULL OR btrim("idempotencyKey") <> '');

CREATE UNIQUE INDEX "ConsumerServiceBooking_user_idempotency_key"
  ON "ConsumerServiceBooking" ("userId","idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
