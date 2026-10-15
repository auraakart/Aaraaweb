-- Aaraagate V4.26.2 society-scoped integration selection.
-- Secrets remain deployment configuration. This table stores only enablement
-- and provider identity selected for a society.

CREATE TABLE "SocietyIntegrationConfiguration" (
  "societyId" UUID NOT NULL,
  "family" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyIntegrationConfiguration_pkey" PRIMARY KEY ("societyId","family"),
  CONSTRAINT "SocietyIntegrationConfiguration_family_valid" CHECK ("family" IN ('OTP','WHATSAPP','PUSH','PAYMENT_GATEWAY','ACCESS_CONTROL','OBJECT_STORAGE','SMART_METER','ACCOUNTING_CONNECTOR')),
  CONSTRAINT "SocietyIntegrationConfiguration_provider_key_valid" CHECK (length(btrim("providerKey")) BETWEEN 1 AND 80)
);

ALTER TABLE "SocietyIntegrationConfiguration"
  ADD CONSTRAINT "SocietyIntegrationConfiguration_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocietyIntegrationConfiguration"
  ADD CONSTRAINT "SocietyIntegrationConfiguration_updated_by_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SocietyIntegrationConfigurationEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "family" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL,
  "actorUserId" UUID NOT NULL,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyIntegrationConfigurationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyIntegrationConfigurationEvent_family_valid" CHECK ("family" IN ('OTP','WHATSAPP','PUSH','PAYMENT_GATEWAY','ACCESS_CONTROL','OBJECT_STORAGE','SMART_METER','ACCOUNTING_CONNECTOR')),
  CONSTRAINT "SocietyIntegrationConfigurationEvent_type_valid" CHECK ("eventType" IN ('CONFIGURED','PROVIDER_CHANGED','ENABLED','DISABLED'))
);

CREATE INDEX "SocietyIntegrationConfigurationEvent_society_family_time_idx"
  ON "SocietyIntegrationConfigurationEvent" ("societyId","family","occurredAt" DESC);

ALTER TABLE "SocietyIntegrationConfigurationEvent"
  ADD CONSTRAINT "SocietyIntegrationConfigurationEvent_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocietyIntegrationConfigurationEvent"
  ADD CONSTRAINT "SocietyIntegrationConfigurationEvent_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
