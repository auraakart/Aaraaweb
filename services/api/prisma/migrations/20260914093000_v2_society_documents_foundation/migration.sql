CREATE TABLE "SocietyDocument" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "unitId" UUID,
  "category" VARCHAR(32) NOT NULL,
  "audience" VARCHAR(32) NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "description" VARCHAR(2000),
  "storageKey" VARCHAR(500) NOT NULL,
  "fileName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(120) NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  "uploadedByUserId" UUID NOT NULL,
  "publishedByUserId" UUID,
  "publishedAt" TIMESTAMPTZ,
  "archivedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyDocument_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "SocietyDocument_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE,
  CONSTRAINT "SocietyDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SocietyDocument_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SocietyDocument_category_check" CHECK ("category" IN ('BYLAW','POLICY','MEETING_MINUTES','CIRCULAR','COMPLIANCE','CONTRACT','AMC','FINANCE','PROPERTY','OTHER')),
  CONSTRAINT "SocietyDocument_audience_check" CHECK ("audience" IN ('MANAGEMENT','ALL_MEMBERS','OWNERS_ONLY','PROPERTY_OWNER_ONLY')),
  CONSTRAINT "SocietyDocument_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED','ARCHIVED')),
  CONSTRAINT "SocietyDocument_size_check" CHECK ("sizeBytes" >= 0),
  CONSTRAINT "SocietyDocument_version_check" CHECK ("version" > 0),
  CONSTRAINT "SocietyDocument_property_scope_check" CHECK (("audience" = 'PROPERTY_OWNER_ONLY' AND "unitId" IS NOT NULL) OR ("audience" <> 'PROPERTY_OWNER_ONLY' AND "unitId" IS NULL))
);

CREATE INDEX "SocietyDocument_society_status_category_idx" ON "SocietyDocument"("societyId", "status", "category", "createdAt" DESC);
CREATE INDEX "SocietyDocument_society_unit_idx" ON "SocietyDocument"("societyId", "unitId", "createdAt" DESC);

CREATE TABLE "SocietyDocumentEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "eventType" VARCHAR(24) NOT NULL,
  "fromStatus" VARCHAR(16),
  "toStatus" VARCHAR(16),
  "note" VARCHAR(1000),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyDocumentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyDocumentEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "SocietyDocumentEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SocietyDocument"("id") ON DELETE CASCADE,
  CONSTRAINT "SocietyDocumentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SocietyDocumentEvent_type_check" CHECK ("eventType" IN ('CREATED','PUBLISHED','ARCHIVED','VERSION_REPLACED')),
  CONSTRAINT "SocietyDocumentEvent_from_status_check" CHECK ("fromStatus" IS NULL OR "fromStatus" IN ('DRAFT','PUBLISHED','ARCHIVED')),
  CONSTRAINT "SocietyDocumentEvent_to_status_check" CHECK ("toStatus" IS NULL OR "toStatus" IN ('DRAFT','PUBLISHED','ARCHIVED'))
);

CREATE INDEX "SocietyDocumentEvent_document_time_idx" ON "SocietyDocumentEvent"("documentId", "createdAt" ASC);

CREATE OR REPLACE FUNCTION prevent_society_document_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SocietyDocumentEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER society_document_event_no_update BEFORE UPDATE ON "SocietyDocumentEvent" FOR EACH ROW EXECUTE FUNCTION prevent_society_document_event_mutation();
CREATE TRIGGER society_document_event_no_delete BEFORE DELETE ON "SocietyDocumentEvent" FOR EACH ROW EXECUTE FUNCTION prevent_society_document_event_mutation();
