-- V2.3 election hold/challenge control evidence only.
-- This table does not enable ballot execution or store vote-related payloads.

CREATE TABLE "GovernanceElectionHoldEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "ballotDraftId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "action" VARCHAR(16) NOT NULL,
  "category" VARCHAR(32) NOT NULL,
  "reason" VARCHAR(2000) NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceElectionHoldEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceElectionHoldEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionHoldEvent_ballotDraftId_fkey" FOREIGN KEY ("ballotDraftId") REFERENCES "GovernanceElectionBallotDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionHoldEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionHoldEvent_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "GovernanceElectionHoldEvent_action_check" CHECK ("action" IN ('OPEN_HOLD','RESOLVE_HOLD','CANCEL_HOLD')),
  CONSTRAINT "GovernanceElectionHoldEvent_category_check" CHECK ("category" IN ('ELECTORATE','PROCEDURE','PRIVACY_SECURITY','LEGAL_POLICY','INCIDENT','OTHER')),
  CONSTRAINT "GovernanceElectionHoldEvent_reason_check" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "GovernanceElectionHoldEvent_ballot_sequence_key" UNIQUE ("ballotDraftId", "sequence")
);

CREATE INDEX "GovernanceElectionHoldEvent_society_ballot_sequence_idx" ON "GovernanceElectionHoldEvent"("societyId", "ballotDraftId", "sequence" DESC);

CREATE OR REPLACE FUNCTION prevent_governance_election_hold_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Governance election hold evidence is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GovernanceElectionHoldEvent_append_only_update" BEFORE UPDATE ON "GovernanceElectionHoldEvent" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_hold_mutation();
CREATE TRIGGER "GovernanceElectionHoldEvent_append_only_delete" BEFORE DELETE ON "GovernanceElectionHoldEvent" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_hold_mutation();
