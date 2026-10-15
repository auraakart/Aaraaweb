ALTER TABLE "PrivacyRequestCase"
  ALTER COLUMN "societyId" DROP NOT NULL,
  ADD COLUMN "requestKey" VARCHAR(100);

ALTER TABLE "PrivacyRequestCase"
  ADD CONSTRAINT "PrivacyRequestCase_request_key_not_blank"
  CHECK ("requestKey" IS NULL OR length(btrim("requestKey")) > 0);

CREATE UNIQUE INDEX "PrivacyRequestCase_subject_request_key"
  ON "PrivacyRequestCase" ("subjectUserId","requestKey")
  WHERE "requestKey" IS NOT NULL;

ALTER TABLE "PrivacyRequestEvent"
  ALTER COLUMN "societyId" DROP NOT NULL;

CREATE INDEX "PrivacyRequestEvent_case_created_idx"
  ON "PrivacyRequestEvent" ("caseId","createdAt");
