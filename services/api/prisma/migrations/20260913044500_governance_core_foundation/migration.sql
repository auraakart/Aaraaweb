CREATE TABLE "GovernanceCommitteeTenure" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "roleName" VARCHAR(120) NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "handoverNotes" VARCHAR(2000),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceCommitteeTenure_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceCommitteeTenure_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceCommitteeTenure_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceCommitteeTenure_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceCommitteeTenure_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
);

CREATE INDEX "GovernanceCommitteeTenure_society_dates_idx" ON "GovernanceCommitteeTenure"("societyId", "effectiveFrom", "effectiveTo");
CREATE INDEX "GovernanceCommitteeTenure_society_user_idx" ON "GovernanceCommitteeTenure"("societyId", "userId");

CREATE TABLE "GovernanceMeeting" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "meetingType" VARCHAR(32) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "title" VARCHAR(240) NOT NULL,
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "heldAt" TIMESTAMP(3),
  "location" VARCHAR(240),
  "quorumRequired" INTEGER,
  "quorumPresent" INTEGER,
  "quorumRuleReference" VARCHAR(500),
  "byeLawReference" VARCHAR(500),
  "minutesSummary" TEXT,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceMeeting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceMeeting_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceMeeting_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceMeeting_type_check" CHECK ("meetingType" IN ('AGM','SGM','COMMITTEE','BUSINESS')),
  CONSTRAINT "GovernanceMeeting_status_check" CHECK ("status" IN ('DRAFT','SCHEDULED','HELD','CANCELLED')),
  CONSTRAINT "GovernanceMeeting_quorum_check" CHECK (("quorumRequired" IS NULL OR "quorumRequired" >= 0) AND ("quorumPresent" IS NULL OR "quorumPresent" >= 0))
);

CREATE INDEX "GovernanceMeeting_society_scheduled_idx" ON "GovernanceMeeting"("societyId", "scheduledAt" DESC);

CREATE TABLE "GovernanceAgendaItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "meetingId" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceAgendaItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceAgendaItem_meeting_fkey" FOREIGN KEY ("meetingId") REFERENCES "GovernanceMeeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceAgendaItem_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceAgendaItem_ordinal_check" CHECK ("ordinal" > 0),
  CONSTRAINT "GovernanceAgendaItem_meeting_ordinal_key" UNIQUE ("meetingId", "ordinal")
);

CREATE INDEX "GovernanceAgendaItem_society_meeting_idx" ON "GovernanceAgendaItem"("societyId", "meetingId", "ordinal");

CREATE TABLE "GovernanceResolution" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "meetingId" UUID NOT NULL,
  "agendaItemId" UUID,
  "title" VARCHAR(240) NOT NULL,
  "resolutionText" TEXT NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PROPOSED',
  "approvalRequired" INTEGER,
  "approvalRecorded" INTEGER,
  "approvalRuleReference" VARCHAR(500),
  "byeLawReference" VARCHAR(500),
  "recordedByUserId" UUID NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceResolution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceResolution_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceResolution_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "GovernanceMeeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceResolution_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "GovernanceAgendaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceResolution_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceResolution_status_check" CHECK ("status" IN ('PROPOSED','PASSED','REJECTED','WITHDRAWN')),
  CONSTRAINT "GovernanceResolution_approval_check" CHECK (("approvalRequired" IS NULL OR "approvalRequired" >= 0) AND ("approvalRecorded" IS NULL OR "approvalRecorded" >= 0))
);

CREATE INDEX "GovernanceResolution_society_meeting_idx" ON "GovernanceResolution"("societyId", "meetingId", "recordedAt");

CREATE TABLE "GovernanceActionItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "meetingId" UUID NOT NULL,
  "resolutionId" UUID,
  "title" VARCHAR(240) NOT NULL,
  "description" TEXT,
  "ownerUserId" UUID,
  "dueAt" TIMESTAMP(3),
  "status" VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  "completedAt" TIMESTAMP(3),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceActionItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceActionItem_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceActionItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "GovernanceMeeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceActionItem_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "GovernanceResolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceActionItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceActionItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceActionItem_status_check" CHECK ("status" IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED'))
);

CREATE INDEX "GovernanceActionItem_society_status_due_idx" ON "GovernanceActionItem"("societyId", "status", "dueAt");

CREATE TABLE "GovernanceEvidenceEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "meetingId" UUID NOT NULL,
  "eventType" VARCHAR(64) NOT NULL,
  "actorUserId" UUID NOT NULL,
  "summary" VARCHAR(1000) NOT NULL,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceEvidenceEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceEvidenceEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceEvidenceEvent_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "GovernanceMeeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceEvidenceEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "GovernanceEvidenceEvent_society_meeting_idx" ON "GovernanceEvidenceEvent"("societyId", "meetingId", "createdAt");

CREATE OR REPLACE FUNCTION prevent_governance_evidence_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Governance evidence events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GovernanceEvidenceEvent_append_only_update" BEFORE UPDATE ON "GovernanceEvidenceEvent" FOR EACH ROW EXECUTE FUNCTION prevent_governance_evidence_event_mutation();
CREATE TRIGGER "GovernanceEvidenceEvent_append_only_delete" BEFORE DELETE ON "GovernanceEvidenceEvent" FOR EACH ROW EXECUTE FUNCTION prevent_governance_evidence_event_mutation();