ALTER TABLE "GovernanceMeeting"
  ADD COLUMN "audienceScope" VARCHAR(24) NOT NULL DEFAULT 'COMMUNITY';
ALTER TABLE "GovernanceMeeting"
  ADD CONSTRAINT "GovernanceMeeting_audience_scope_check"
  CHECK ("audienceScope" IN ('COMMUNITY','OWNER_ONLY'));
CREATE INDEX "GovernanceMeeting_society_audience_idx"
  ON "GovernanceMeeting"("societyId","audienceScope","scheduledAt" DESC);

ALTER TABLE "GovernanceDocumentReference"
  ADD COLUMN "audienceScope" VARCHAR(24) NOT NULL DEFAULT 'COMMUNITY';
ALTER TABLE "GovernanceDocumentReference"
  ADD CONSTRAINT "GovernanceDocumentReference_audience_scope_check"
  CHECK ("audienceScope" IN ('COMMUNITY','OWNER_ONLY'));
CREATE INDEX "GovernanceDocumentReference_society_audience_idx"
  ON "GovernanceDocumentReference"("societyId","audienceScope","createdAt" DESC);

ALTER TABLE "GovernancePoll"
  ADD COLUMN "audienceScope" VARCHAR(24) NOT NULL DEFAULT 'COMMUNITY';
ALTER TABLE "GovernancePoll"
  ADD CONSTRAINT "GovernancePoll_audience_scope_check"
  CHECK ("audienceScope" IN ('COMMUNITY','OWNER_ONLY'));
CREATE INDEX "GovernancePoll_society_audience_idx"
  ON "GovernancePoll"("societyId","audienceScope","status","createdAt" DESC);
