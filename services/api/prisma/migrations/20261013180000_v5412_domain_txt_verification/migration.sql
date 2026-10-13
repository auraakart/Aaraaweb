-- V5.4.12: bounded, separately audited test-environment DNS TXT verification.
-- VERIFIED does NOT activate host routing, cookies, application access or TLS.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
ALTER TYPE "PartnerDomainClaimAction" ADD VALUE IF NOT EXISTS 'VERIFIED';
ALTER TABLE "PartnerDomainClaim"
  ADD COLUMN "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastVerificationAttemptAt" TIMESTAMPTZ(6),
  ADD COLUMN "verifiedAt" TIMESTAMPTZ(6),
  ADD COLUMN "verifiedUntil" TIMESTAMPTZ(6);
ALTER TABLE "PartnerDomainClaim"
  ADD CONSTRAINT "PartnerDomainClaim_attempts_bound" CHECK ("verificationAttempts" BETWEEN 0 AND 5),
  ADD CONSTRAINT "PartnerDomainClaim_verified_dates" CHECK (
    ("status"='VERIFIED' AND "verifiedAt" IS NOT NULL AND "verifiedUntil" IS NOT NULL AND "verifiedUntil">"verifiedAt")
    OR ("status"<>'VERIFIED' AND "verifiedAt" IS NULL AND "verifiedUntil" IS NULL)
  );
CREATE INDEX "PartnerDomainClaim_valid_verified_idx"
  ON "PartnerDomainClaim" ("partnerId","status","verifiedUntil");
COMMIT;
