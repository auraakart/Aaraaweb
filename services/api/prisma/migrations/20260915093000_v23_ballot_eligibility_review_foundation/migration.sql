-- V2.3 election setup safety layer only.
-- This migration deliberately does NOT create vote/cast/tally/certification tables or executable election lifecycle states.

CREATE TABLE "GovernanceElectorateReviewAttestation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "snapshotId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "outcome" VARCHAR(32) NOT NULL,
  "note" VARCHAR(2000),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceElectorateReviewAttestation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceElectorateReviewAttestation_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectorateReviewAttestation_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "GovernanceElectorateSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectorateReviewAttestation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectorateReviewAttestation_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "GovernanceElectorateReviewAttestation_outcome_check" CHECK ("outcome" IN ('REVIEWED','BLOCKED')),
  CONSTRAINT "GovernanceElectorateReviewAttestation_snapshot_sequence_key" UNIQUE ("snapshotId", "sequence")
);

CREATE INDEX "GovernanceElectorateReviewAttestation_snapshot_sequence_idx" ON "GovernanceElectorateReviewAttestation"("snapshotId", "sequence" DESC);
CREATE INDEX "GovernanceElectorateReviewAttestation_society_created_idx" ON "GovernanceElectorateReviewAttestation"("societyId", "createdAt" DESC);

CREATE TABLE "GovernanceElectionBallotDraft" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "snapshotId" UUID NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "question" VARCHAR(2000) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceElectionBallotDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceElectionBallotDraft_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionBallotDraft_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "GovernanceElectorateSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionBallotDraft_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionBallotDraft_status_check" CHECK ("status" = 'DRAFT'),
  CONSTRAINT "GovernanceElectionBallotDraft_title_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "GovernanceElectionBallotDraft_question_check" CHECK (length(btrim("question")) > 0)
);

CREATE INDEX "GovernanceElectionBallotDraft_society_created_idx" ON "GovernanceElectionBallotDraft"("societyId", "createdAt" DESC);
CREATE INDEX "GovernanceElectionBallotDraft_snapshot_idx" ON "GovernanceElectionBallotDraft"("snapshotId");

CREATE TABLE "GovernanceElectionBallotDraftOption" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "ballotDraftId" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "label" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceElectionBallotDraftOption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceElectionBallotDraftOption_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionBallotDraftOption_ballotDraftId_fkey" FOREIGN KEY ("ballotDraftId") REFERENCES "GovernanceElectionBallotDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionBallotDraftOption_ordinal_check" CHECK ("ordinal" > 0),
  CONSTRAINT "GovernanceElectionBallotDraftOption_label_check" CHECK (length(btrim("label")) > 0),
  CONSTRAINT "GovernanceElectionBallotDraftOption_ballot_ordinal_key" UNIQUE ("ballotDraftId", "ordinal")
);

CREATE INDEX "GovernanceElectionBallotDraftOption_ballot_idx" ON "GovernanceElectionBallotDraftOption"("ballotDraftId", "ordinal");

CREATE OR REPLACE FUNCTION prevent_governance_election_setup_evidence_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Governance election review and ballot blueprint evidence is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GovernanceElectorateReviewAttestation_append_only_update" BEFORE UPDATE ON "GovernanceElectorateReviewAttestation" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_setup_evidence_mutation();
CREATE TRIGGER "GovernanceElectorateReviewAttestation_append_only_delete" BEFORE DELETE ON "GovernanceElectorateReviewAttestation" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_setup_evidence_mutation();
CREATE TRIGGER "GovernanceElectionBallotDraft_append_only_update" BEFORE UPDATE ON "GovernanceElectionBallotDraft" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_setup_evidence_mutation();
CREATE TRIGGER "GovernanceElectionBallotDraft_append_only_delete" BEFORE DELETE ON "GovernanceElectionBallotDraft" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_setup_evidence_mutation();
CREATE TRIGGER "GovernanceElectionBallotDraftOption_append_only_update" BEFORE UPDATE ON "GovernanceElectionBallotDraftOption" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_setup_evidence_mutation();
CREATE TRIGGER "GovernanceElectionBallotDraftOption_append_only_delete" BEFORE DELETE ON "GovernanceElectionBallotDraftOption" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_setup_evidence_mutation();
