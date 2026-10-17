-- V5.4.3: additive commercial-only plan and DRAFT grant persistence.
-- No write to Society, SocietyMembership, live EntitlementService or sessions.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TYPE "PartnerLicenseGrantStatus" AS ENUM ('DRAFT','GRANTED','REVOKED');
CREATE TYPE "PartnerLicenseEventType" AS ENUM ('DRAFT_CREATED','GRANTED','REVOKED');

CREATE TABLE "PartnerLicensePlanRevision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "featureAllowlist" JSONB NOT NULL,
  "maximumSocieties" INTEGER NOT NULL,
  "maximumDomains" INTEGER NOT NULL DEFAULT 0,
  "maximumDistributions" INTEGER NOT NULL DEFAULT 0,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerLicensePlanRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerLicensePlanRevision_code_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{2,39}$'),
  CONSTRAINT "PartnerLicensePlanRevision_version_check" CHECK ("version" > 0),
  CONSTRAINT "PartnerLicensePlanRevision_features_check" CHECK
    (jsonb_typeof("featureAllowlist") = 'array' AND jsonb_array_length("featureAllowlist") <= 16),
  CONSTRAINT "PartnerLicensePlanRevision_capacity_check" CHECK
    ("maximumSocieties" >= 0 AND "maximumDomains" >= 0 AND "maximumDistributions" >= 0),
  CONSTRAINT "PartnerLicensePlanRevision_createdById_fkey" FOREIGN KEY ("createdById")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PartnerLicensePlanRevision_code_version_key"
  ON "PartnerLicensePlanRevision"("code","version");

CREATE TABLE "PartnerLicenseGrant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "partnerId" UUID NOT NULL,
  "planRevisionId" UUID NOT NULL,
  "status" "PartnerLicenseGrantStatus" NOT NULL DEFAULT 'DRAFT',
  "startsAt" TIMESTAMPTZ(6) NOT NULL,
  "endsAt" TIMESTAMPTZ(6) NOT NULL,
  "graceUntil" TIMESTAMPTZ(6),
  "idempotencyKey" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerLicenseGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerLicenseGrant_period_check" CHECK ("endsAt" > "startsAt"
    AND ("graceUntil" IS NULL OR "graceUntil" >= "endsAt")),
  CONSTRAINT "PartnerLicenseGrant_version_check" CHECK ("version" > 0),
  -- Non-DRAFT grants are disabled at the DB layer until V5.4.5 audited activation.
  CONSTRAINT "PartnerLicenseGrant_draft_only_check" CHECK ("status" = 'DRAFT'),
  CONSTRAINT "PartnerLicenseGrant_partnerId_fkey" FOREIGN KEY ("partnerId")
    REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PartnerLicenseGrant_planRevisionId_fkey" FOREIGN KEY ("planRevisionId")
    REFERENCES "PartnerLicensePlanRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PartnerLicenseGrant_createdById_fkey" FOREIGN KEY ("createdById")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PartnerLicenseGrant_partnerId_idempotencyKey_key"
  ON "PartnerLicenseGrant"("partnerId","idempotencyKey");
CREATE INDEX "PartnerLicenseGrant_partnerId_status_endsAt_idx"
  ON "PartnerLicenseGrant"("partnerId","status","endsAt");

CREATE TABLE "PartnerLicenseEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "grantId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "type" "PartnerLicenseEventType" NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "detail" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerLicenseEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerLicenseEvent_detail_check" CHECK (jsonb_typeof("detail") = 'object'),
  CONSTRAINT "PartnerLicenseEvent_grantId_fkey" FOREIGN KEY ("grantId")
    REFERENCES "PartnerLicenseGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PartnerLicenseEvent_actorId_fkey" FOREIGN KEY ("actorId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PartnerLicenseEvent_grantId_idempotencyKey_key"
  ON "PartnerLicenseEvent"("grantId","idempotencyKey");
CREATE INDEX "PartnerLicenseEvent_grantId_occurredAt_idx"
  ON "PartnerLicenseEvent"("grantId","occurredAt");

-- Revisions and event history are append-only; a historical plan must never
-- change after a partner references it. No deletion through ordinary Prisma.
CREATE FUNCTION aaraagate_partner_license_append_only() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Commercial license revisions and audit events are immutable' USING ERRCODE='55000';
END $$;
CREATE TRIGGER "PartnerLicensePlanRevision_immutable"
  BEFORE UPDATE OR DELETE ON "PartnerLicensePlanRevision"
  FOR EACH ROW EXECUTE FUNCTION aaraagate_partner_license_append_only();
CREATE TRIGGER "PartnerLicenseEvent_immutable"
  BEFORE UPDATE OR DELETE ON "PartnerLicenseEvent"
  FOR EACH ROW EXECUTE FUNCTION aaraagate_partner_license_append_only();

COMMIT;
