ALTER TABLE "SocietyDocument"
  ADD COLUMN "supersedesDocumentId" UUID,
  ADD COLUMN "supersededByDocumentId" UUID;

ALTER TABLE "SocietyDocument"
  ADD CONSTRAINT "SocietyDocument_supersedesDocumentId_fkey"
  FOREIGN KEY ("supersedesDocumentId") REFERENCES "SocietyDocument"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "SocietyDocument_supersededByDocumentId_fkey"
  FOREIGN KEY ("supersededByDocumentId") REFERENCES "SocietyDocument"("id") ON DELETE RESTRICT;

CREATE UNIQUE INDEX "SocietyDocument_supersedes_unique"
  ON "SocietyDocument"("supersedesDocumentId")
  WHERE "supersedesDocumentId" IS NOT NULL;

CREATE UNIQUE INDEX "SocietyDocument_supersededBy_unique"
  ON "SocietyDocument"("supersededByDocumentId")
  WHERE "supersededByDocumentId" IS NOT NULL;

CREATE INDEX "SocietyDocument_society_supersedes_idx"
  ON "SocietyDocument"("societyId","supersedesDocumentId");

CREATE INDEX "SocietyDocument_society_supersededBy_idx"
  ON "SocietyDocument"("societyId","supersededByDocumentId");

ALTER TABLE "SocietyDocument"
  ADD CONSTRAINT "SocietyDocument_no_self_supersession_check"
  CHECK ("supersedesDocumentId" IS NULL OR "supersedesDocumentId" <> "id"),
  ADD CONSTRAINT "SocietyDocument_no_self_supersededBy_check"
  CHECK ("supersededByDocumentId" IS NULL OR "supersededByDocumentId" <> "id");
