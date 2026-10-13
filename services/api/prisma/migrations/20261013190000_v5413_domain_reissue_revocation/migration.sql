-- V5.4.13: audited revoke/reissue, immutable lifecycle events, rotation-limited.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
ALTER TYPE "PartnerDomainClaimAction" ADD VALUE IF NOT EXISTS 'REVOKED';
ALTER TYPE "PartnerDomainClaimAction" ADD VALUE IF NOT EXISTS 'CHALLENGE_REISSUED';
ALTER TABLE "PartnerDomainClaim"
  ADD COLUMN "challengeIssuedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "challengeRotationCount" INTEGER NOT NULL DEFAULT 0;
UPDATE "PartnerDomainClaim" SET "challengeIssuedAt"="createdAt";
ALTER TABLE "PartnerDomainClaim"
  ADD CONSTRAINT "PartnerDomainClaim_rotation_bound" CHECK ("challengeRotationCount" BETWEEN 0 AND 10);
ALTER TABLE "PartnerDomainClaimEvent"
  ADD COLUMN "idempotencyKey" UUID,
  ADD COLUMN "reason" VARCHAR(500);
CREATE UNIQUE INDEX "PartnerDomainClaimEvent_claimId_idempotencyKey_key"
  ON "PartnerDomainClaimEvent"("claimId","idempotencyKey");
COMMIT;
