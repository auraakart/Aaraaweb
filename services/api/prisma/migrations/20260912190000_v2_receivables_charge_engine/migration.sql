-- Aaraagate V2 receivables and charge-engine foundation.
-- Economic history is append-only: issued receivables are corrected by adjustments/voids,
-- and payment settlement is represented by allocations rather than rewriting original charges.

CREATE TYPE "ChargeFrequency" AS ENUM ('ONE_TIME', 'MONTHLY', 'QUARTERLY', 'ANNUAL');
CREATE TYPE "LateFeeMode" AS ENUM ('NONE', 'FIXED', 'PERCENTAGE');
CREATE TYPE "ReceivableStatus" AS ENUM ('ISSUED', 'PARTIALLY_SETTLED', 'SETTLED', 'VOID');
CREATE TYPE "ReceivableAdjustmentType" AS ENUM ('DEBIT', 'CREDIT', 'WAIVER');

CREATE TABLE "ChargeRule" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "frequency" "ChargeFrequency" NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "receivableAccountId" UUID NOT NULL,
  "incomeAccountId" UUID NOT NULL,
  "fundId" UUID,
  "dueDay" INTEGER,
  "lateFeeMode" "LateFeeMode" NOT NULL DEFAULT 'NONE',
  "lateFeeFixedPaise" BIGINT,
  "lateFeeBasisPoints" INTEGER,
  "graceDays" INTEGER NOT NULL DEFAULT 0,
  "effectiveFrom" DATE NOT NULL,
  "effectiveUntil" DATE,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChargeRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChargeRule_code_not_blank" CHECK (btrim("code") <> ''),
  CONSTRAINT "ChargeRule_name_not_blank" CHECK (btrim("name") <> ''),
  CONSTRAINT "ChargeRule_amount_positive" CHECK ("amountPaise" > 0),
  CONSTRAINT "ChargeRule_due_day_valid" CHECK ("dueDay" IS NULL OR "dueDay" BETWEEN 1 AND 28),
  CONSTRAINT "ChargeRule_grace_days_valid" CHECK ("graceDays" BETWEEN 0 AND 365),
  CONSTRAINT "ChargeRule_effective_dates_valid" CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" >= "effectiveFrom"),
  CONSTRAINT "ChargeRule_late_fee_valid" CHECK (
    ("lateFeeMode" = 'NONE' AND "lateFeeFixedPaise" IS NULL AND "lateFeeBasisPoints" IS NULL)
    OR ("lateFeeMode" = 'FIXED' AND "lateFeeFixedPaise" IS NOT NULL AND "lateFeeFixedPaise" > 0 AND "lateFeeBasisPoints" IS NULL)
    OR ("lateFeeMode" = 'PERCENTAGE' AND "lateFeeBasisPoints" IS NOT NULL AND "lateFeeBasisPoints" > 0 AND "lateFeeBasisPoints" <= 10000 AND "lateFeeFixedPaise" IS NULL)
  )
);

CREATE UNIQUE INDEX "ChargeRule_society_code_key" ON "ChargeRule" ("societyId", "code");
CREATE UNIQUE INDEX "ChargeRule_id_society_key" ON "ChargeRule" ("id", "societyId");
CREATE INDEX "ChargeRule_society_active_effective_idx" ON "ChargeRule" ("societyId", "active", "effectiveFrom", "effectiveUntil");

ALTER TABLE "ChargeRule"
  ADD CONSTRAINT "ChargeRule_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChargeRule"
  ADD CONSTRAINT "ChargeRule_receivable_account_fkey" FOREIGN KEY ("receivableAccountId", "societyId") REFERENCES "LedgerAccount"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChargeRule"
  ADD CONSTRAINT "ChargeRule_income_account_fkey" FOREIGN KEY ("incomeAccountId", "societyId") REFERENCES "LedgerAccount"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChargeRule"
  ADD CONSTRAINT "ChargeRule_fund_fkey" FOREIGN KEY ("fundId", "societyId") REFERENCES "AccountingFund"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Receivable" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "chargeRuleId" UUID,
  "receivableNumber" TEXT NOT NULL,
  "billingPeriod" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "dueDate" DATE NOT NULL,
  "status" "ReceivableStatus" NOT NULL DEFAULT 'ISSUED',
  "journalEntryId" UUID,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "issuedByUserId" UUID NOT NULL,
  "issuedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" TIMESTAMPTZ(6),
  "voidedByUserId" UUID,
  "voidReason" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Receivable_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Receivable_number_not_blank" CHECK (btrim("receivableNumber") <> ''),
  CONSTRAINT "Receivable_billing_period_not_blank" CHECK (btrim("billingPeriod") <> ''),
  CONSTRAINT "Receivable_description_not_blank" CHECK (btrim("description") <> ''),
  CONSTRAINT "Receivable_amount_positive" CHECK ("amountPaise" > 0),
  CONSTRAINT "Receivable_void_state_valid" CHECK (
    ("status" <> 'VOID' AND "voidedAt" IS NULL AND "voidedByUserId" IS NULL AND "voidReason" IS NULL)
    OR ("status" = 'VOID' AND "voidedAt" IS NOT NULL AND "voidedByUserId" IS NOT NULL AND btrim(COALESCE("voidReason", '')) <> '')
  )
);

CREATE UNIQUE INDEX "Receivable_society_number_key" ON "Receivable" ("societyId", "receivableNumber");
CREATE UNIQUE INDEX "Receivable_id_society_key" ON "Receivable" ("id", "societyId");
CREATE UNIQUE INDEX "Receivable_society_source_key" ON "Receivable" ("societyId", "sourceType", "sourceId") WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL;
CREATE INDEX "Receivable_society_unit_due_status_idx" ON "Receivable" ("societyId", "unitId", "dueDate", "status");
CREATE INDEX "Receivable_society_rule_period_idx" ON "Receivable" ("societyId", "chargeRuleId", "billingPeriod");

ALTER TABLE "Receivable"
  ADD CONSTRAINT "Receivable_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Receivable"
  ADD CONSTRAINT "Receivable_unit_fkey" FOREIGN KEY ("unitId", "societyId") REFERENCES "Unit"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receivable"
  ADD CONSTRAINT "Receivable_charge_rule_fkey" FOREIGN KEY ("chargeRuleId", "societyId") REFERENCES "ChargeRule"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receivable"
  ADD CONSTRAINT "Receivable_journal_fkey" FOREIGN KEY ("journalEntryId", "societyId") REFERENCES "JournalEntry"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receivable"
  ADD CONSTRAINT "Receivable_issued_by_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Receivable"
  ADD CONSTRAINT "Receivable_voided_by_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReceivableAdjustment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "receivableId" UUID NOT NULL,
  "type" "ReceivableAdjustmentType" NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "reason" TEXT NOT NULL,
  "journalEntryId" UUID,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReceivableAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReceivableAdjustment_amount_positive" CHECK ("amountPaise" > 0),
  CONSTRAINT "ReceivableAdjustment_reason_not_blank" CHECK (btrim("reason") <> '')
);

CREATE INDEX "ReceivableAdjustment_society_receivable_created_idx" ON "ReceivableAdjustment" ("societyId", "receivableId", "createdAt");
ALTER TABLE "ReceivableAdjustment"
  ADD CONSTRAINT "ReceivableAdjustment_receivable_fkey" FOREIGN KEY ("receivableId", "societyId") REFERENCES "Receivable"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivableAdjustment"
  ADD CONSTRAINT "ReceivableAdjustment_journal_fkey" FOREIGN KEY ("journalEntryId", "societyId") REFERENCES "JournalEntry"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivableAdjustment"
  ADD CONSTRAINT "ReceivableAdjustment_created_by_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReceivableAllocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "receivableId" UUID NOT NULL,
  "paymentId" UUID,
  "amountPaise" BIGINT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "allocatedByUserId" UUID,
  "allocatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReceivableAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReceivableAllocation_amount_positive" CHECK ("amountPaise" > 0),
  CONSTRAINT "ReceivableAllocation_idempotency_not_blank" CHECK (btrim("idempotencyKey") <> '')
);

CREATE UNIQUE INDEX "ReceivableAllocation_society_idempotency_key" ON "ReceivableAllocation" ("societyId", "idempotencyKey");
CREATE INDEX "ReceivableAllocation_society_receivable_idx" ON "ReceivableAllocation" ("societyId", "receivableId", "allocatedAt");
CREATE INDEX "ReceivableAllocation_society_payment_idx" ON "ReceivableAllocation" ("societyId", "paymentId") WHERE "paymentId" IS NOT NULL;
ALTER TABLE "ReceivableAllocation"
  ADD CONSTRAINT "ReceivableAllocation_receivable_fkey" FOREIGN KEY ("receivableId", "societyId") REFERENCES "Receivable"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivableAllocation"
  ADD CONSTRAINT "ReceivableAllocation_payment_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReceivableAllocation"
  ADD CONSTRAINT "ReceivableAllocation_allocated_by_fkey" FOREIGN KEY ("allocatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Issued receivables are economic records. Only settlement status and explicit void metadata may change;
-- amount, unit, due date, source and journal linkage cannot be rewritten after issuance.
CREATE OR REPLACE FUNCTION "aaraagate_protect_receivable_history"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Receivable history cannot be deleted';
  END IF;

  IF NEW."societyId" <> OLD."societyId"
     OR NEW."unitId" <> OLD."unitId"
     OR NEW."receivableNumber" <> OLD."receivableNumber"
     OR NEW."billingPeriod" <> OLD."billingPeriod"
     OR NEW."description" <> OLD."description"
     OR NEW."amountPaise" <> OLD."amountPaise"
     OR NEW."dueDate" <> OLD."dueDate"
     OR NEW."journalEntryId" IS DISTINCT FROM OLD."journalEntryId"
     OR NEW."sourceType" IS DISTINCT FROM OLD."sourceType"
     OR NEW."sourceId" IS DISTINCT FROM OLD."sourceId"
     OR NEW."issuedByUserId" <> OLD."issuedByUserId"
     OR NEW."issuedAt" <> OLD."issuedAt"
  THEN
    RAISE EXCEPTION 'Issued receivable economics are immutable; use adjustment or void';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Receivable_protect_update"
BEFORE UPDATE ON "Receivable"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_protect_receivable_history"();
CREATE TRIGGER "Receivable_protect_delete"
BEFORE DELETE ON "Receivable"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_protect_receivable_history"();

-- Adjustments and allocations are append-only settlement history.
CREATE OR REPLACE FUNCTION "aaraagate_block_receivable_child_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Receivable adjustment/allocation history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ReceivableAdjustment_no_update" BEFORE UPDATE ON "ReceivableAdjustment" FOR EACH ROW EXECUTE FUNCTION "aaraagate_block_receivable_child_mutation"();
CREATE TRIGGER "ReceivableAdjustment_no_delete" BEFORE DELETE ON "ReceivableAdjustment" FOR EACH ROW EXECUTE FUNCTION "aaraagate_block_receivable_child_mutation"();
CREATE TRIGGER "ReceivableAllocation_no_update" BEFORE UPDATE ON "ReceivableAllocation" FOR EACH ROW EXECUTE FUNCTION "aaraagate_block_receivable_child_mutation"();
CREATE TRIGGER "ReceivableAllocation_no_delete" BEFORE DELETE ON "ReceivableAllocation" FOR EACH ROW EXECUTE FUNCTION "aaraagate_block_receivable_child_mutation"();
