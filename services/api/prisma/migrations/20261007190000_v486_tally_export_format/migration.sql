ALTER TABLE "AccountingExportJob"
  DROP CONSTRAINT IF EXISTS "AccountingExportJob_format_valid";

ALTER TABLE "AccountingExportJob"
  ADD CONSTRAINT "AccountingExportJob_format_valid"
  CHECK ("format" IN ('CSV', 'JSONL', 'TALLY_CSV'));
