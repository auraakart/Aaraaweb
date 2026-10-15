-- V5.1 additive commercial ownership. No operational authorization changes.
-- The constant default preserves old-server society creation compatibility.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
DO $$ BEGIN
  CREATE TYPE "PartnerStatus" AS ENUM ('DRAFT','ACTIVE','RESTRICTED','TERMINATED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "PartnerRole" AS ENUM ('OWNER','BRAND_MANAGER','COMMERCIAL_ADMIN','SUPPORT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Partner" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "slug" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "status" "PartnerStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Partner_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Partner_slug_format_check" CHECK ("slug" ~ '^[a-z][a-z0-9-]{1,62}$'),
  CONSTRAINT "Partner_builtin_identity_check" CHECK (
    "id" <> '00000000-0000-4000-8000-000000000001'::uuid OR
    ("slug" = 'aaraagate' AND "status" = 'ACTIVE')
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS "Partner_slug_key" ON "Partner"("slug");
INSERT INTO "Partner" ("id","slug","displayName","status")
VALUES ('00000000-0000-4000-8000-000000000001','aaraagate','Aaraagate','ACTIVE')
ON CONFLICT ("id") DO NOTHING;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Partner" WHERE "id"='00000000-0000-4000-8000-000000000001' AND "slug"='aaraagate' AND "status"='ACTIVE') THEN
    RAISE EXCEPTION 'Built-in partner identity conflicts with the compatibility default';
  END IF;
END $$;

-- Preserve the default owner even in an empty installation.
CREATE OR REPLACE FUNCTION aaraagate_preserve_builtin_partner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."id" = '00000000-0000-4000-8000-000000000001'::uuid
    AND (TG_OP = 'DELETE' OR NEW."id" IS DISTINCT FROM OLD."id") THEN
    RAISE EXCEPTION 'The built-in Aaraagate partner cannot be deleted or reidentified' USING ERRCODE='55000';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS "Partner_preserve_builtin" ON "Partner";
CREATE TRIGGER "Partner_preserve_builtin" BEFORE UPDATE OR DELETE ON "Partner"
FOR EACH ROW EXECUTE FUNCTION aaraagate_preserve_builtin_partner();

CREATE TABLE IF NOT EXISTS "PartnerMembership" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "partnerId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "PartnerRole" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerMembership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerMembership_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PartnerMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerMembership_partnerId_userId_role_key" ON "PartnerMembership"("partnerId","userId","role");
CREATE INDEX IF NOT EXISTS "PartnerMembership_partnerId_userId_active_idx" ON "PartnerMembership"("partnerId","userId","active");

-- Serialize the cutover against concurrent society provisioning/feature edits.
LOCK TABLE "Society" IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE "Society" ADD COLUMN IF NOT EXISTS "partnerId" UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE "Society" ADD COLUMN IF NOT EXISTS "ownershipVersion" INTEGER NOT NULL DEFAULT 1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"Society"'::regclass AND conname='Society_partnerId_fkey') THEN
    ALTER TABLE "Society" ADD CONSTRAINT "Society_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"Society"'::regclass AND conname='Society_ownershipVersion_check') THEN
    ALTER TABLE "Society" ADD CONSTRAINT "Society_ownershipVersion_check" CHECK ("ownershipVersion" >= 1);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "Society_partnerId_status_idx" ON "Society"("partnerId","status");

CREATE TABLE IF NOT EXISTS "SocietyEntitlementCompatibility" (
  "societyId" UUID NOT NULL,
  "sourceProductTier" "ProductTier" NOT NULL,
  "sourceOverrides" JSONB NOT NULL,
  "enabledFeatures" JSONB NOT NULL,
  "sourceMigration" TEXT NOT NULL,
  "capturedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyEntitlementCompatibility_pkey" PRIMARY KEY ("societyId"),
  CONSTRAINT "SocietyEntitlementCompatibility_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocietyEntitlementCompatibility_features_array_check" CHECK (jsonb_typeof("enabledFeatures") = 'array')
);
-- SQL below freezes the exact pre-V5 feature catalogue/tier mapping at cutover.
WITH catalogue(feature, ordinal, tiers) AS (VALUES
  ('VISITOR_MANAGEMENT',0,ARRAY['STARTER','PROFESSIONAL','PREMIUM','ENTERPRISE']::text[]),
  ('DELIVERY_MANAGEMENT',1,ARRAY['PROFESSIONAL','PREMIUM','ENTERPRISE']::text[]),
  ('DOMESTIC_HELP',2,ARRAY['PROFESSIONAL','PREMIUM','ENTERPRISE']::text[]),
  ('NOTICES',3,ARRAY['STARTER','PROFESSIONAL','PREMIUM','ENTERPRISE']::text[]),
  ('HELPDESK',4,ARRAY['PROFESSIONAL','PREMIUM','ENTERPRISE']::text[]),
  ('SOS',5,ARRAY['STARTER','PROFESSIONAL','PREMIUM','ENTERPRISE']::text[]),
  ('HOUSEHOLD_SERVICES',6,ARRAY['PROFESSIONAL','PREMIUM','ENTERPRISE']::text[]),
  ('MAINTENANCE_BILLING',7,ARRAY['PREMIUM','ENTERPRISE']::text[]),
  ('PAYMENTS',8,ARRAY['PREMIUM','ENTERPRISE']::text[]),
  ('SOCIETY_ACCOUNTING',9,ARRAY['PREMIUM','ENTERPRISE']::text[]),
  ('AMENITIES',10,ARRAY['PREMIUM','ENTERPRISE']::text[]),
  ('GOVERNANCE_POLLS',11,ARRAY['ENTERPRISE']::text[]),
  ('ADVANCED_REPORTS',12,ARRAY['PREMIUM','ENTERPRISE']::text[]),
  ('WHATSAPP_AUTOMATION',13,ARRAY['PREMIUM','ENTERPRISE']::text[]),
  ('AI_ASSISTANT',14,ARRAY['ENTERPRISE']::text[]),
  ('CUSTOM_INTEGRATIONS',15,ARRAY['ENTERPRISE']::text[])
), snapshots AS (
  SELECT s."id", COALESCE(jsonb_agg(c.feature ORDER BY c.ordinal) FILTER (WHERE
    CASE WHEN jsonb_typeof(s."featureOverrides") = 'object' AND jsonb_typeof(s."featureOverrides" -> c.feature) = 'boolean'
      THEN (s."featureOverrides" ->> c.feature)::boolean
      ELSE s."productTier"::text = ANY(c.tiers) END
  ), '[]'::jsonb) AS features
  FROM "Society" s CROSS JOIN catalogue c GROUP BY s."id"
)
INSERT INTO "SocietyEntitlementCompatibility" ("societyId","sourceProductTier","sourceOverrides","enabledFeatures","sourceMigration")
SELECT s."id",s."productTier",s."featureOverrides",snapshots.features,'20261011113000_v5_partner_ownership_compatibility'
FROM "Society" s JOIN snapshots ON snapshots."id"=s."id"
ON CONFLICT ("societyId") DO NOTHING;

CREATE OR REPLACE FUNCTION aaraagate_immutable_entitlement_compatibility() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Entitlement compatibility snapshots are immutable' USING ERRCODE='55000';
END $$;
DROP TRIGGER IF EXISTS "SocietyEntitlementCompatibility_immutable_update" ON "SocietyEntitlementCompatibility";
CREATE TRIGGER "SocietyEntitlementCompatibility_immutable_update" BEFORE UPDATE ON "SocietyEntitlementCompatibility"
FOR EACH ROW EXECUTE FUNCTION aaraagate_immutable_entitlement_compatibility();
COMMIT;
