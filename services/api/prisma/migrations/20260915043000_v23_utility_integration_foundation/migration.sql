-- V2.3 external utility integration foundation.
-- Provider secrets are stored only as SHA-256 hashes; raw keys are returned once at creation.

CREATE TABLE "UtilityIntegration" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedByUserId" UUID REFERENCES "User"("id") ON DELETE RESTRICT,
  "revokedAt" TIMESTAMPTZ,
  CONSTRAINT "UtilityIntegration_code_nonblank" CHECK (length(btrim("code")) > 0),
  CONSTRAINT "UtilityIntegration_name_nonblank" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "UtilityIntegration_secret_hash_check" CHECK ("secretHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "UtilityIntegration_status_check" CHECK ("status" IN ('ACTIVE','REVOKED')),
  CONSTRAINT "UtilityIntegration_revocation_check" CHECK (
    ("status"='ACTIVE' AND "revokedAt" IS NULL AND "revokedByUserId" IS NULL) OR
    ("status"='REVOKED' AND "revokedAt" IS NOT NULL AND "revokedByUserId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "UtilityIntegration_society_code_key"
  ON "UtilityIntegration"("societyId", "code");
CREATE UNIQUE INDEX "UtilityIntegration_secret_hash_key"
  ON "UtilityIntegration"("secretHash");
CREATE INDEX "UtilityIntegration_society_status_idx"
  ON "UtilityIntegration"("societyId", "status", "createdAt" DESC);

CREATE TABLE "UtilityIntegrationMeterMap" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "integrationId" UUID NOT NULL REFERENCES "UtilityIntegration"("id") ON DELETE CASCADE,
  "externalMeterId" TEXT NOT NULL,
  "meterId" UUID NOT NULL REFERENCES "UtilityMeter"("id") ON DELETE RESTRICT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdByUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UtilityIntegrationMeterMap_external_nonblank" CHECK (length(btrim("externalMeterId")) > 0)
);

CREATE UNIQUE INDEX "UtilityIntegrationMeterMap_external_key"
  ON "UtilityIntegrationMeterMap"("integrationId", "externalMeterId");
CREATE INDEX "UtilityIntegrationMeterMap_society_meter_idx"
  ON "UtilityIntegrationMeterMap"("societyId", "meterId", "active");

CREATE TABLE "UtilityIngestionReceipt" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "integrationId" UUID NOT NULL REFERENCES "UtilityIntegration"("id") ON DELETE RESTRICT,
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "externalMeterId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "readingId" UUID REFERENCES "UtilityReading"("id") ON DELETE SET NULL,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "rawPayload" JSONB NOT NULL,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UtilityIngestionReceipt_idempotency_nonblank" CHECK (length(btrim("idempotencyKey")) > 0),
  CONSTRAINT "UtilityIngestionReceipt_payload_hash_check" CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "UtilityIngestionReceipt_status_check" CHECK ("status" IN ('ACCEPTED','QUARANTINED')),
  CONSTRAINT "UtilityIngestionReceipt_result_check" CHECK (
    ("status"='ACCEPTED' AND "readingId" IS NOT NULL AND "errorCode" IS NULL AND "errorMessage" IS NULL) OR
    ("status"='QUARANTINED' AND "readingId" IS NULL AND "errorCode" IS NOT NULL AND "errorMessage" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "UtilityIngestionReceipt_idempotency_key"
  ON "UtilityIngestionReceipt"("integrationId", "idempotencyKey");
CREATE INDEX "UtilityIngestionReceipt_society_status_idx"
  ON "UtilityIngestionReceipt"("societyId", "status", "receivedAt" DESC);

CREATE TABLE "UtilityIngestionAttempt" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "integrationId" UUID NOT NULL REFERENCES "UtilityIntegration"("id") ON DELETE RESTRICT,
  "receiptId" UUID REFERENCES "UtilityIngestionReceipt"("id") ON DELETE SET NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UtilityIngestionAttempt_outcome_check" CHECK (
    "outcome" IN ('ACCEPTED','QUARANTINED','REPLAY','IDEMPOTENCY_CONFLICT')
  )
);

CREATE INDEX "UtilityIngestionAttempt_integration_time_idx"
  ON "UtilityIngestionAttempt"("integrationId", "occurredAt" DESC);

ALTER TABLE "UtilityReading"
  ALTER COLUMN "recordedByUserId" DROP NOT NULL,
  ADD COLUMN "integrationId" UUID REFERENCES "UtilityIntegration"("id") ON DELETE RESTRICT;

-- Earlier admin clients could label a human-entered reading as INTEGRATION.
-- Those rows have no integration identity and are correctly retained as MANUAL evidence.
UPDATE "UtilityReading"
SET "source"='MANUAL'
WHERE "source"='INTEGRATION' AND "integrationId" IS NULL;

ALTER TABLE "UtilityReading"
  ADD CONSTRAINT "UtilityReading_attribution_check" CHECK (
    ("source"='INTEGRATION' AND "integrationId" IS NOT NULL AND "recordedByUserId" IS NULL) OR
    ("source"<>'INTEGRATION' AND "integrationId" IS NULL AND "recordedByUserId" IS NOT NULL)
  );

ALTER TABLE "UtilityEvent"
  ALTER COLUMN "actorUserId" DROP NOT NULL,
  ADD COLUMN "actorSource" TEXT NOT NULL DEFAULT 'HUMAN',
  ADD COLUMN "integrationId" UUID REFERENCES "UtilityIntegration"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "UtilityEvent_actor_source_check" CHECK ("actorSource" IN ('HUMAN','INTEGRATION')),
  ADD CONSTRAINT "UtilityEvent_attribution_check" CHECK (
    ("actorSource"='HUMAN' AND "actorUserId" IS NOT NULL AND "integrationId" IS NULL) OR
    ("actorSource"='INTEGRATION' AND "actorUserId" IS NULL AND "integrationId" IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION "validate_utility_integration_scope"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "UtilityIntegration" i
    WHERE i."id"=NEW."integrationId" AND i."societyId"=NEW."societyId"
  ) THEN
    RAISE EXCEPTION 'Utility integration must belong to the same society';
  END IF;
  IF TG_TABLE_NAME='UtilityIntegrationMeterMap' AND NOT EXISTS (
    SELECT 1 FROM "UtilityMeter" m
    WHERE m."id"=NEW."meterId" AND m."societyId"=NEW."societyId"
  ) THEN
    RAISE EXCEPTION 'Mapped utility meter must belong to the same society';
  END IF;
  IF TG_TABLE_NAME='UtilityIngestionReceipt' AND NEW."readingId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "UtilityReading" r
    WHERE r."id"=NEW."readingId" AND r."societyId"=NEW."societyId"
  ) THEN
    RAISE EXCEPTION 'Ingestion receipt reading must belong to the same society';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UtilityIntegrationMeterMap_scope_guard"
BEFORE INSERT OR UPDATE OF "societyId","integrationId","meterId" ON "UtilityIntegrationMeterMap"
FOR EACH ROW EXECUTE FUNCTION "validate_utility_integration_scope"();

CREATE TRIGGER "UtilityIngestionReceipt_scope_guard"
BEFORE INSERT OR UPDATE OF "societyId","integrationId","readingId" ON "UtilityIngestionReceipt"
FOR EACH ROW EXECUTE FUNCTION "validate_utility_integration_scope"();

CREATE TRIGGER "UtilityIngestionAttempt_scope_guard"
BEFORE INSERT OR UPDATE OF "societyId","integrationId" ON "UtilityIngestionAttempt"
FOR EACH ROW EXECUTE FUNCTION "validate_utility_integration_scope"();

CREATE OR REPLACE FUNCTION "prevent_utility_ingestion_evidence_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Utility ingestion evidence is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UtilityIngestionReceipt_append_only"
BEFORE UPDATE OR DELETE ON "UtilityIngestionReceipt"
FOR EACH ROW EXECUTE FUNCTION "prevent_utility_ingestion_evidence_mutation"();

CREATE TRIGGER "UtilityIngestionAttempt_append_only"
BEFORE UPDATE OR DELETE ON "UtilityIngestionAttempt"
FOR EACH ROW EXECUTE FUNCTION "prevent_utility_ingestion_evidence_mutation"();
