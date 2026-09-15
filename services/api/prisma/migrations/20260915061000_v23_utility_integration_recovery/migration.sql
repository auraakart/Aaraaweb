-- V2.3 utility integration lifecycle and quarantine recovery.
-- Lifecycle and resolution evidence is append-only; original ingestion receipts remain immutable.

ALTER TABLE "UtilityIntegrationMeterMap"
  ADD COLUMN "retiredByUserId" UUID REFERENCES "User"("id") ON DELETE RESTRICT,
  ADD COLUMN "retiredAt" TIMESTAMPTZ,
  ADD COLUMN "replacesMappingId" UUID REFERENCES "UtilityIntegrationMeterMap"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "UtilityIntegrationMeterMap_retirement_check" CHECK (
    ("active"=TRUE AND "retiredAt" IS NULL AND "retiredByUserId" IS NULL) OR
    ("active"=FALSE AND "retiredAt" IS NOT NULL AND "retiredByUserId" IS NOT NULL)
  );

DROP INDEX "UtilityIntegrationMeterMap_external_key";
CREATE UNIQUE INDEX "UtilityIntegrationMeterMap_active_external_key"
  ON "UtilityIntegrationMeterMap"("integrationId", "externalMeterId")
  WHERE "active"=TRUE;
CREATE INDEX "UtilityIntegrationMeterMap_integration_history_idx"
  ON "UtilityIntegrationMeterMap"("integrationId", "externalMeterId", "createdAt" DESC);

CREATE TABLE "UtilityIntegrationEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "integrationId" UUID NOT NULL REFERENCES "UtilityIntegration"("id") ON DELETE RESTRICT,
  "actorUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "action" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UtilityIntegrationEvent_action_check" CHECK (
    "action" IN ('CREATED','KEY_ROTATED','REVOKED','MAPPING_CREATED','MAPPING_RETIRED','MAPPING_REPLACED')
  )
);

CREATE INDEX "UtilityIntegrationEvent_integration_time_idx"
  ON "UtilityIntegrationEvent"("integrationId", "occurredAt" DESC);

INSERT INTO "UtilityIntegrationEvent" ("societyId","integrationId","actorUserId","action","metadata","occurredAt")
SELECT "societyId","id","createdByUserId",'CREATED',jsonb_build_object('code',"code"),"createdAt"
FROM "UtilityIntegration";

INSERT INTO "UtilityIntegrationEvent" ("societyId","integrationId","actorUserId","action","metadata","occurredAt")
SELECT "societyId","id","revokedByUserId",'REVOKED','{}'::jsonb,"revokedAt"
FROM "UtilityIntegration"
WHERE "status"='REVOKED';

INSERT INTO "UtilityIntegrationEvent" ("societyId","integrationId","actorUserId","action","metadata","occurredAt")
SELECT "societyId","integrationId","createdByUserId",'MAPPING_CREATED',
  jsonb_build_object('mappingId',"id",'externalMeterId',"externalMeterId",'meterId',"meterId"),"createdAt"
FROM "UtilityIntegrationMeterMap";

CREATE TABLE "UtilityIngestionResolution" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "receiptId" UUID NOT NULL REFERENCES "UtilityIngestionReceipt"("id") ON DELETE RESTRICT,
  "operationId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "actorUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "replacementReceiptId" UUID REFERENCES "UtilityIngestionReceipt"("id") ON DELETE RESTRICT,
  "note" TEXT,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UtilityIngestionResolution_action_check" CHECK (
    "action" IN ('DISMISSED','REPROCESS_REQUESTED','REPROCESS_ACCEPTED','REPROCESS_QUARANTINED','REPROCESS_FAILED')
  ),
  CONSTRAINT "UtilityIngestionResolution_note_check" CHECK ("note" IS NULL OR length("note") <= 300),
  CONSTRAINT "UtilityIngestionResolution_replacement_check" CHECK (
    ("action" IN ('REPROCESS_ACCEPTED','REPROCESS_QUARANTINED') AND "replacementReceiptId" IS NOT NULL) OR
    ("action" NOT IN ('REPROCESS_ACCEPTED','REPROCESS_QUARANTINED') AND "replacementReceiptId" IS NULL)
  )
);

CREATE INDEX "UtilityIngestionResolution_receipt_time_idx"
  ON "UtilityIngestionResolution"("receiptId", "occurredAt" DESC);
CREATE UNIQUE INDEX "UtilityIngestionResolution_operation_action_key"
  ON "UtilityIngestionResolution"("operationId", "action");

CREATE OR REPLACE FUNCTION "validate_utility_integration_recovery_scope"() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME='UtilityIntegrationEvent' AND NOT EXISTS (
    SELECT 1 FROM "UtilityIntegration" i
    WHERE i."id"=NEW."integrationId" AND i."societyId"=NEW."societyId"
  ) THEN
    RAISE EXCEPTION 'Utility integration event must belong to the same society';
  END IF;
  IF TG_TABLE_NAME='UtilityIngestionResolution' AND NOT EXISTS (
    SELECT 1 FROM "UtilityIngestionReceipt" r
    WHERE r."id"=NEW."receiptId" AND r."societyId"=NEW."societyId" AND r."status"='QUARANTINED'
  ) THEN
    RAISE EXCEPTION 'Resolution must reference a quarantined receipt in the same society';
  END IF;
  IF TG_TABLE_NAME='UtilityIngestionResolution' AND NEW."replacementReceiptId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "UtilityIngestionReceipt" r
    WHERE r."id"=NEW."replacementReceiptId" AND r."societyId"=NEW."societyId"
  ) THEN
    RAISE EXCEPTION 'Replacement receipt must belong to the same society';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UtilityIntegrationEvent_scope_guard"
BEFORE INSERT OR UPDATE OF "societyId","integrationId" ON "UtilityIntegrationEvent"
FOR EACH ROW EXECUTE FUNCTION "validate_utility_integration_recovery_scope"();

CREATE TRIGGER "UtilityIngestionResolution_scope_guard"
BEFORE INSERT OR UPDATE OF "societyId","receiptId","replacementReceiptId" ON "UtilityIngestionResolution"
FOR EACH ROW EXECUTE FUNCTION "validate_utility_integration_recovery_scope"();

CREATE TRIGGER "UtilityIntegrationEvent_append_only"
BEFORE UPDATE OR DELETE ON "UtilityIntegrationEvent"
FOR EACH ROW EXECUTE FUNCTION "prevent_utility_ingestion_evidence_mutation"();

CREATE TRIGGER "UtilityIngestionResolution_append_only"
BEFORE UPDATE OR DELETE ON "UtilityIngestionResolution"
FOR EACH ROW EXECUTE FUNCTION "prevent_utility_ingestion_evidence_mutation"();
