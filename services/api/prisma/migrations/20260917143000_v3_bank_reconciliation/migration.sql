-- Aaraagate V3.2 Society Finance Engine: bank reconciliation foundation.
-- Bank feeds are operational evidence. They never mutate posted journal history;
-- matching links an immutable bank transaction to an existing posted journal.

CREATE TYPE "BankTransactionDirection" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "BankTransactionStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');

CREATE TABLE "SocietyBankAccount" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "maskedAccountNumber" TEXT NOT NULL,
  "ifsc" TEXT,
  "ledgerAccountId" UUID NOT NULL,
  "openingBalancePaise" BIGINT NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyBankAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyBankAccount_code_not_blank" CHECK (btrim("code") <> ''),
  CONSTRAINT "SocietyBankAccount_bank_name_not_blank" CHECK (btrim("bankName") <> ''),
  CONSTRAINT "SocietyBankAccount_account_name_not_blank" CHECK (btrim("accountName") <> ''),
  CONSTRAINT "SocietyBankAccount_masked_number_not_blank" CHECK (btrim("maskedAccountNumber") <> '')
);

CREATE UNIQUE INDEX "SocietyBankAccount_society_code_key" ON "SocietyBankAccount" ("societyId", "code");
CREATE UNIQUE INDEX "SocietyBankAccount_id_society_key" ON "SocietyBankAccount" ("id", "societyId");
CREATE UNIQUE INDEX "SocietyBankAccount_society_ledger_key" ON "SocietyBankAccount" ("societyId", "ledgerAccountId");
CREATE INDEX "SocietyBankAccount_society_active_idx" ON "SocietyBankAccount" ("societyId", "active");

ALTER TABLE "SocietyBankAccount"
  ADD CONSTRAINT "SocietyBankAccount_society_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocietyBankAccount"
  ADD CONSTRAINT "SocietyBankAccount_ledger_fkey"
  FOREIGN KEY ("ledgerAccountId", "societyId") REFERENCES "LedgerAccount"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BankStatementTransaction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "bankAccountId" UUID NOT NULL,
  "externalKey" TEXT NOT NULL,
  "transactionDate" DATE NOT NULL,
  "valueDate" DATE,
  "direction" "BankTransactionDirection" NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "reference" TEXT,
  "description" TEXT,
  "status" "BankTransactionStatus" NOT NULL DEFAULT 'UNMATCHED',
  "importedByUserId" UUID NOT NULL,
  "importedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankStatementTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BankStatementTransaction_external_key_not_blank" CHECK (btrim("externalKey") <> ''),
  CONSTRAINT "BankStatementTransaction_amount_positive" CHECK ("amountPaise" > 0)
);

CREATE UNIQUE INDEX "BankStatementTransaction_bank_external_key" ON "BankStatementTransaction" ("bankAccountId", "externalKey");
CREATE UNIQUE INDEX "BankStatementTransaction_id_society_key" ON "BankStatementTransaction" ("id", "societyId");
CREATE INDEX "BankStatementTransaction_society_status_date_idx" ON "BankStatementTransaction" ("societyId", "status", "transactionDate");
CREATE INDEX "BankStatementTransaction_bank_date_idx" ON "BankStatementTransaction" ("bankAccountId", "transactionDate");

ALTER TABLE "BankStatementTransaction"
  ADD CONSTRAINT "BankStatementTransaction_bank_fkey"
  FOREIGN KEY ("bankAccountId", "societyId") REFERENCES "SocietyBankAccount"("id", "societyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankStatementTransaction"
  ADD CONSTRAINT "BankStatementTransaction_society_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankStatementTransaction"
  ADD CONSTRAINT "BankStatementTransaction_imported_by_fkey"
  FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BankReconciliationMatch" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "bankTransactionId" UUID NOT NULL,
  "journalEntryId" UUID NOT NULL,
  "matchedByUserId" UUID NOT NULL,
  "note" TEXT,
  "matchedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankReconciliationMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankReconciliationMatch_transaction_key" ON "BankReconciliationMatch" ("bankTransactionId");
CREATE UNIQUE INDEX "BankReconciliationMatch_id_society_key" ON "BankReconciliationMatch" ("id", "societyId");
CREATE INDEX "BankReconciliationMatch_society_journal_idx" ON "BankReconciliationMatch" ("societyId", "journalEntryId");

ALTER TABLE "BankReconciliationMatch"
  ADD CONSTRAINT "BankReconciliationMatch_transaction_fkey"
  FOREIGN KEY ("bankTransactionId", "societyId") REFERENCES "BankStatementTransaction"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliationMatch"
  ADD CONSTRAINT "BankReconciliationMatch_journal_fkey"
  FOREIGN KEY ("journalEntryId", "societyId") REFERENCES "JournalEntry"("id", "societyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankReconciliationMatch"
  ADD CONSTRAINT "BankReconciliationMatch_society_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankReconciliationMatch"
  ADD CONSTRAINT "BankReconciliationMatch_matched_by_fkey"
  FOREIGN KEY ("matchedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Once imported, economic evidence cannot be rewritten. Only reconciliation
-- status may move between UNMATCHED/MATCHED/IGNORED through application flows.
CREATE OR REPLACE FUNCTION "aaraagate_protect_bank_transaction_evidence"()
RETURNS trigger AS $$
BEGIN
  IF NEW."societyId" IS DISTINCT FROM OLD."societyId"
     OR NEW."bankAccountId" IS DISTINCT FROM OLD."bankAccountId"
     OR NEW."externalKey" IS DISTINCT FROM OLD."externalKey"
     OR NEW."transactionDate" IS DISTINCT FROM OLD."transactionDate"
     OR NEW."valueDate" IS DISTINCT FROM OLD."valueDate"
     OR NEW."direction" IS DISTINCT FROM OLD."direction"
     OR NEW."amountPaise" IS DISTINCT FROM OLD."amountPaise"
     OR NEW."reference" IS DISTINCT FROM OLD."reference"
     OR NEW."description" IS DISTINCT FROM OLD."description"
     OR NEW."importedByUserId" IS DISTINCT FROM OLD."importedByUserId"
     OR NEW."importedAt" IS DISTINCT FROM OLD."importedAt"
  THEN
    RAISE EXCEPTION 'Imported bank transaction evidence is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BankStatementTransaction_protect_evidence"
BEFORE UPDATE ON "BankStatementTransaction"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_protect_bank_transaction_evidence"();
