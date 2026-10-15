CREATE TABLE "NoticeDispatch" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "noticeId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ,
  "lastAttemptAt" TIMESTAMPTZ,
  "dispatchedAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NoticeDispatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NoticeDispatch_status_check" CHECK ("status" IN ('PENDING','IN_FLIGHT','DISPATCHED')),
  CONSTRAINT "NoticeDispatch_attempt_count_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "NoticeDispatch_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "NoticeDispatch_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE CASCADE,
  CONSTRAINT "NoticeDispatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "NoticeDispatch_notice_user_key" UNIQUE ("noticeId", "userId")
);

CREATE INDEX "NoticeDispatch_due_idx"
  ON "NoticeDispatch"("status", "nextAttemptAt", "createdAt");

CREATE INDEX "NoticeDispatch_society_notice_idx"
  ON "NoticeDispatch"("societyId", "noticeId");

CREATE OR REPLACE FUNCTION validate_notice_dispatch_recipient()
RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "NoticeRecipient" nr
    WHERE nr."societyId" = NEW."societyId"
      AND nr."noticeId" = NEW."noticeId"
      AND nr."userId" = NEW."userId"
  ) THEN
    RAISE EXCEPTION 'NoticeDispatch recipient must match the notice recipient snapshot';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "NoticeDispatch_recipient_guard"
BEFORE INSERT OR UPDATE OF "societyId", "noticeId", "userId" ON "NoticeDispatch"
FOR EACH ROW EXECUTE FUNCTION validate_notice_dispatch_recipient();
