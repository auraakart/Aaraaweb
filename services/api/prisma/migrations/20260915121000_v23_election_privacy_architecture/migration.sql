-- V2.3 privacy architecture evidence only.
-- No voter credentials, cryptographic key material, vote records or ballot-choice payloads are stored here.

CREATE TABLE "GovernanceElectionPrivacyArchitectureRevision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "policyRevisionId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "identitySeparationReference" VARCHAR(2000) NOT NULL,
  "secrecyImplementationReference" VARCHAR(2000) NOT NULL,
  "credentialIssuanceReference" VARCHAR(2000) NOT NULL,
  "privilegedAuditAccessReference" VARCHAR(2000) NOT NULL,
  "retentionReference" VARCHAR(2000) NOT NULL,
  "incidentResponseReference" VARCHAR(2000) NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceElectionPrivacyArchitectureRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceElectionPrivacyArchitectureRevision_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionPrivacyArchitectureRevision_policyRevisionId_fkey" FOREIGN KEY ("policyRevisionId") REFERENCES "GovernanceElectionPolicyRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionPrivacyArchitectureRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionPrivacyArchitectureRevision_version_check" CHECK ("version" > 0),
  CONSTRAINT "GovernanceElectionPrivacyArchitectureRevision_identity_check" CHECK (length(btrim("identitySeparationReference")) > 0),
  CONSTRAINT "GovernanceElectionPrivacyArchitectureRevision_secrecy_check" CHECK (length(btrim("secrecyImplementationReference")) > 0),
  CONSTRAINT "GovernanceElectionPrivacyArchitectureRevision_credential_check" CHECK (length(btrim("credentialIssuanceReference")) > 0),
  CONSTRAINT "GovernanceElectionPrivacyArchitectureRevision_audit_check" CHECK (length(btrim("privilegedAuditAccessReference")) > 0),
  CONSTRAINT "GovernanceElectionPrivacyArchitectureRevision_retention_check" CHECK (length(btrim("retentionReference")) > 0),
  CONSTRAINT "GovernanceElectionPrivacyArchitectureRevision_incident_check" CHECK (length(btrim("incidentResponseReference")) > 0),
  CONSTRAINT "GovernanceElectionPrivacyArchitectureRevision_policy_version_key" UNIQUE ("policyRevisionId", "version")
);

CREATE INDEX "GovernanceElectionPrivacyArchitectureRevision_society_created_idx" ON "GovernanceElectionPrivacyArchitectureRevision"("societyId", "createdAt" DESC);
CREATE INDEX "GovernanceElectionPrivacyArchitectureRevision_policy_version_idx" ON "GovernanceElectionPrivacyArchitectureRevision"("policyRevisionId", "version" DESC);

CREATE OR REPLACE FUNCTION prevent_governance_election_privacy_architecture_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Governance election privacy architecture evidence is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GovernanceElectionPrivacyArchitectureRevision_append_only_update" BEFORE UPDATE ON "GovernanceElectionPrivacyArchitectureRevision" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_privacy_architecture_mutation();
CREATE TRIGGER "GovernanceElectionPrivacyArchitectureRevision_append_only_delete" BEFORE DELETE ON "GovernanceElectionPrivacyArchitectureRevision" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_privacy_architecture_mutation();
