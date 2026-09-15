-- V2.3 election control evidence only.
-- Approval here is governance setup evidence; it never makes a ballot executable or enables vote casting.

CREATE TABLE "GovernanceElectionBallotDraftDecision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "ballotDraftId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "outcome" VARCHAR(32) NOT NULL,
  "reason" VARCHAR(2000),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceElectionBallotDraftDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceElectionBallotDraftDecision_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionBallotDraftDecision_ballotDraftId_fkey" FOREIGN KEY ("ballotDraftId") REFERENCES "GovernanceElectionBallotDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionBallotDraftDecision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionBallotDraftDecision_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "GovernanceElectionBallotDraftDecision_outcome_check" CHECK ("outcome" IN ('APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT "GovernanceElectionBallotDraftDecision_ballot_sequence_key" UNIQUE ("ballotDraftId", "sequence")
);

CREATE INDEX "GovernanceElectionBallotDraftDecision_society_created_idx" ON "GovernanceElectionBallotDraftDecision"("societyId", "createdAt" DESC);
CREATE INDEX "GovernanceElectionBallotDraftDecision_ballot_sequence_idx" ON "GovernanceElectionBallotDraftDecision"("ballotDraftId", "sequence" DESC);

CREATE OR REPLACE FUNCTION prevent_governance_ballot_decision_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Governance ballot decision evidence is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GovernanceElectionBallotDraftDecision_append_only_update" BEFORE UPDATE ON "GovernanceElectionBallotDraftDecision" FOR EACH ROW EXECUTE FUNCTION prevent_governance_ballot_decision_mutation();
CREATE TRIGGER "GovernanceElectionBallotDraftDecision_append_only_delete" BEFORE DELETE ON "GovernanceElectionBallotDraftDecision" FOR EACH ROW EXECUTE FUNCTION prevent_governance_ballot_decision_mutation();
