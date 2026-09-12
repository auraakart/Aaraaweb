-- Aaraagate V2 accounting foundation.
-- Payment gateway transactions remain separate from accounting journals.
-- Posted financial history is intended to be corrected by reversal/adjustment,
-- never by destructive mutation of the original economic event.

CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

CREATE TABLE "LedgerAccount" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "LedgerAccountType" NOT NULL,
  "parentAccountId" UUID,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LedgerAccount_code_not_blank" CHECK (btrim("code") <> ''),
  CONSTRAINT "LedgerAccount_name_not_blank" CHECK (btrim("name") <> '')
);

CREATE UNIQUE INDEX "LedgerAccount_society_code_key" ON "LedgerAccount" ("societyId", "code");
CREATE UNIQUE INDEX "LedgerAccount_id_society_key" ON "LedgerAccount" ("id", "societyId");
CREATE INDEX "LedgerAccount_society_type_active_idx" ON "LedgerAccount" ("societyId", "type", "active");

ALTER TABLE "LedgerAccount"
  ADD CONSTRAINT "LedgerAccount_society_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerAccount"
  ADD CONSTRAINT "LedgerAccount_parent_fkey"
  FOREIGN KEY ("parentAccountId", "societyId") REFERENCES "LedgerAccount"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AccountingFund" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "restricted" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingFund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingFund_code_not_blank" CHECK (btrim("code") <> ''),
  CONSTRAINT "AccountingFund_name_not_blank" CHECK (btrim("name") <> '')
);

CREATE UNIQUE INDEX "AccountingFund_society_code_key" ON "AccountingFund" ("societyId", "code");
CREATE UNIQUE INDEX "AccountingFund_id_society_key" ON "AccountingFund" ("id", "societyId");
CREATE INDEX "AccountingFund_society_active_idx" ON "AccountingFund" ("societyId", "active");

ALTER TABLE "AccountingFund"
  ADD CONSTRAINT "AccountingFund_society_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AccountingPeriod" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
  "closedAt" TIMESTAMPTZ(6),
  "closedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingPeriod_dates_valid" CHECK ("startsOn" <= "endsOn"),
  CONSTRAINT "AccountingPeriod_close_state_valid" CHECK (
    ("status" = 'OPEN' AND "closedAt" IS NULL AND "closedByUserId" IS NULL)
    OR
    ("status" = 'CLOSED' AND "closedAt" IS NOT NULL AND "closedByUserId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "AccountingPeriod_society_code_key" ON "AccountingPeriod" ("societyId", "code");
CREATE UNIQUE INDEX "AccountingPeriod_id_society_key" ON "AccountingPeriod" ("id", "societyId");
CREATE INDEX "AccountingPeriod_society_dates_idx" ON "AccountingPeriod" ("societyId", "startsOn", "endsOn");

ALTER TABLE "AccountingPeriod"
  ADD CONSTRAINT "AccountingPeriod_society_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingPeriod"
  ADD CONSTRAINT "AccountingPeriod_closed_by_fkey"
  FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "JournalEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "periodId" UUID NOT NULL,
  "entryNumber" TEXT NOT NULL,
  "entryDate" DATE NOT NULL,
  "description" TEXT NOT NULL,
  "status" "JournalEntryStatus" NOT NULL DEFAULT 'DRAFT',
  "sourceType" TEXT,
  "sourceId" TEXT,
  "externalReference" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "createdByUserId" UUID NOT NULL,
  "postedByUserId" UUID,
  "postedAt" TIMESTAMPTZ(6),
  "reversedAt" TIMESTAMPTZ(6),
  "reversalOfEntryId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalEntry_number_not_blank" CHECK (btrim("entryNumber") <> ''),
  CONSTRAINT "JournalEntry_description_not_blank" CHECK (btrim("description") <> ''),
  CONSTRAINT "JournalEntry_currency_inr" CHECK ("currency" = 'INR'),
  CONSTRAINT "JournalEntry_post_state_valid" CHECK (
    ("status" = 'DRAFT' AND "postedAt" IS NULL AND "postedByUserId" IS NULL AND "reversedAt" IS NULL)
    OR
    ("status" = 'POSTED' AND "postedAt" IS NOT NULL AND "postedByUserId" IS NOT NULL AND "reversedAt" IS NULL)
    OR
    ("status" = 'REVERSED' AND "postedAt" IS NOT NULL AND "postedByUserId" IS NOT NULL AND "reversedAt" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "JournalEntry_society_number_key" ON "JournalEntry" ("societyId", "entryNumber");
CREATE UNIQUE INDEX "JournalEntry_id_society_key" ON "JournalEntry" ("id", "societyId");
CREATE UNIQUE INDEX "JournalEntry_society_source_key" ON "JournalEntry" ("societyId", "sourceType", "sourceId") WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL;
CREATE INDEX "JournalEntry_society_date_status_idx" ON "JournalEntry" ("societyId", "entryDate", "status");
CREATE INDEX "JournalEntry_society_period_status_idx" ON "JournalEntry" ("societyId", "periodId", "status");

ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_society_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_period_fkey"
  FOREIGN KEY ("periodId", "societyId") REFERENCES "AccountingPeriod"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_created_by_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_posted_by_fkey"
  FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalEntry"
  ADD CONSTRAINT "JournalEntry_reversal_of_fkey"
  FOREIGN KEY ("reversalOfEntryId", "societyId") REFERENCES "JournalEntry"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "JournalLine" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "entryId" UUID NOT NULL,
  "accountId" UUID NOT NULL,
  "fundId" UUID,
  "unitId" UUID,
  "description" TEXT,
  "debitPaise" BIGINT NOT NULL DEFAULT 0,
  "creditPaise" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JournalLine_single_sided_amount" CHECK (
    ("debitPaise" > 0 AND "creditPaise" = 0)
    OR
    ("creditPaise" > 0 AND "debitPaise" = 0)
  )
);

CREATE INDEX "JournalLine_society_entry_idx" ON "JournalLine" ("societyId", "entryId");
CREATE INDEX "JournalLine_society_account_idx" ON "JournalLine" ("societyId", "accountId");
CREATE INDEX "JournalLine_society_fund_idx" ON "JournalLine" ("societyId", "fundId") WHERE "fundId" IS NOT NULL;
CREATE INDEX "JournalLine_society_unit_idx" ON "JournalLine" ("societyId", "unitId") WHERE "unitId" IS NOT NULL;

ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_society_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_entry_fkey"
  FOREIGN KEY ("entryId", "societyId") REFERENCES "JournalEntry"("id", "societyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_account_fkey"
  FOREIGN KEY ("accountId", "societyId") REFERENCES "LedgerAccount"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_fund_fkey"
  FOREIGN KEY ("fundId", "societyId") REFERENCES "AccountingFund"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalLine"
  ADD CONSTRAINT "JournalLine_unit_fkey"
  FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Closed accounting periods are immutable at the posting boundary. The API also
-- re-checks this under the same transaction that posts the journal.
CREATE OR REPLACE FUNCTION "aaraagate_prevent_closed_period_reopen"()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'CLOSED' AND NEW."status" <> 'CLOSED' THEN
    RAISE EXCEPTION 'Closed accounting period cannot be reopened';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AccountingPeriod_prevent_reopen"
BEFORE UPDATE ON "AccountingPeriod"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_prevent_closed_period_reopen"();

-- Prevent destructive edits/deletes to posted/reversed journal headers. A posted
-- journal may only transition once to REVERSED; correcting economics requires a
-- new reversing/adjusting journal entry.
CREATE OR REPLACE FUNCTION "aaraagate_protect_posted_journal"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD."status" IN ('POSTED', 'REVERSED') THEN
    RAISE EXCEPTION 'Posted accounting journal cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" IN ('POSTED', 'REVERSED') THEN
    IF OLD."status" = 'POSTED'
       AND NEW."status" = 'REVERSED'
       AND NEW."reversedAt" IS NOT NULL
       AND NEW."id" = OLD."id"
       AND NEW."societyId" = OLD."societyId"
       AND NEW."periodId" = OLD."periodId"
       AND NEW."entryNumber" = OLD."entryNumber"
       AND NEW."entryDate" = OLD."entryDate"
       AND NEW."description" = OLD."description"
       AND NEW."currency" = OLD."currency"
       AND NEW."createdByUserId" = OLD."createdByUserId"
       AND NEW."postedByUserId" = OLD."postedByUserId"
       AND NEW."postedAt" = OLD."postedAt"
       AND NEW."createdAt" = OLD."createdAt"
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Posted accounting journal is immutable; use reversal/adjustment';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "JournalEntry_protect_posted_update"
BEFORE UPDATE ON "JournalEntry"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_protect_posted_journal"();
CREATE TRIGGER "JournalEntry_protect_posted_delete"
BEFORE DELETE ON "JournalEntry"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_protect_posted_journal"();

-- Lines belonging to a posted/reversed journal are immutable as well.
CREATE OR REPLACE FUNCTION "aaraagate_protect_posted_journal_line"()
RETURNS trigger AS $$
DECLARE
  target_entry UUID;
  journal_status "JournalEntryStatus";
BEGIN
  target_entry := CASE WHEN TG_OP = 'DELETE' THEN OLD."entryId" ELSE NEW."entryId" END;
  SELECT "status" INTO journal_status FROM "JournalEntry" WHERE "id" = target_entry;
  IF journal_status IN ('POSTED', 'REVERSED') THEN
    RAISE EXCEPTION 'Posted accounting journal lines are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "JournalLine_protect_posted_update"
BEFORE UPDATE ON "JournalLine"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_protect_posted_journal_line"();
CREATE TRIGGER "JournalLine_protect_posted_delete"
BEFORE DELETE ON "JournalLine"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_protect_posted_journal_line"();
