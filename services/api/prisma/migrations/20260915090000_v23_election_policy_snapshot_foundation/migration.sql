-- V2.3 statutory/election foundation only.
-- This migration deliberately does NOT create ballots, votes, tallies or certification workflows.
-- Society policy revisions and electorate snapshots are immutable evidence records.

CREATE TABLE "GovernanceElectionPolicyRevision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "eligibilityMode" VARCHAR(64) NOT NULL,
  "policyReference" VARCHAR(1000) NOT NULL,
  "note" VARCHAR(2000),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceElectionPolicyRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceElectionPolicyRevision_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionPolicyRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionPolicyRevision_version_check" CHECK ("version" > 0),
  CONSTRAINT "GovernanceElectionPolicyRevision_mode_check" CHECK ("eligibilityMode" IN ('VERIFIED_OWNERS','VERIFIED_OWNERS_AND_ACTIVE_OCCUPANTS')),
  CONSTRAINT "GovernanceElectionPolicyRevision_reference_check" CHECK (length(btrim("policyReference")) > 0),
  CONSTRAINT "GovernanceElectionPolicyRevision_society_version_key" UNIQUE ("societyId", "version")
);

CREATE INDEX "GovernanceElectionPolicyRevision_society_created_idx" ON "GovernanceElectionPolicyRevision"("societyId", "createdAt" DESC);

CREATE TABLE "GovernanceElectorateSnapshot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "policyRevisionId" UUID NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceElectorateSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceElectorateSnapshot_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectorateSnapshot_policyRevisionId_fkey" FOREIGN KEY ("policyRevisionId") REFERENCES "GovernanceElectionPolicyRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectorateSnapshot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "GovernanceElectorateSnapshot_society_created_idx" ON "GovernanceElectorateSnapshot"("societyId", "createdAt" DESC);
CREATE INDEX "GovernanceElectorateSnapshot_policy_idx" ON "GovernanceElectorateSnapshot"("policyRevisionId");

CREATE TABLE "GovernanceElectorateMember" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "snapshotId" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "eligibilitySource" VARCHAR(32) NOT NULL,
  "sourceRelationshipId" UUID NOT NULL,
  "ownershipBps" INTEGER,
  "occupancyRelation" VARCHAR(32),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceElectorateMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceElectorateMember_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "GovernanceElectorateSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectorateMember_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectorateMember_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectorateMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectorateMember_source_check" CHECK ("eligibilitySource" IN ('VERIFIED_OWNER','ACTIVE_OCCUPANT')),
  CONSTRAINT "GovernanceElectorateMember_owner_bps_check" CHECK ("ownershipBps" IS NULL OR ("ownershipBps" > 0 AND "ownershipBps" <= 10000)),
  CONSTRAINT "GovernanceElectorateMember_snapshot_unit_user_key" UNIQUE ("snapshotId", "unitId", "userId")
);

CREATE INDEX "GovernanceElectorateMember_snapshot_idx" ON "GovernanceElectorateMember"("snapshotId", "unitId", "userId");
CREATE INDEX "GovernanceElectorateMember_society_user_idx" ON "GovernanceElectorateMember"("societyId", "userId");

CREATE OR REPLACE FUNCTION prevent_governance_election_evidence_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Governance election policy and electorate evidence is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GovernanceElectionPolicyRevision_append_only_update" BEFORE UPDATE ON "GovernanceElectionPolicyRevision" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_evidence_mutation();
CREATE TRIGGER "GovernanceElectionPolicyRevision_append_only_delete" BEFORE DELETE ON "GovernanceElectionPolicyRevision" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_evidence_mutation();
CREATE TRIGGER "GovernanceElectorateSnapshot_append_only_update" BEFORE UPDATE ON "GovernanceElectorateSnapshot" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_evidence_mutation();
CREATE TRIGGER "GovernanceElectorateSnapshot_append_only_delete" BEFORE DELETE ON "GovernanceElectorateSnapshot" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_evidence_mutation();
CREATE TRIGGER "GovernanceElectorateMember_append_only_update" BEFORE UPDATE ON "GovernanceElectorateMember" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_evidence_mutation();
CREATE TRIGGER "GovernanceElectorateMember_append_only_delete" BEFORE DELETE ON "GovernanceElectorateMember" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_evidence_mutation();
