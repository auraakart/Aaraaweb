-- V5.3.1: presentation-only society branding; no existing society changes or backfill.
CREATE TABLE "SocietyBrandRevision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "config" JSONB NOT NULL,
  "digest" TEXT NOT NULL,
  "publishedAt" TIMESTAMPTZ(6),
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyBrandRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyBrandRevision_version_positive" CHECK ("version" > 0),
  CONSTRAINT "SocietyBrandRevision_schema_supported" CHECK ("schemaVersion" = 1),
  CONSTRAINT "SocietyBrandRevision_digest_sha256" CHECK ("digest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "SocietyBrandRevision_config_object" CHECK (jsonb_typeof("config") = 'object'),
  CONSTRAINT "SocietyBrandRevision_societyId_fkey" FOREIGN KEY ("societyId")
    REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocietyBrandRevision_createdById_fkey" FOREIGN KEY ("createdById")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SocietyBrandRevision_societyId_version_key"
  ON "SocietyBrandRevision"("societyId","version");
CREATE INDEX "SocietyBrandRevision_societyId_publishedAt_version_idx"
  ON "SocietyBrandRevision"("societyId","publishedAt" DESC,"version" DESC);

-- Only a draft-to-published timestamp transition is mutable. A published
-- config can never be modified or silently unpublished; rollback is a new revision.
CREATE FUNCTION "prevent_society_brand_revision_rewrite"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."societyId" IS DISTINCT FROM OLD."societyId"
    OR NEW."version" IS DISTINCT FROM OLD."version"
    OR NEW."schemaVersion" IS DISTINCT FROM OLD."schemaVersion"
    OR NEW."config" IS DISTINCT FROM OLD."config"
    OR NEW."digest" IS DISTINCT FROM OLD."digest"
    OR NEW."createdById" IS DISTINCT FROM OLD."createdById"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    OR (OLD."publishedAt" IS NOT NULL AND NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt")
  THEN
    RAISE EXCEPTION 'Society brand revisions are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "SocietyBrandRevision_immutable"
BEFORE UPDATE ON "SocietyBrandRevision"
FOR EACH ROW EXECUTE FUNCTION "prevent_society_brand_revision_rewrite"();
