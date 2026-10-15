ALTER TABLE "PrivacyRequestCase"
  ADD COLUMN "retentionDecision" VARCHAR(16),
  ADD COLUMN "retentionDecisionReason" VARCHAR(1000),
  ADD COLUMN "retentionReviewedAt" TIMESTAMP(3),
  ADD COLUMN "retentionReviewedByUserId" UUID;

ALTER TABLE "PrivacyRequestCase"
  ADD CONSTRAINT "PrivacyRequestCase_retentionDecision_check"
    CHECK ("retentionDecision" IS NULL OR "retentionDecision" IN ('ALLOW','BLOCK')),
  ADD CONSTRAINT "PrivacyRequestCase_retentionReview_complete_check"
    CHECK (
      ("retentionDecision" IS NULL
        AND "retentionDecisionReason" IS NULL
        AND "retentionReviewedAt" IS NULL
        AND "retentionReviewedByUserId" IS NULL)
      OR
      ("retentionDecision" IS NOT NULL
        AND "retentionDecisionReason" IS NOT NULL
        AND "retentionReviewedAt" IS NOT NULL
        AND "retentionReviewedByUserId" IS NOT NULL)
    ),
  ADD CONSTRAINT "PrivacyRequestCase_retentionReviewedByUserId_fkey"
    FOREIGN KEY ("retentionReviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "PrivacyRequestCase_society_retention_status_idx"
  ON "PrivacyRequestCase"("societyId", "retentionDecision", "status");
