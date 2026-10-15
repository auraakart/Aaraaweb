CREATE TABLE "GovernanceDocumentReference" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "meetingId" UUID NOT NULL,
  "resolutionId" UUID,
  "kind" VARCHAR(80) NOT NULL,
  "fileReference" VARCHAR(1000) NOT NULL,
  "note" VARCHAR(2000),
  "verifiedAt" TIMESTAMP(3),
  "verifiedByUserId" UUID,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceDocumentReference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceDocumentReference_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceDocumentReference_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "GovernanceMeeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceDocumentReference_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "GovernanceResolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceDocumentReference_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceDocumentReference_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "GovernanceDocumentReference_society_meeting_idx" ON "GovernanceDocumentReference"("societyId","meetingId","createdAt");

CREATE TABLE "GovernancePoll" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "meetingId" UUID,
  "pollType" VARCHAR(24) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  "title" VARCHAR(240) NOT NULL,
  "description" TEXT,
  "opensAt" TIMESTAMP(3),
  "closesAt" TIMESTAMP(3),
  "statutoryUseProhibited" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernancePoll_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernancePoll_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernancePoll_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "GovernanceMeeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernancePoll_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernancePoll_type_check" CHECK ("pollType" IN ('ADVISORY','SURVEY')),
  CONSTRAINT "GovernancePoll_status_check" CHECK ("status" IN ('DRAFT','OPEN','CLOSED','CANCELLED')),
  CONSTRAINT "GovernancePoll_nonstatutory_check" CHECK ("statutoryUseProhibited" = TRUE),
  CONSTRAINT "GovernancePoll_dates_check" CHECK ("closesAt" IS NULL OR "opensAt" IS NULL OR "closesAt" >= "opensAt")
);
CREATE INDEX "GovernancePoll_society_status_idx" ON "GovernancePoll"("societyId","status","createdAt" DESC);

CREATE TABLE "GovernancePollOption" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pollId" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "label" VARCHAR(500) NOT NULL,
  CONSTRAINT "GovernancePollOption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernancePollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "GovernancePoll"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GovernancePollOption_ordinal_check" CHECK ("ordinal" > 0),
  CONSTRAINT "GovernancePollOption_poll_ordinal_key" UNIQUE ("pollId","ordinal")
);
