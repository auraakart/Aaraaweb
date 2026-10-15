CREATE TABLE "PrivacyRequestCase" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "subjectUserId" UUID NOT NULL,
  "requestType" VARCHAR(32) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  "requestSummary" VARCHAR(2000) NOT NULL,
  "assignedToUserId" UUID,
  "legalHold" BOOLEAN NOT NULL DEFAULT false,
  "retentionReason" VARCHAR(1000),
  "dueAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyRequestCase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivacyRequestCase_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyRequestCase_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyRequestCase_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyRequestCase_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyRequestCase_type_check" CHECK ("requestType" IN ('ACCESS','CORRECTION','ERASURE','OTHER')),
  CONSTRAINT "PrivacyRequestCase_status_check" CHECK ("status" IN ('OPEN','IN_REVIEW','WAITING','COMPLETED','REJECTED','CANCELLED')),
  CONSTRAINT "PrivacyRequestCase_closed_check" CHECK (("status" IN ('COMPLETED','REJECTED','CANCELLED') AND "closedAt" IS NOT NULL) OR ("status" NOT IN ('COMPLETED','REJECTED','CANCELLED') AND "closedAt" IS NULL))
);

CREATE INDEX "PrivacyRequestCase_society_status_created_idx" ON "PrivacyRequestCase"("societyId", "status", "createdAt" DESC);
CREATE INDEX "PrivacyRequestCase_society_subject_created_idx" ON "PrivacyRequestCase"("societyId", "subjectUserId", "createdAt" DESC);
CREATE INDEX "PrivacyRequestCase_society_hold_idx" ON "PrivacyRequestCase"("societyId", "legalHold", "status");

CREATE TABLE "PrivacyRequestEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "caseId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "eventType" VARCHAR(64) NOT NULL,
  "summary" VARCHAR(1000) NOT NULL,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyRequestEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivacyRequestEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyRequestEvent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "PrivacyRequestCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyRequestEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PrivacyRequestEvent_society_case_created_idx" ON "PrivacyRequestEvent"("societyId", "caseId", "createdAt");

CREATE OR REPLACE FUNCTION prevent_privacy_request_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Privacy request events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PrivacyRequestEvent_append_only_update" BEFORE UPDATE ON "PrivacyRequestEvent" FOR EACH ROW EXECUTE FUNCTION prevent_privacy_request_event_mutation();
CREATE TRIGGER "PrivacyRequestEvent_append_only_delete" BEFORE DELETE ON "PrivacyRequestEvent" FOR EACH ROW EXECUTE FUNCTION prevent_privacy_request_event_mutation();