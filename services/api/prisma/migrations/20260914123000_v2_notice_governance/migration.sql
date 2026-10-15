ALTER TABLE "Notice"
  ADD COLUMN "importance" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Notice"
  ADD CONSTRAINT "Notice_importance_check"
  CHECK ("importance" IN ('NORMAL','IMPORTANT','CRITICAL'));

CREATE TABLE "NoticeRecipient" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "noticeId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "recipientType" TEXT NOT NULL,
  "readAt" TIMESTAMPTZ,
  "acknowledgedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NoticeRecipient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NoticeRecipient_type_check" CHECK ("recipientType" IN ('OWNER','OCCUPANT')),
  CONSTRAINT "NoticeRecipient_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "NoticeRecipient_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE CASCADE,
  CONSTRAINT "NoticeRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "NoticeRecipient_notice_user_key" UNIQUE ("noticeId", "userId")
);

CREATE INDEX "NoticeRecipient_society_notice_idx" ON "NoticeRecipient"("societyId", "noticeId");
CREATE INDEX "NoticeRecipient_user_notice_idx" ON "NoticeRecipient"("userId", "noticeId");
CREATE INDEX "NoticeRecipient_pending_ack_idx" ON "NoticeRecipient"("societyId", "noticeId", "acknowledgedAt");

ALTER TABLE "NoticeEvent" DROP CONSTRAINT "NoticeEvent_action_check";
ALTER TABLE "NoticeEvent"
  ADD CONSTRAINT "NoticeEvent_action_check"
  CHECK ("action" IN ('CREATED','PUBLISHED','ARCHIVED','READ','ACKNOWLEDGED'));

CREATE OR REPLACE FUNCTION prevent_notice_recipient_identity_mutation()
RETURNS trigger AS $$
BEGIN
  IF NEW."societyId" <> OLD."societyId"
     OR NEW."noticeId" <> OLD."noticeId"
     OR NEW."userId" <> OLD."userId"
     OR NEW."recipientType" <> OLD."recipientType"
     OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'NoticeRecipient identity fields are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NoticeRecipient_identity_immutable"
BEFORE UPDATE ON "NoticeRecipient"
FOR EACH ROW EXECUTE FUNCTION prevent_notice_recipient_identity_mutation();
