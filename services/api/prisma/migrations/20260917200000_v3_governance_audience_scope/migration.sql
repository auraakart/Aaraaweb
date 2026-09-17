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

CREATE TABLE "GovernanceAudienceAudit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "resourceType" VARCHAR(24) NOT NULL,
  "resourceId" UUID NOT NULL,
  "fromScope" VARCHAR(24) NOT NULL,
  "toScope" VARCHAR(24) NOT NULL,
  "actorUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceAudienceAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceAudienceAudit_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceAudienceAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceAudienceAudit_resource_type_check" CHECK ("resourceType" IN ('MEETING','DOCUMENT','POLL')),
  CONSTRAINT "GovernanceAudienceAudit_scope_check" CHECK ("fromScope" IN ('COMMUNITY','OWNER_ONLY') AND "toScope" IN ('COMMUNITY','OWNER_ONLY'))
);
CREATE INDEX "GovernanceAudienceAudit_society_resource_idx"
  ON "GovernanceAudienceAudit"("societyId","resourceType","resourceId","createdAt" DESC);
