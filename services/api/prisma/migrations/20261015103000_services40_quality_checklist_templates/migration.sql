-- Services 4.0.1: provider-owned quality checklist definitions and append-only revisions.
-- No changes to booking completion, billing, warranty or Services 3.1 closure.
CREATE TABLE "ServiceOfferingQualityChecklist" (
  "offeringId" UUID PRIMARY KEY REFERENCES "ServiceOffering"("id") ON DELETE RESTRICT,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "items" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "updatedByUserId" UUID REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceOfferingQualityChecklist_items_check"
    CHECK (jsonb_typeof("items") = 'array' AND jsonb_array_length("items") <= 20)
);

CREATE TABLE "ServiceOfferingQualityChecklistRevision" (
  "id" UUID PRIMARY KEY,
  "offeringId" UUID NOT NULL REFERENCES "ServiceOfferingQualityChecklist"("offeringId") ON DELETE RESTRICT,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "items" JSONB NOT NULL,
  "actorUserId" UUID REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceOfferingQualityChecklistRevision_unique_version" UNIQUE ("offeringId", "version"),
  CONSTRAINT "ServiceOfferingQualityChecklistRevision_items_check"
    CHECK (jsonb_typeof("items") = 'array' AND jsonb_array_length("items") <= 20)
);

CREATE INDEX "ServiceOfferingQualityChecklistRevision_latest_idx"
  ON "ServiceOfferingQualityChecklistRevision" ("offeringId", "createdAt" DESC);
