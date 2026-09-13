-- Operational hardening for V2 expenses/payables.
-- Allows the legitimate APPROVED -> POSTED transition while preserving approved economics,
-- and adds append-only settlement events so payable balances remain derived.

CREATE TABLE "PayableSettlement" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "payableId" UUID NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "settledOn" DATE NOT NULL,
  "reference" TEXT,
  "journalEntryId" UUID NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayableSettlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PayableSettlement_amount_check" CHECK ("amountPaise" > 0)
);

CREATE UNIQUE INDEX "PayableSettlement_society_idempotency_key"
  ON "PayableSettlement"("societyId", "idempotencyKey");
CREATE UNIQUE INDEX "PayableSettlement_journal_key" ON "PayableSettlement"("journalEntryId");
CREATE INDEX "PayableSettlement_payable_created_idx" ON "PayableSettlement"("payableId", "createdAt");

ALTER TABLE "PayableSettlement"
  ADD CONSTRAINT "PayableSettlement_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "PayableSettlement_payable_society_fkey" FOREIGN KEY ("payableId", "societyId") REFERENCES "SocietyPayable"("id", "societyId") ON DELETE RESTRICT,
  ADD CONSTRAINT "PayableSettlement_journal_society_fkey" FOREIGN KEY ("journalEntryId", "societyId") REFERENCES "JournalEntry"("id", "societyId") ON DELETE RESTRICT,
  ADD CONSTRAINT "PayableSettlement_created_by_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;

-- Settlements are append-only. Corrections use reversing journals plus compensating events.
CREATE OR REPLACE FUNCTION "prevent_payable_settlement_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Payable settlements are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PayableSettlement_append_only"
BEFORE UPDATE OR DELETE ON "PayableSettlement"
FOR EACH ROW EXECUTE FUNCTION "prevent_payable_settlement_mutation"();

-- Approved expense economics stay immutable, but APPROVED -> POSTED may attach exactly one journal.
CREATE OR REPLACE FUNCTION "prevent_final_expense_economic_mutation"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('APPROVED', 'POSTED') AND (
    NEW."societyId" IS DISTINCT FROM OLD."societyId" OR
    NEW."expenseNumber" IS DISTINCT FROM OLD."expenseNumber" OR
    NEW."vendorName" IS DISTINCT FROM OLD."vendorName" OR
    NEW."invoiceReference" IS DISTINCT FROM OLD."invoiceReference" OR
    NEW."expenseDate" IS DISTINCT FROM OLD."expenseDate" OR
    NEW."dueDate" IS DISTINCT FROM OLD."dueDate" OR
    NEW."description" IS DISTINCT FROM OLD."description" OR
    NEW."amountPaise" IS DISTINCT FROM OLD."amountPaise" OR
    NEW."currency" IS DISTINCT FROM OLD."currency" OR
    NEW."expenseAccountId" IS DISTINCT FROM OLD."expenseAccountId" OR
    NEW."fundId" IS DISTINCT FROM OLD."fundId"
  ) THEN
    RAISE EXCEPTION 'Approved or posted expense economics are immutable';
  END IF;

  IF OLD."status" = 'APPROVED' AND NEW."status" = 'POSTED' THEN
    IF OLD."journalEntryId" IS NOT NULL OR NEW."journalEntryId" IS NULL THEN
      RAISE EXCEPTION 'Approved expense posting must attach exactly one journal';
    END IF;
  ELSIF OLD."status" IN ('APPROVED', 'POSTED') AND NEW."journalEntryId" IS DISTINCT FROM OLD."journalEntryId" THEN
    RAISE EXCEPTION 'Posted journal linkage is immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Database defense-in-depth against over-settlement.
CREATE OR REPLACE FUNCTION "validate_payable_settlement"() RETURNS trigger AS $$
DECLARE
  original_amount BIGINT;
  already_settled BIGINT;
BEGIN
  SELECT "originalAmountPaise" INTO original_amount
  FROM "SocietyPayable"
  WHERE "id" = NEW."payableId" AND "societyId" = NEW."societyId"
  FOR UPDATE;

  IF original_amount IS NULL THEN
    RAISE EXCEPTION 'Payable not found in society';
  END IF;

  SELECT COALESCE(SUM("amountPaise"), 0) INTO already_settled
  FROM "PayableSettlement"
  WHERE "payableId" = NEW."payableId" AND "societyId" = NEW."societyId";

  IF already_settled + NEW."amountPaise" > original_amount THEN
    RAISE EXCEPTION 'Payable settlement exceeds outstanding amount';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PayableSettlement_validate"
BEFORE INSERT ON "PayableSettlement"
FOR EACH ROW EXECUTE FUNCTION "validate_payable_settlement"();
