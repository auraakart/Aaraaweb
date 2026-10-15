CREATE TABLE "PrivacyConsentRecord" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "subjectUserId" UUID NOT NULL,
  "dataCategoryCode" VARCHAR(64),
  "purpose" VARCHAR(1000) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'GRANTED',
  "minorAtRecord" BOOLEAN NOT NULL DEFAULT false,
  "representativeUserId" UUID,
  "relationshipReference" VARCHAR(500),
  "evidenceReference" VARCHAR(1000),
  "grantedAt" TIMESTAMP(3) NOT NULL,
  "withdrawnAt" TIMESTAMP(3),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyConsentRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivacyConsentRecord_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyConsentRecord_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyConsentRecord_representativeUserId_fkey" FOREIGN KEY ("representativeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyConsentRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyConsentRecord_status_check" CHECK ("status" IN ('GRANTED','WITHDRAWN')),
  CONSTRAINT "PrivacyConsentRecord_minor_rep_check" CHECK (
    "minorAtRecord" = false OR ("representativeUserId" IS NOT NULL AND "relationshipReference" IS NOT NULL)
  )
);

CREATE INDEX "PrivacyConsentRecord_society_subject_idx" ON "PrivacyConsentRecord"("societyId", "subjectUserId", "createdAt" DESC);
CREATE INDEX "PrivacyConsentRecord_society_status_idx" ON "PrivacyConsentRecord"("societyId", "status", "createdAt" DESC);

CREATE TABLE "PrivacyConsentEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "consentId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "eventType" VARCHAR(32) NOT NULL,
  "summary" VARCHAR(1000) NOT NULL,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrivacyConsentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PrivacyConsentEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyConsentEvent_consentId_fkey" FOREIGN KEY ("consentId") REFERENCES "PrivacyConsentRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyConsentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PrivacyConsentEvent_type_check" CHECK ("eventType" IN ('CONSENT_RECORDED','CONSENT_WITHDRAWN'))
);

CREATE INDEX "PrivacyConsentEvent_society_consent_idx" ON "PrivacyConsentEvent"("societyId", "consentId", "createdAt");

CREATE OR REPLACE FUNCTION prevent_privacy_consent_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Privacy consent events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PrivacyConsentEvent_append_only_update" BEFORE UPDATE ON "PrivacyConsentEvent" FOR EACH ROW EXECUTE FUNCTION prevent_privacy_consent_event_mutation();
CREATE TRIGGER "PrivacyConsentEvent_append_only_delete" BEFORE DELETE ON "PrivacyConsentEvent" FOR EACH ROW EXECUTE FUNCTION prevent_privacy_consent_event_mutation();
