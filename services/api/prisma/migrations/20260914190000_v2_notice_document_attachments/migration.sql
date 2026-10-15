CREATE TABLE "NoticeDocumentAttachment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "noticeId" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "attachedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NoticeDocumentAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NoticeDocumentAttachment_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "NoticeDocumentAttachment_notice_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE CASCADE,
  CONSTRAINT "NoticeDocumentAttachment_document_fkey" FOREIGN KEY ("documentId") REFERENCES "SocietyDocument"("id") ON DELETE RESTRICT,
  CONSTRAINT "NoticeDocumentAttachment_actor_fkey" FOREIGN KEY ("attachedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "NoticeDocumentAttachment_notice_document_key" UNIQUE ("noticeId","documentId")
);

CREATE INDEX "NoticeDocumentAttachment_society_notice_idx" ON "NoticeDocumentAttachment"("societyId","noticeId","createdAt");

CREATE OR REPLACE FUNCTION validate_notice_document_attachment()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Notice" n
    WHERE n."id"=NEW."noticeId" AND n."societyId"=NEW."societyId" AND n."status"='DRAFT'
  ) THEN
    RAISE EXCEPTION 'Attachments can only be changed on a draft notice in the current society';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "SocietyDocument" d
    WHERE d."id"=NEW."documentId" AND d."societyId"=NEW."societyId"
      AND d."status"='PUBLISHED' AND d."audience"='ALL_MEMBERS'
  ) THEN
    RAISE EXCEPTION 'Notice attachments must be published all-member documents in the current society';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NoticeDocumentAttachment_scope_guard"
BEFORE INSERT OR UPDATE ON "NoticeDocumentAttachment"
FOR EACH ROW EXECUTE FUNCTION validate_notice_document_attachment();

ALTER TABLE "NoticeEvent" DROP CONSTRAINT "NoticeEvent_action_check";
ALTER TABLE "NoticeEvent"
  ADD CONSTRAINT "NoticeEvent_action_check"
  CHECK ("action" IN ('CREATED','PUBLISHED','ARCHIVED','READ','ACKNOWLEDGED','TARGET_UPDATED','ATTACHMENT_ADDED','ATTACHMENT_REMOVED'));
