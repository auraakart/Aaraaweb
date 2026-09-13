-- Aaraagate V2 late-fee assessment foundation.
-- Late fees are append-only receivable adjustments; the original receivable economics remain immutable.

CREATE TYPE "LateFeeBatchStatus" AS ENUM ('PREVIEWED', 'APPLIED', 'FAILED');

CREATE TABLE "LateFeeBatch" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "asOfDate" DATE NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "LateFeeBatchStatus" NOT NULL DEFAULT 'PREVIEWED',
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMPTZ(6),
  CONSTRAINT "LateFeeBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LateFeeBatch_idempotency_not_blank" CHECK (btrim("idempotencyKey") <> ''),
  CONSTRAINT "LateFeeBatch_state_valid" CHECK (
    ("status" = 'PREVIEWED' AND "appliedAt" IS NULL)
    OR ("status" = 'APPLIED' AND "appliedAt" IS NOT NULL)
    OR ("status" = 'FAILED')
  )
);

CREATE UNIQUE INDEX "LateFeeBatch_society_idempotency_key"
  ON "LateFeeBatch" ("societyId", "idempotencyKey");
CREATE INDEX "LateFeeBatch_society_asof_idx"
  ON "LateFeeBatch" ("societyId", "asOfDate", "createdAt" DESC);

ALTER TABLE "LateFeeBatch"
  ADD CONSTRAINT "LateFeeBatch_society_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LateFeeBatch"
  ADD CONSTRAINT "LateFeeBatch_created_by_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LateFeeAssessment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "receivableId" UUID NOT NULL,
  "chargeRuleId" UUID NOT NULL,
  "asOfDate" DATE NOT NULL,
  "baseOutstandingPaise" BIGINT NOT NULL,
  "feePaise" BIGINT NOT NULL,
  "adjustmentId" UUID,
  "journalEntryId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LateFeeAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LateFeeAssessment_base_positive" CHECK ("baseOutstandingPaise" > 0),
  CONSTRAINT "LateFeeAssessment_fee_positive" CHECK ("feePaise" > 0)
);

CREATE UNIQUE INDEX "LateFeeAssessment_receivable_asof_key"
  ON "LateFeeAssessment" ("societyId", "receivableId", "asOfDate");
CREATE INDEX "LateFeeAssessment_batch_idx"
  ON "LateFeeAssessment" ("societyId", "batchId", "createdAt");

ALTER TABLE "LateFeeAssessment"
  ADD CONSTRAINT "LateFeeAssessment_batch_fkey"
  FOREIGN KEY ("batchId") REFERENCES "LateFeeBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LateFeeAssessment"
  ADD CONSTRAINT "LateFeeAssessment_receivable_fkey"
  FOREIGN KEY ("receivableId", "societyId") REFERENCES "Receivable"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LateFeeAssessment"
  ADD CONSTRAINT "LateFeeAssessment_charge_rule_fkey"
  FOREIGN KEY ("chargeRuleId", "societyId") REFERENCES "ChargeRule"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LateFeeAssessment"
  ADD CONSTRAINT "LateFeeAssessment_adjustment_fkey"
  FOREIGN KEY ("adjustmentId") REFERENCES "ReceivableAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LateFeeAssessment"
  ADD CONSTRAINT "LateFeeAssessment_journal_fkey"
  FOREIGN KEY ("journalEntryId", "societyId") REFERENCES "JournalEntry"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Once an assessment is linked to its posted adjustment/journal, economic values cannot be rewritten.
CREATE OR REPLACE FUNCTION "aaraagate_protect_late_fee_assessment"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Late fee assessment history cannot be deleted';
  END IF;

  IF NEW."societyId" <> OLD."societyId"
     OR NEW."batchId" <> OLD."batchId"
     OR NEW."receivableId" <> OLD."receivableId"
     OR NEW."chargeRuleId" <> OLD."chargeRuleId"
     OR NEW."asOfDate" <> OLD."asOfDate"
     OR NEW."baseOutstandingPaise" <> OLD."baseOutstandingPaise"
     OR NEW."feePaise" <> OLD."feePaise"
  THEN
    RAISE EXCEPTION 'Late fee assessment economics are immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LateFeeAssessment_protect_update"
BEFORE UPDATE ON "LateFeeAssessment"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_protect_late_fee_assessment"();

CREATE TRIGGER "LateFeeAssessment_protect_delete"
BEFORE DELETE ON "LateFeeAssessment"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_protect_late_fee_assessment"();
