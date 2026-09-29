CREATE TABLE "SocietyDocumentKnowledge" (
  "documentId" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "contentText" VARCHAR(12000) NOT NULL,
  "contentHash" CHAR(64) NOT NULL,
  "indexedByUserId" UUID NOT NULL,
  "indexedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyDocumentKnowledge_pkey" PRIMARY KEY ("documentId"),
  CONSTRAINT "SocietyDocumentKnowledge_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "SocietyDocumentKnowledge_document_fkey" FOREIGN KEY ("documentId") REFERENCES "SocietyDocument"("id") ON DELETE CASCADE,
  CONSTRAINT "SocietyDocumentKnowledge_indexed_by_fkey" FOREIGN KEY ("indexedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SocietyDocumentKnowledge_text_length_check" CHECK (char_length("contentText") BETWEEN 20 AND 12000),
  CONSTRAINT "SocietyDocumentKnowledge_hash_check" CHECK ("contentHash" ~ '^[0-9a-f]{64}$')
);
CREATE INDEX "SocietyDocumentKnowledge_society_indexed_idx" ON "SocietyDocumentKnowledge"("societyId","indexedAt" DESC);
CREATE OR REPLACE FUNCTION enforce_society_document_knowledge_scope() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "SocietyDocument" d
    WHERE d."id"=NEW."documentId" AND d."societyId"=NEW."societyId"
  ) THEN
    RAISE EXCEPTION 'SocietyDocumentKnowledge document must belong to the same society';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER society_document_knowledge_scope_guard
  BEFORE INSERT OR UPDATE ON "SocietyDocumentKnowledge"
  FOR EACH ROW EXECUTE FUNCTION enforce_society_document_knowledge_scope();
