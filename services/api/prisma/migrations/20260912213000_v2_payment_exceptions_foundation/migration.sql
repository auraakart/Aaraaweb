-- V2 payment exceptions: append-only allocation reversals and refunds.
-- Gateway Payment remains transaction truth. Corrections are compensating events.

CREATE TABLE "ReceivableAllocationReversal" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "allocationId" UUID NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "reversedByUserId" UUID NOT NULL,
  "reversedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReceivableAllocationReversal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReceivableAllocationReversal_amount_check" CHECK ("amountPaise" > 0),
  CONSTRAINT "ReceivableAllocationReversal_reason_check" CHECK (length(trim("reason")) > 0)
);

CREATE UNIQUE INDEX "ReceivableAllocationReversal_society_idempotency_key"
  ON "ReceivableAllocationReversal"("societyId", "idempotencyKey");
CREATE INDEX "ReceivableAllocationReversal_allocation_idx"
  ON "ReceivableAllocationReversal"("societyId", "allocationId", "reversedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ReceivableAllocation_id_society_key"
  ON "ReceivableAllocation"("id", "societyId");

ALTER TABLE "ReceivableAllocationReversal"
  ADD CONSTRAINT "ReceivableAllocationReversal_society_fkey"
    FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ReceivableAllocationReversal_allocation_society_fkey"
    FOREIGN KEY ("allocationId", "societyId") REFERENCES "ReceivableAllocation"("id", "societyId") ON DELETE RESTRICT,
  ADD CONSTRAINT "ReceivableAllocationReversal_actor_fkey"
    FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;

CREATE TABLE "PaymentRefund" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "reason" TEXT NOT NULL,
  "providerReference" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "refundedByUserId" UUID NOT NULL,
  "refundedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentRefund_amount_check" CHECK ("amountPaise" > 0),
  CONSTRAINT "PaymentRefund_reason_check" CHECK (length(trim("reason")) > 0)
);

CREATE UNIQUE INDEX "PaymentRefund_society_idempotency_key"
  ON "PaymentRefund"("societyId", "idempotencyKey");
CREATE INDEX "PaymentRefund_payment_idx"
  ON "PaymentRefund"("societyId", "paymentId", "refundedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_id_society_key" ON "Payment"("id", "societyId");

ALTER TABLE "PaymentRefund"
  ADD CONSTRAINT "PaymentRefund_society_fkey"
    FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "PaymentRefund_payment_society_fkey"
    FOREIGN KEY ("paymentId", "societyId") REFERENCES "Payment"("id", "societyId") ON DELETE RESTRICT,
  ADD CONSTRAINT "PaymentRefund_actor_fkey"
    FOREIGN KEY ("refundedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION "aaraagate_validate_allocation_reversal"()
RETURNS trigger AS $$
DECLARE
  allocation_amount BIGINT;
  reversed_amount BIGINT;
BEGIN
  SELECT a."amountPaise" INTO allocation_amount
  FROM "ReceivableAllocation" a
  WHERE a."id" = NEW."allocationId" AND a."societyId" = NEW."societyId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation does not belong to this society';
  END IF;

  SELECT COALESCE(SUM(r."amountPaise"), 0) INTO reversed_amount
  FROM "ReceivableAllocationReversal" r
  WHERE r."societyId" = NEW."societyId" AND r."allocationId" = NEW."allocationId";

  IF reversed_amount + NEW."amountPaise" > allocation_amount THEN
    RAISE EXCEPTION 'Allocation reversal exceeds unreversed allocation amount';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ReceivableAllocationReversal_validate_insert"
BEFORE INSERT ON "ReceivableAllocationReversal"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_validate_allocation_reversal"();

-- Recalculate receivable status from original economics + adjustments - net allocations.
CREATE OR REPLACE FUNCTION "aaraagate_recalculate_receivable_status"(target_society UUID, target_receivable UUID)
RETURNS void AS $$
DECLARE
  original_amount BIGINT;
  adjustment_total BIGINT;
  allocation_total BIGINT;
  reversal_total BIGINT;
  remaining BIGINT;
BEGIN
  SELECT r."amountPaise" INTO original_amount
  FROM "Receivable" r
  WHERE r."id" = target_receivable AND r."societyId" = target_society
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(CASE WHEN a."type" = 'DEBIT' THEN a."amountPaise" ELSE -a."amountPaise" END), 0)
    INTO adjustment_total
  FROM "ReceivableAdjustment" a
  WHERE a."societyId" = target_society AND a."receivableId" = target_receivable;

  SELECT COALESCE(SUM(a."amountPaise"), 0),
         COALESCE(SUM((SELECT COALESCE(SUM(ar."amountPaise"),0)
                       FROM "ReceivableAllocationReversal" ar
                       WHERE ar."societyId"=a."societyId" AND ar."allocationId"=a."id")),0)
    INTO allocation_total, reversal_total
  FROM "ReceivableAllocation" a
  WHERE a."societyId" = target_society AND a."receivableId" = target_receivable;

  remaining := original_amount + adjustment_total - (allocation_total - reversal_total);

  UPDATE "Receivable"
  SET "status" = CASE
    WHEN remaining <= 0 THEN 'SETTLED'::"ReceivableStatus"
    WHEN remaining < original_amount + adjustment_total THEN 'PARTIALLY_SETTLED'::"ReceivableStatus"
    ELSE 'OPEN'::"ReceivableStatus"
  END
  WHERE "id" = target_receivable AND "societyId" = target_society AND "status" <> 'VOID';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "aaraagate_refresh_receivable_status"()
RETURNS trigger AS $$
BEGIN
  PERFORM "aaraagate_recalculate_receivable_status"(NEW."societyId", NEW."receivableId");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "aaraagate_refresh_receivable_status_after_reversal"()
RETURNS trigger AS $$
DECLARE target_receivable UUID;
BEGIN
  SELECT a."receivableId" INTO target_receivable
  FROM "ReceivableAllocation" a
  WHERE a."id" = NEW."allocationId" AND a."societyId" = NEW."societyId";
  PERFORM "aaraagate_recalculate_receivable_status"(NEW."societyId", target_receivable);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ReceivableAllocationReversal_refresh_status"
AFTER INSERT ON "ReceivableAllocationReversal"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_refresh_receivable_status_after_reversal"();

-- Update allocation guard to use NET allocations after reversals.
CREATE OR REPLACE FUNCTION "aaraagate_validate_receivable_allocation"()
RETURNS trigger AS $$
DECLARE
  payment_amount BIGINT;
  payment_status "PaymentStatus";
  payment_allocated BIGINT;
  payment_reversed BIGINT;
  payment_refunded BIGINT;
  receivable_amount BIGINT;
  adjustment_total BIGINT;
  receivable_allocated BIGINT;
  receivable_reversed BIGINT;
  receivable_status "ReceivableStatus";
BEGIN
  SELECT p."amountPaise", p."status" INTO payment_amount, payment_status
  FROM "Payment" p
  WHERE p."id" = NEW."paymentId" AND p."societyId" = NEW."societyId"
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment does not belong to this society'; END IF;
  IF payment_status <> 'CAPTURED' THEN RAISE EXCEPTION 'Only captured payments can be allocated'; END IF;

  SELECT COALESCE(SUM(a."amountPaise"),0),
         COALESCE(SUM((SELECT COALESCE(SUM(r."amountPaise"),0) FROM "ReceivableAllocationReversal" r WHERE r."societyId"=a."societyId" AND r."allocationId"=a."id")),0)
    INTO payment_allocated, payment_reversed
  FROM "ReceivableAllocation" a
  WHERE a."societyId"=NEW."societyId" AND a."paymentId"=NEW."paymentId";

  SELECT COALESCE(SUM(r."amountPaise"),0) INTO payment_refunded
  FROM "PaymentRefund" r WHERE r."societyId"=NEW."societyId" AND r."paymentId"=NEW."paymentId";

  IF payment_allocated - payment_reversed + payment_refunded + NEW."amountPaise" > payment_amount THEN
    RAISE EXCEPTION 'Payment allocation exceeds available captured payment amount';
  END IF;

  SELECT r."amountPaise", r."status" INTO receivable_amount, receivable_status
  FROM "Receivable" r
  WHERE r."id"=NEW."receivableId" AND r."societyId"=NEW."societyId"
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receivable does not belong to this society'; END IF;
  IF receivable_status='VOID' THEN RAISE EXCEPTION 'Void receivable cannot receive payment allocation'; END IF;

  SELECT COALESCE(SUM(CASE WHEN a."type"='DEBIT' THEN a."amountPaise" ELSE -a."amountPaise" END),0)
    INTO adjustment_total FROM "ReceivableAdjustment" a
    WHERE a."societyId"=NEW."societyId" AND a."receivableId"=NEW."receivableId";

  SELECT COALESCE(SUM(a."amountPaise"),0),
         COALESCE(SUM((SELECT COALESCE(SUM(r."amountPaise"),0) FROM "ReceivableAllocationReversal" r WHERE r."societyId"=a."societyId" AND r."allocationId"=a."id")),0)
    INTO receivable_allocated, receivable_reversed
  FROM "ReceivableAllocation" a
  WHERE a."societyId"=NEW."societyId" AND a."receivableId"=NEW."receivableId";

  IF NEW."amountPaise" > receivable_amount + adjustment_total - (receivable_allocated - receivable_reversed) THEN
    RAISE EXCEPTION 'Allocation exceeds receivable outstanding amount';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "aaraagate_validate_payment_refund"()
RETURNS trigger AS $$
DECLARE
  payment_amount BIGINT;
  payment_status "PaymentStatus";
  gross_allocated BIGINT;
  reversed_allocated BIGINT;
  prior_refunds BIGINT;
BEGIN
  SELECT p."amountPaise",p."status" INTO payment_amount,payment_status
  FROM "Payment" p
  WHERE p."id"=NEW."paymentId" AND p."societyId"=NEW."societyId"
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment does not belong to this society'; END IF;
  IF payment_status <> 'CAPTURED' THEN RAISE EXCEPTION 'Only captured payments can be refunded'; END IF;

  SELECT COALESCE(SUM(a."amountPaise"),0),
         COALESCE(SUM((SELECT COALESCE(SUM(r."amountPaise"),0) FROM "ReceivableAllocationReversal" r WHERE r."societyId"=a."societyId" AND r."allocationId"=a."id")),0)
    INTO gross_allocated,reversed_allocated
  FROM "ReceivableAllocation" a
  WHERE a."societyId"=NEW."societyId" AND a."paymentId"=NEW."paymentId";

  SELECT COALESCE(SUM(r."amountPaise"),0) INTO prior_refunds
  FROM "PaymentRefund" r
  WHERE r."societyId"=NEW."societyId" AND r."paymentId"=NEW."paymentId";

  IF NEW."amountPaise" > payment_amount - (gross_allocated - reversed_allocated) - prior_refunds THEN
    RAISE EXCEPTION 'Refund exceeds unallocated refundable payment amount; reverse allocations first';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PaymentRefund_validate_insert"
BEFORE INSERT ON "PaymentRefund"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_validate_payment_refund"();

CREATE OR REPLACE FUNCTION "prevent_payment_exception_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Payment exception events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ReceivableAllocationReversal_append_only"
BEFORE UPDATE OR DELETE ON "ReceivableAllocationReversal"
FOR EACH ROW EXECUTE FUNCTION "prevent_payment_exception_mutation"();
CREATE TRIGGER "PaymentRefund_append_only"
BEFORE UPDATE OR DELETE ON "PaymentRefund"
FOR EACH ROW EXECUTE FUNCTION "prevent_payment_exception_mutation"();
