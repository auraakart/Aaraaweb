-- Harden V2.3 election evidence so the database itself enforces society/tenant
-- consistency across the policy -> snapshot -> ballot -> decision/hold chain.
--
-- Application queries already scope these identifiers by society. The original
-- migrations used independent foreign keys for societyId and child IDs, which
-- allowed a privileged import, future code path, or direct SQL operation to pair
-- a valid societyId with a valid child row from another society. Composite
-- foreign keys close that defense-in-depth gap without changing API contracts.

-- Composite candidate keys used by tenant-aware child references.
ALTER TABLE "GovernanceElectionPolicyRevision"
  ADD CONSTRAINT "GovernanceElectionPolicyRevision_id_societyId_key"
  UNIQUE ("id", "societyId");

ALTER TABLE "GovernanceElectorateSnapshot"
  ADD CONSTRAINT "GovernanceElectorateSnapshot_id_societyId_key"
  UNIQUE ("id", "societyId");

ALTER TABLE "GovernanceElectionBallotDraft"
  ADD CONSTRAINT "GovernanceElectionBallotDraft_id_societyId_key"
  UNIQUE ("id", "societyId");

-- Policy-bound evidence must belong to the same society as its policy revision.
ALTER TABLE "GovernanceElectorateSnapshot"
  DROP CONSTRAINT "GovernanceElectorateSnapshot_policyRevisionId_fkey";
ALTER TABLE "GovernanceElectorateSnapshot"
  ADD CONSTRAINT "GovernanceElectorateSnapshot_policy_tenant_fkey"
  FOREIGN KEY ("policyRevisionId", "societyId")
  REFERENCES "GovernanceElectionPolicyRevision"("id", "societyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GovernanceElectionProcedureRevision"
  DROP CONSTRAINT "GovernanceElectionProcedureRevision_policyRevisionId_fkey";
ALTER TABLE "GovernanceElectionProcedureRevision"
  ADD CONSTRAINT "GovernanceElectionProcedureRevision_policy_tenant_fkey"
  FOREIGN KEY ("policyRevisionId", "societyId")
  REFERENCES "GovernanceElectionPolicyRevision"("id", "societyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GovernanceElectionPrivacyArchitectureRevision"
  DROP CONSTRAINT "GovernanceElectionPrivacyArchitectureRevision_policyRevisionId_fkey";
ALTER TABLE "GovernanceElectionPrivacyArchitectureRevision"
  ADD CONSTRAINT "GovernanceElectionPrivacyArchitectureRevision_policy_tenant_fkey"
  FOREIGN KEY ("policyRevisionId", "societyId")
  REFERENCES "GovernanceElectionPolicyRevision"("id", "societyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Snapshot-bound evidence must stay within the snapshot's society.
ALTER TABLE "GovernanceElectorateMember"
  DROP CONSTRAINT "GovernanceElectorateMember_snapshotId_fkey";
ALTER TABLE "GovernanceElectorateMember"
  ADD CONSTRAINT "GovernanceElectorateMember_snapshot_tenant_fkey"
  FOREIGN KEY ("snapshotId", "societyId")
  REFERENCES "GovernanceElectorateSnapshot"("id", "societyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GovernanceElectorateReviewAttestation"
  DROP CONSTRAINT "GovernanceElectorateReviewAttestation_snapshotId_fkey";
ALTER TABLE "GovernanceElectorateReviewAttestation"
  ADD CONSTRAINT "GovernanceElectorateReviewAttestation_snapshot_tenant_fkey"
  FOREIGN KEY ("snapshotId", "societyId")
  REFERENCES "GovernanceElectorateSnapshot"("id", "societyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GovernanceElectionBallotDraft"
  DROP CONSTRAINT "GovernanceElectionBallotDraft_snapshotId_fkey";
ALTER TABLE "GovernanceElectionBallotDraft"
  ADD CONSTRAINT "GovernanceElectionBallotDraft_snapshot_tenant_fkey"
  FOREIGN KEY ("snapshotId", "societyId")
  REFERENCES "GovernanceElectorateSnapshot"("id", "societyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ballot-bound evidence must stay within the ballot draft's society.
ALTER TABLE "GovernanceElectionBallotDraftOption"
  DROP CONSTRAINT "GovernanceElectionBallotDraftOption_ballotDraftId_fkey";
ALTER TABLE "GovernanceElectionBallotDraftOption"
  ADD CONSTRAINT "GovernanceElectionBallotDraftOption_ballot_tenant_fkey"
  FOREIGN KEY ("ballotDraftId", "societyId")
  REFERENCES "GovernanceElectionBallotDraft"("id", "societyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GovernanceElectionBallotDraftDecision"
  DROP CONSTRAINT "GovernanceElectionBallotDraftDecision_ballotDraftId_fkey";
ALTER TABLE "GovernanceElectionBallotDraftDecision"
  ADD CONSTRAINT "GovernanceElectionBallotDraftDecision_ballot_tenant_fkey"
  FOREIGN KEY ("ballotDraftId", "societyId")
  REFERENCES "GovernanceElectionBallotDraft"("id", "societyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GovernanceElectionHoldEvent"
  DROP CONSTRAINT "GovernanceElectionHoldEvent_ballotDraftId_fkey";
ALTER TABLE "GovernanceElectionHoldEvent"
  ADD CONSTRAINT "GovernanceElectionHoldEvent_ballot_tenant_fkey"
  FOREIGN KEY ("ballotDraftId", "societyId")
  REFERENCES "GovernanceElectionBallotDraft"("id", "societyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
