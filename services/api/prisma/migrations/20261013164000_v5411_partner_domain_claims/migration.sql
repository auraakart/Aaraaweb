-- V5.4.11: additive, non-routing partner hostname registration.
-- PENDING does not authorize routing, authentication, or a society feature.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
CREATE TYPE "PartnerDomainClaimStatus" AS ENUM ('PENDING', 'VERIFIED', 'REVOKED');
CREATE TYPE "PartnerDomainClaimAction" AS ENUM ('REGISTERED');
CREATE TABLE "PartnerDomainClaim" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "partnerId" UUID NOT NULL,
  "hostname" VARCHAR(253) NOT NULL,
  "status" "PartnerDomainClaimStatus" NOT NULL DEFAULT 'PENDING',
  "challengeHash" CHAR(64) NOT NULL,
  "idempotencyKey" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "PartnerDomainClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerDomainClaim_hostname_key" UNIQUE ("hostname"),
  CONSTRAINT "PartnerDomainClaim_partnerId_idempotencyKey_key" UNIQUE ("partnerId","idempotencyKey"),
  CONSTRAINT "PartnerDomainClaim_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PartnerDomainClaim_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PartnerDomainClaim_version_check" CHECK ("version" > 0),
  CONSTRAINT "PartnerDomainClaim_initial_status_check" CHECK ("status" IN ('PENDING','VERIFIED','REVOKED'))
);
CREATE INDEX "PartnerDomainClaim_partnerId_status_idx" ON "PartnerDomainClaim"("partnerId","status");
CREATE TABLE "PartnerDomainClaimEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "claimId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "action" "PartnerDomainClaimAction" NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerDomainClaimEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartnerDomainClaimEvent_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "PartnerDomainClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PartnerDomainClaimEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PartnerDomainClaimEvent_claimId_createdAt_idx" ON "PartnerDomainClaimEvent"("claimId","createdAt");
CREATE FUNCTION aaraagate_v5411_claim_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Partner domain claim audit records are immutable' USING ERRCODE='55000';
END $$;
CREATE TRIGGER "PartnerDomainClaimEvent_immutable"
BEFORE UPDATE OR DELETE ON "PartnerDomainClaimEvent"
FOR EACH ROW EXECUTE FUNCTION aaraagate_v5411_claim_event_immutable();
COMMIT;
