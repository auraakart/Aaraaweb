-- V2.3 accounting export execution and immutable artifact persistence.
-- Export artifacts are stored server-side and are only retrievable through the
-- authenticated accounting export API; no public object URL is introduced.

ALTER TABLE "AccountingExportJob" DROP CONSTRAINT "AccountingExportJob_status_valid";
ALTER TABLE "AccountingExportJob"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt" TIMESTAMPTZ(6),
  ADD COLUMN "leaseUntil" TIMESTAMPTZ(6),
  ADD CONSTRAINT "AccountingExportJob_attempt_count_valid" CHECK ("attemptCount" >= 0),
  ADD CONSTRAINT "AccountingExportJob_status_valid" CHECK ("status" IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'));

CREATE INDEX "AccountingExportJob_claim_idx"
  ON "AccountingExportJob"("status", "leaseUntil", "createdAt");
CREATE UNIQUE INDEX "AccountingExportJob_id_society_key"
  ON "AccountingExportJob"("id", "societyId");

CREATE TABLE "AccountingExportArtifact" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "filename" TEXT NOT NULL,
  "contentType" VARCHAR(120) NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "byteLength" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingExportArtifact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingExportArtifact_byte_length_valid" CHECK ("byteLength" >= 0),
  CONSTRAINT "AccountingExportArtifact_filename_not_blank" CHECK (btrim("filename") <> '')
);

CREATE UNIQUE INDEX "AccountingExportArtifact_job_key" ON "AccountingExportArtifact"("jobId");
CREATE INDEX "AccountingExportArtifact_society_created_idx" ON "AccountingExportArtifact"("societyId", "createdAt" DESC);
ALTER TABLE "AccountingExportArtifact"
  ADD CONSTRAINT "AccountingExportArtifact_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingExportArtifact"
  ADD CONSTRAINT "AccountingExportArtifact_job_fkey" FOREIGN KEY ("jobId", "societyId") REFERENCES "AccountingExportJob"("id", "societyId") ON DELETE CASCADE ON UPDATE CASCADE;
