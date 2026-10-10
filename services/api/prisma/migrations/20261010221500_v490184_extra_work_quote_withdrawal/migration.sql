-- V4.90.18.4: allow provider cancellation of pending extra-work quotes only.
-- Financial terms stay immutable; original check/trigger guards all economic edits.
ALTER TABLE "ConsumerServiceExtraWorkQuote"
  DROP CONSTRAINT "ConsumerServiceExtraWorkQuote_status_check";
ALTER TABLE "ConsumerServiceExtraWorkQuote"
  ADD CONSTRAINT "ConsumerServiceExtraWorkQuote_status_check"
  CHECK ("status" IN ('PENDING','APPROVED','DECLINED','WITHDRAWN'));
ALTER TABLE "ConsumerServiceExtraWorkQuote"
  DROP CONSTRAINT "ConsumerServiceExtraWorkQuote_response_check";
ALTER TABLE "ConsumerServiceExtraWorkQuote"
  ADD CONSTRAINT "ConsumerServiceExtraWorkQuote_response_check" CHECK (
    ("status"='PENDING' AND "respondedByUserId" IS NULL AND "respondedAt" IS NULL AND "responseReason" IS NULL)
    OR ("status"='APPROVED' AND "respondedByUserId" IS NOT NULL AND "respondedAt" IS NOT NULL AND "responseReason" IS NULL)
    OR ("status" IN ('DECLINED','WITHDRAWN') AND "respondedByUserId" IS NOT NULL
        AND "respondedAt" IS NOT NULL AND length(btrim("responseReason")) BETWEEN 3 AND 500)
  );
