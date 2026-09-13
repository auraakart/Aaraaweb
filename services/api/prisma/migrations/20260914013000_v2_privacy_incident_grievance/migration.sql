CREATE TABLE "PrivacyGrievanceContact" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "displayName" VARCHAR(160) NOT NULL,
  "email" VARCHAR(320),
  "phone" VARCHAR(40),
  "instructions" VARCHAR(1000),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyGrievanceContact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivacyGrievanceContact_societyId_key" UNIQUE ("societyId"),
  CONSTRAINT "PrivacyGrievanceContact_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyGrievanceContact_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PrivacySecurityIncident" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "category" VARCHAR(32) NOT NULL,
  "severity" VARCHAR(16) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  "summary" VARCHAR(2000) NOT NULL,
  "affectedDataCategoryCodes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "affectedSubjectEstimate" INTEGER,
  "minorDataSuspected" BOOLEAN NOT NULL DEFAULT false,
  "detectedAt" TIMESTAMP(3) NOT NULL,
  "assignedToUserId" UUID,
  "createdByUserId" UUID NOT NULL,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacySecurityIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivacySecurityIncident_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacySecurityIncident_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacySecurityIncident_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacySecurityIncident_category_check" CHECK ("category" IN ('LOSS','UNAUTHORIZED_ACCESS','DISCLOSURE','INTEGRITY','AVAILABILITY','OTHER')),
  CONSTRAINT "PrivacySecurityIncident_severity_check" CHECK ("severity" IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  CONSTRAINT "PrivacySecurityIncident_status_check" CHECK ("status" IN ('OPEN','CONTAINING','INVESTIGATING','REMEDIATING','CLOSED')),
  CONSTRAINT "PrivacySecurityIncident_affectedSubjectEstimate_check" CHECK ("affectedSubjectEstimate" IS NULL OR "affectedSubjectEstimate" >= 0)
);

CREATE INDEX "PrivacySecurityIncident_society_status_severity_idx" ON "PrivacySecurityIncident"("societyId", "status", "severity", "detectedAt" DESC);

CREATE TABLE "PrivacySecurityIncidentEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "incidentId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "eventType" VARCHAR(64) NOT NULL,
  "summary" VARCHAR(1000) NOT NULL,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacySecurityIncidentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivacySecurityIncidentEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacySecurityIncidentEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "PrivacySecurityIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacySecurityIncidentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PrivacySecurityIncidentEvent_society_incident_idx" ON "PrivacySecurityIncidentEvent"("societyId", "incidentId", "createdAt");

CREATE OR REPLACE FUNCTION prevent_privacy_security_incident_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Privacy security incident events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PrivacySecurityIncidentEvent_append_only_update" BEFORE UPDATE ON "PrivacySecurityIncidentEvent" FOR EACH ROW EXECUTE FUNCTION prevent_privacy_security_incident_event_mutation();
CREATE TRIGGER "PrivacySecurityIncidentEvent_append_only_delete" BEFORE DELETE ON "PrivacySecurityIncidentEvent" FOR EACH ROW EXECUTE FUNCTION prevent_privacy_security_incident_event_mutation();
