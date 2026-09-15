-- V2.3 durable delivery orchestration for provider-neutral accounting exports.
-- Delivery state is transport evidence only; accounting journal truth and export
-- artifacts remain immutable and separate from external-provider state.

CREATE TABLE "AccountingConnectorDelivery" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "exportJobId" UUID NOT NULL,
  "provider" VARCHAR(120) NOT NULL,
  "idempotencyKey" VARCHAR(180) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'QUEUED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMPTZ(6),
  "nextAttemptAt" TIMESTAMPTZ(6),
  "leaseUntil" TIMESTAMPTZ(6),
  "providerReceiptId" VARCHAR(240),
  "failureCode" VARCHAR(80),
  "failureMessage" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(6),
  CONSTRAINT "AccountingConnectorDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingConnectorDelivery_provider_not_blank" CHECK (btrim("provider") <> ''),
  CONSTRAINT "AccountingConnectorDelivery_idempotency_not_blank" CHECK (btrim("idempotencyKey") <> ''),
  CONSTRAINT "AccountingConnectorDelivery_attempt_count_valid" CHECK ("attemptCount" >= 0),
  CONSTRAINT "AccountingConnectorDelivery_status_valid" CHECK ("status" IN ('QUEUED','PROCESSING','ACCEPTED','DELIVERED','FAILED','UNKNOWN')),
  CONSTRAINT "AccountingConnectorDelivery_completion_valid" CHECK (("status" IN ('DELIVERED','FAILED') AND "completedAt" IS NOT NULL) OR ("status" NOT IN ('DELIVERED','FAILED') AND "completedAt" IS NULL))
);

CREATE UNIQUE INDEX "AccountingConnectorDelivery_export_provider_key"
  ON "AccountingConnectorDelivery"("societyId","exportJobId","provider");
CREATE UNIQUE INDEX "AccountingConnectorDelivery_idempotency_key"
  ON "AccountingConnectorDelivery"("societyId","provider","idempotencyKey");
CREATE INDEX "AccountingConnectorDelivery_claim_idx"
  ON "AccountingConnectorDelivery"("status","nextAttemptAt","leaseUntil","createdAt");
CREATE INDEX "AccountingConnectorDelivery_society_created_idx"
  ON "AccountingConnectorDelivery"("societyId","createdAt" DESC);

ALTER TABLE "AccountingConnectorDelivery"
  ADD CONSTRAINT "AccountingConnectorDelivery_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingConnectorDelivery"
  ADD CONSTRAINT "AccountingConnectorDelivery_export_job_fkey" FOREIGN KEY ("exportJobId","societyId") REFERENCES "AccountingExportJob"("id","societyId") ON DELETE CASCADE ON UPDATE CASCADE;
