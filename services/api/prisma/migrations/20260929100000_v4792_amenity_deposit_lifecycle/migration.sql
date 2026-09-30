-- V4.79.2 refundable amenity deposits reuse the existing society Payment truth.
-- No wallet or separate refund ledger is introduced.

ALTER TABLE "AmenityBooking"
  ADD COLUMN "depositPaise" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "depositStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "depositDueAt" TIMESTAMPTZ(6),
  ADD COLUMN "depositPaymentWindowMinutes" INTEGER;

ALTER TABLE "AmenityBooking"
  ADD CONSTRAINT "AmenityBooking_deposit_amount_check" CHECK ("depositPaise" >= 0),
  ADD CONSTRAINT "AmenityBooking_deposit_status_check" CHECK ("depositStatus" IN (
    'NOT_REQUIRED','APPROVAL_PENDING','PAYMENT_REQUIRED','CAPTURED','REFUND_REQUIRED','REFUNDED','VOIDED'
  )),
  ADD CONSTRAINT "AmenityBooking_deposit_window_check" CHECK (
    ("depositPaise"=0 AND "depositStatus"='NOT_REQUIRED' AND "depositPaymentWindowMinutes" IS NULL)
    OR
    ("depositPaise">0 AND "depositPaymentWindowMinutes" BETWEEN 5 AND 1440 AND "depositStatus"<>'NOT_REQUIRED')
  );

CREATE UNIQUE INDEX IF NOT EXISTS "AmenityBooking_id_society_key"
  ON "AmenityBooking"("id","societyId");
CREATE INDEX "AmenityBooking_deposit_due_idx"
  ON "AmenityBooking"("depositStatus","depositDueAt")
  WHERE "depositStatus"='PAYMENT_REQUIRED';

ALTER TABLE "Payment"
  ADD COLUMN "purposeType" TEXT NOT NULL DEFAULT 'MAINTENANCE_INVOICE',
  ADD COLUMN "amenityBookingId" UUID,
  ALTER COLUMN "invoiceId" DROP NOT NULL;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_purpose_check" CHECK ("purposeType" IN ('MAINTENANCE_INVOICE','AMENITY_DEPOSIT')),
  ADD CONSTRAINT "Payment_source_check" CHECK (
    ("purposeType"='MAINTENANCE_INVOICE' AND "invoiceId" IS NOT NULL AND "amenityBookingId" IS NULL)
    OR
    ("purposeType"='AMENITY_DEPOSIT' AND "invoiceId" IS NULL AND "amenityBookingId" IS NOT NULL)
  ),
  ADD CONSTRAINT "Payment_amenityBooking_society_fkey"
    FOREIGN KEY ("amenityBookingId","societyId") REFERENCES "AmenityBooking"("id","societyId") ON DELETE RESTRICT;

CREATE INDEX "Payment_society_purpose_amenity_status_idx"
  ON "Payment"("societyId","purposeType","amenityBookingId","status");

CREATE UNIQUE INDEX "Payment_active_amenity_deposit_unique"
  ON "Payment"("societyId","amenityBookingId")
  WHERE "purposeType"='AMENITY_DEPOSIT' AND "status" IN ('CREATED','AUTHORIZED','CAPTURED');

CREATE OR REPLACE FUNCTION "aaraagate_validate_amenity_deposit_payment"()
RETURNS trigger AS $$
DECLARE
  expected_amount INTEGER;
  booking_user UUID;
BEGIN
  IF NEW."purposeType" <> 'AMENITY_DEPOSIT' THEN RETURN NEW; END IF;
  SELECT b."depositPaise",b."userId" INTO expected_amount,booking_user
  FROM "AmenityBooking" b
  WHERE b."id"=NEW."amenityBookingId" AND b."societyId"=NEW."societyId";
  IF NOT FOUND THEN RAISE EXCEPTION 'Amenity deposit booking does not belong to this society'; END IF;
  IF expected_amount <= 0 OR NEW."amountPaise" <> expected_amount THEN
    RAISE EXCEPTION 'Amenity deposit payment amount must match the booking deposit';
  END IF;
  IF NEW."payerUserId" <> booking_user THEN
    RAISE EXCEPTION 'Amenity deposit payer must be the booking resident';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Payment_amenity_deposit_validate"
BEFORE INSERT OR UPDATE OF "amenityBookingId","amountPaise","payerUserId","purposeType" ON "Payment"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_validate_amenity_deposit_payment"();

CREATE OR REPLACE FUNCTION "aaraagate_reject_nonmaintenance_allocation"()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Payment" p
    WHERE p."id"=NEW."paymentId" AND p."societyId"=NEW."societyId"
      AND p."purposeType"<>'MAINTENANCE_INVOICE'
  ) THEN
    RAISE EXCEPTION 'Only maintenance-invoice payments can be allocated to receivables';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ReceivableAllocation_payment_purpose_guard"
BEFORE INSERT OR UPDATE OF "paymentId" ON "ReceivableAllocation"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_reject_nonmaintenance_allocation"();
