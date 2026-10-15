-- V2.3 election procedure policy evidence only.
-- These references document society-specific procedure rules; they do not implement or enable vote execution.

CREATE TABLE "GovernanceElectionProcedureRevision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "policyRevisionId" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "jointOwnershipReference" VARCHAR(2000) NOT NULL,
  "proxyReference" VARCHAR(2000) NOT NULL,
  "voteBasisReference" VARCHAR(2000) NOT NULL,
  "quorumReference" VARCHAR(2000) NOT NULL,
  "secrecyReference" VARCHAR(2000) NOT NULL,
  "challengeReference" VARCHAR(2000) NOT NULL,
  "recountReference" VARCHAR(2000) NOT NULL,
  "certificationReference" VARCHAR(2000) NOT NULL,
  "resultPublicationReference" VARCHAR(2000) NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceElectionProcedureRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceElectionProcedureRevision_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionProcedureRevision_policyRevisionId_fkey" FOREIGN KEY ("policyRevisionId") REFERENCES "GovernanceElectionPolicyRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionProcedureRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceElectionProcedureRevision_version_check" CHECK ("version" > 0),
  CONSTRAINT "GovernanceElectionProcedureRevision_society_policy_version_key" UNIQUE ("societyId", "policyRevisionId", "version"),
  CONSTRAINT "GovernanceElectionProcedureRevision_joint_check" CHECK (length(btrim("jointOwnershipReference")) > 0),
  CONSTRAINT "GovernanceElectionProcedureRevision_proxy_check" CHECK (length(btrim("proxyReference")) > 0),
  CONSTRAINT "GovernanceElectionProcedureRevision_vote_basis_check" CHECK (length(btrim("voteBasisReference")) > 0),
  CONSTRAINT "GovernanceElectionProcedureRevision_quorum_check" CHECK (length(btrim("quorumReference")) > 0),
  CONSTRAINT "GovernanceElectionProcedureRevision_secrecy_check" CHECK (length(btrim("secrecyReference")) > 0),
  CONSTRAINT "GovernanceElectionProcedureRevision_challenge_check" CHECK (length(btrim("challengeReference")) > 0),
  CONSTRAINT "GovernanceElectionProcedureRevision_recount_check" CHECK (length(btrim("recountReference")) > 0),
  CONSTRAINT "GovernanceElectionProcedureRevision_certification_check" CHECK (length(btrim("certificationReference")) > 0),
  CONSTRAINT "GovernanceElectionProcedureRevision_publication_check" CHECK (length(btrim("resultPublicationReference")) > 0)
);

CREATE INDEX "GovernanceElectionProcedureRevision_society_created_idx" ON "GovernanceElectionProcedureRevision"("societyId", "createdAt" DESC);
CREATE INDEX "GovernanceElectionProcedureRevision_policy_version_idx" ON "GovernanceElectionProcedureRevision"("policyRevisionId", "version" DESC);

CREATE OR REPLACE FUNCTION prevent_governance_election_procedure_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Governance election procedure evidence is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GovernanceElectionProcedureRevision_append_only_update" BEFORE UPDATE ON "GovernanceElectionProcedureRevision" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_procedure_mutation();
CREATE TRIGGER "GovernanceElectionProcedureRevision_append_only_delete" BEFORE DELETE ON "GovernanceElectionProcedureRevision" FOR EACH ROW EXECUTE FUNCTION prevent_governance_election_procedure_mutation();
