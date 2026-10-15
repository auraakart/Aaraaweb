-- V4.90.16: the ReceivableStatus enum contains ISSUED, not OPEN.
-- Historical migration remains immutable; replace only the deployed function.
-- Existing trigger attachments continue to call this canonical function.
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
    ELSE 'ISSUED'::"ReceivableStatus"
  END
  WHERE "id" = target_receivable AND "societyId" = target_society AND "status" <> 'VOID';
END;
$$ LANGUAGE plpgsql;
