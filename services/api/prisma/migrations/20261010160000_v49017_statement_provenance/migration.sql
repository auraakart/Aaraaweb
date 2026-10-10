-- V4.90.17 — Bank statement provenance and source-level replay integrity.
-- A source checksum is caller-declared; the server independently hashes normalized
-- rows and preserves the exact transaction references committed atomically.
CREATE TABLE "BankStatementImportBatch" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "bankAccountId" UUID NOT NULL,
  "sourceSha256" TEXT NOT NULL,
  "manifestSha256" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL,
  "newCount" INTEGER NOT NULL,
  "rows" JSONB NOT NULL,
  "importedByUserId" UUID NOT NULL,
  "importedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankStatementImportBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BankStatementImportBatch_sha256_check" CHECK (
    "sourceSha256" ~ '^[0-9a-f]{64}$' AND "manifestSha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "BankStatementImportBatch_counts_check" CHECK (
    "rowCount" BETWEEN 1 AND 500 AND "newCount" BETWEEN 0 AND "rowCount"
    AND jsonb_typeof("rows")='array' AND jsonb_array_length("rows")="rowCount")
);
CREATE UNIQUE INDEX "BankStatementImportBatch_bank_source_unique"
  ON "BankStatementImportBatch" ("bankAccountId","sourceSha256");
CREATE INDEX "BankStatementImportBatch_society_date_idx"
  ON "BankStatementImportBatch" ("societyId","importedAt" DESC);
ALTER TABLE "BankStatementImportBatch"
  ADD CONSTRAINT "BankStatementImportBatch_bank_society_fkey"
    FOREIGN KEY ("bankAccountId","societyId")
    REFERENCES "SocietyBankAccount"("id","societyId") ON DELETE RESTRICT,
  ADD CONSTRAINT "BankStatementImportBatch_society_fkey"
    FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "BankStatementImportBatch_user_fkey"
    FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION "aaraagate_protect_statement_batch_evidence"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Bank statement provenance receipts are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "BankStatementImportBatch_immutable"
BEFORE UPDATE OR DELETE ON "BankStatementImportBatch"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_protect_statement_batch_evidence"();
