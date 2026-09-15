-- Harden V2.3 election hold evidence so the database itself enforces
-- society/tenant consistency between a hold event and its ballot draft.
--
-- Application queries already scope both identifiers by society. This migration
-- closes the remaining defense-in-depth gap for privileged imports, future code
-- paths, and direct SQL maintenance by making a cross-society reference invalid
-- at the relational layer as well.

ALTER TABLE "GovernanceElectionBallotDraft"
  ADD CONSTRAINT "GovernanceElectionBallotDraft_id_societyId_key"
  UNIQUE ("id", "societyId");

ALTER TABLE "GovernanceElectionHoldEvent"
  DROP CONSTRAINT "GovernanceElectionHoldEvent_ballotDraftId_fkey";

ALTER TABLE "GovernanceElectionHoldEvent"
  ADD CONSTRAINT "GovernanceElectionHoldEvent_ballot_tenant_fkey"
  FOREIGN KEY ("ballotDraftId", "societyId")
  REFERENCES "GovernanceElectionBallotDraft"("id", "societyId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
