-- V5.3.12: private society-logo intake only. No published brand revision references assets.
CREATE TABLE "SocietyBrandLogoAsset" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "contentLengthBytes" INTEGER NOT NULL,
  "uploadExpiresAt" TIMESTAMPTZ(6) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "sha256" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verifiedAt" TIMESTAMPTZ(6),
  CONSTRAINT "SocietyBrandLogoAsset_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyBrandLogoAsset_size" CHECK ("contentLengthBytes" BETWEEN 57 AND 524288),
  CONSTRAINT "SocietyBrandLogoAsset_type" CHECK ("contentType" = 'image/png'),
  CONSTRAINT "SocietyBrandLogoAsset_status" CHECK ("status" IN ('PENDING','VERIFIED','REJECTED')),
  CONSTRAINT "SocietyBrandLogoAsset_digest" CHECK ("sha256" IS NULL OR "sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "SocietyBrandLogoAsset_verified" CHECK (
    ("status" = 'VERIFIED' AND "verifiedAt" IS NOT NULL AND "sha256" IS NOT NULL)
    OR ("status" <> 'VERIFIED' AND "verifiedAt" IS NULL AND "sha256" IS NULL)
  ),
  CONSTRAINT "SocietyBrandLogoAsset_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocietyBrandLogoAsset_creator_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SocietyBrandLogoAsset_storageKey_key" ON "SocietyBrandLogoAsset"("storageKey");
CREATE INDEX "SocietyBrandLogoAsset_societyId_status_idx" ON "SocietyBrandLogoAsset"("societyId","status");

CREATE FUNCTION "prevent_society_brand_logo_rewrite"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."societyId" IS DISTINCT FROM OLD."societyId"
    OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
    OR NEW."storageKey" IS DISTINCT FROM OLD."storageKey"
    OR NEW."contentType" IS DISTINCT FROM OLD."contentType"
    OR NEW."contentLengthBytes" IS DISTINCT FROM OLD."contentLengthBytes"
    OR NEW."uploadExpiresAt" IS DISTINCT FROM OLD."uploadExpiresAt"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR OLD."status" <> 'PENDING'
    OR NEW."status" NOT IN ('VERIFIED','REJECTED')
 THEN
   RAISE EXCEPTION 'Society brand logo assets are immutable after verification';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "SocietyBrandLogoAsset_guard"
BEFORE UPDATE ON "SocietyBrandLogoAsset"
FOR EACH ROW EXECUTE FUNCTION "prevent_society_brand_logo_rewrite"();
