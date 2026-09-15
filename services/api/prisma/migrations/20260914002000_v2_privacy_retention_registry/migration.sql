CREATE TABLE "PrivacyDataCategory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "purpose" VARCHAR(1000) NOT NULL,
  "legalBasis" VARCHAR(500),
  "retentionTrigger" VARCHAR(500) NOT NULL,
  "retentionDays" INTEGER,
  "containsSensitiveData" BOOLEAN NOT NULL DEFAULT false,
  "containsMinorData" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyDataCategory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivacyDataCategory_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyDataCategory_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyDataCategory_retentionDays_check" CHECK ("retentionDays" IS NULL OR "retentionDays" >= 0),
  CONSTRAINT "PrivacyDataCategory_society_code_key" UNIQUE ("societyId", "code")
);

CREATE INDEX "PrivacyDataCategory_society_active_idx" ON "PrivacyDataCategory"("societyId", "active", "name");

CREATE TABLE "PrivacyProcessorRegister" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL,
  "purpose" VARCHAR(1000) NOT NULL,
  "dataCategoryCodes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "processingLocation" VARCHAR(240),
  "contactReference" VARCHAR(500),
  "agreementReference" VARCHAR(500),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyProcessorRegister_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivacyProcessorRegister_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyProcessorRegister_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PrivacyProcessorRegister_society_active_idx" ON "PrivacyProcessorRegister"("societyId", "active", "name");

CREATE TABLE "PrivacyRegistryEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "entityType" VARCHAR(32) NOT NULL,
  "entityId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "action" VARCHAR(64) NOT NULL,
  "summary" VARCHAR(1000) NOT NULL,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyRegistryEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivacyRegistryEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyRegistryEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyRegistryEvent_entityType_check" CHECK ("entityType" IN ('DATA_CATEGORY','PROCESSOR'))
);

CREATE INDEX "PrivacyRegistryEvent_society_entity_idx" ON "PrivacyRegistryEvent"("societyId", "entityType", "entityId", "createdAt");

CREATE OR REPLACE FUNCTION prevent_privacy_registry_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Privacy registry events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PrivacyRegistryEvent_append_only_update" BEFORE UPDATE ON "PrivacyRegistryEvent" FOR EACH ROW EXECUTE FUNCTION prevent_privacy_registry_event_mutation();
CREATE TRIGGER "PrivacyRegistryEvent_append_only_delete" BEFORE DELETE ON "PrivacyRegistryEvent" FOR EACH ROW EXECUTE FUNCTION prevent_privacy_registry_event_mutation();
