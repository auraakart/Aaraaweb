-- V2 payment allocation integrity.
-- Gateway Payment remains transaction truth; allocations are append-only settlement links.

CREATE OR REPLACE FUNCTION "aaraagate_validate_receivable_allocation"()
RETURNS trigger AS $$
DECLARE
  payment_amount BIGINT;
  payment_status "PaymentStatus";
  payment_allocated BIGINT;
  receivable_amount BIGINT;
  adjustment_total BIGINT;
  receivable_allocated BIGINT;
  receivable_status "ReceivableStatus";
BEGIN
  SELECT p."amountPaise", p."status"
    INTO payment_amount, payment_status
  FROM "Payment" p
  WHERE p."id" = NEW."paymentId" AND p."societyId" = NEW."societyId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment does not belong to this society';
  END IF;

  IF payment_status <> 'CAPTURED' THEN
    RAISE EXCEPTION 'Only captured payments can be allocated';
  END IF;

  SELECT COALESCE(SUM(a."amountPaise"), 0)
    INTO payment_allocated
  FROM "ReceivableAllocation" a
  WHERE a."societyId" = NEW."societyId" AND a."paymentId" = NEW."paymentId";

  IF payment_allocated + NEW."amountPaise" > payment_amount THEN
    RAISE EXCEPTION 'Payment allocation exceeds captured payment amount';
  END IF;

  SELECT r."amountPaise", r."status"
    INTO receivable_amount, receivable_status
  FROM "Receivable" r
  WHERE r."id" = NEW."receivableId" AND r."societyId" = NEW."societyId"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receivable does not belong to this society';
  END IF;

  IF receivable_status = 'VOID' THEN
    RAISE EXCEPTION 'Void receivable cannot receive payment allocation';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN a."type" = 'DEBIT' THEN a."amountPaise" ELSE -a."amountPaise" END), 0)
    INTO adjustment_total
  FROM "ReceivableAdjustment" a
  WHERE a."societyId" = NEW."societyId" AND a."receivableId" = NEW."receivableId";

  SELECT COALESCE(SUM(a."amountPaise"), 0)
    INTO receivable_allocated
  FROM "ReceivableAllocation" a
  WHERE a."societyId" = NEW."societyId" AND a."receivableId" = NEW."receivableId";

  IF NEW."amountPaise" > receivable_amount + adjustment_total - receivable_allocated THEN
    RAISE EXCEPTION 'Allocation exceeds receivable outstanding amount';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ReceivableAllocation_validate_insert"
BEFORE INSERT ON "ReceivableAllocation"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_validate_receivable_allocation"();

CREATE OR REPLACE FUNCTION "aaraagate_refresh_receivable_status"()
RETURNS trigger AS $$
DECLARE
  original_amount BIGINT;
  adjustment_total BIGINT;
  allocation_total BIGINT;
  remaining BIGINT;
BEGIN
  SELECT r."amountPaise" INTO original_amount
  FROM "Receivable" r
  WHERE r."id" = NEW."receivableId" AND r."societyId" = NEW."societyId"
  FOR UPDATE;

  SELECT COALESCE(SUM(CASE WHEN a."type" = 'DEBIT' THEN a."amountPaise" ELSE -a."amountPaise" END), 0)
    INTO adjustment_total
  FROM "ReceivableAdjustment" a
  WHERE a."societyId" = NEW."societyId" AND a."receivableId" = NEW."receivableId";

  SELECT COALESCE(SUM(a."amountPaise"), 0)
    INTO allocation_total
  FROM "ReceivableAllocation" a
  WHERE a."societyId" = NEW."societyId" AND a."receivableId" = NEW."receivableId";

  remaining := original_amount + adjustment_total - allocation_total;

  UPDATE "Receivable"
  SET "status" = CASE WHEN remaining = 0 THEN 'SETTLED'::"ReceivableStatus" ELSE 'PARTIALLY_SETTLED'::"ReceivableStatus" END
  WHERE "id" = NEW."receivableId" AND "societyId" = NEW."societyId" AND "status" <> 'VOID';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ReceivableAllocation_refresh_status"
AFTER INSERT ON "ReceivableAllocation"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_refresh_receivable_status"();
