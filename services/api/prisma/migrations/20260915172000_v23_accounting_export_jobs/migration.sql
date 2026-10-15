ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ACCOUNTING_EXPORT_REQUESTED';

CREATE TABLE "AccountingExportJob" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "contractVersion" VARCHAR(80) NOT NULL,
  "format" VARCHAR(10) NOT NULL,
  "fromDate" DATE NOT NULL,
  "toDate" DATE NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
  "recordCount" INTEGER,
  "artifactKey" TEXT,
  "errorCode" VARCHAR(80),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(6),
  CONSTRAINT "AccountingExportJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingExportJob_dates_valid" CHECK ("fromDate" <= "toDate"),
  CONSTRAINT "AccountingExportJob_format_valid" CHECK ("format" IN ('CSV', 'JSONL')),
  CONSTRAINT "AccountingExportJob_status_valid" CHECK ("status" IN ('QUEUED', 'COMPLETED', 'FAILED'))
);

CREATE UNIQUE INDEX "AccountingExportJob_society_idempotency_key" ON "AccountingExportJob"("societyId", "idempotencyKey");
CREATE INDEX "AccountingExportJob_society_created_idx" ON "AccountingExportJob"("societyId", "createdAt" DESC);
ALTER TABLE "AccountingExportJob" ADD CONSTRAINT "AccountingExportJob_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingExportJob" ADD CONSTRAINT "AccountingExportJob_requester_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
