-- V5.4.11: versioned DNS proof registry, independent of license and routing.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TYPE "PartnerDomainStatus" AS ENUM ('PENDING','VERIFIED','REVOKED');
CREATE TYPE "PartnerDomainAction" AS ENUM ('CHALLENGE_CREATED','DNS_VERIFIED','REVOKED');
CREATE TABLE "PartnerDomainRegistration" (
 "id" UUID NOT NULL,
 "partnerId" UUID NOT NULL,
 "requestedById" UUID NOT NULL,
 "hostname" VARCHAR(253) NOT NULL,
 "status" "PartnerDomainStatus" NOT NULL DEFAULT 'PENDING',
 "revision" INTEGER NOT NULL DEFAULT 1,
 "idempotencyKey" UUID NOT NULL,
 "challengeHash" CHAR(64) NOT NULL,
 "challengeExpiresAt" TIMESTAMPTZ(6) NOT NULL,
 "verifiedAt" TIMESTAMPTZ(6),
 "verifiedUntil" TIMESTAMPTZ(6),
 "revokedAt" TIMESTAMPTZ(6),
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PartnerDomainRegistration_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PartnerDomainRegistration_revision_check" CHECK ("revision" >= 1),
 CONSTRAINT "PartnerDomainRegistration_lowercase_check" CHECK ("hostname" = lower("hostname"))
);
CREATE UNIQUE INDEX "PartnerDomainRegistration_hostname_key" ON "PartnerDomainRegistration"("hostname");
CREATE UNIQUE INDEX "PartnerDomainRegistration_partnerId_idempotencyKey_key" ON "PartnerDomainRegistration"("partnerId","idempotencyKey");
CREATE INDEX "PartnerDomainRegistration_partnerId_status_idx" ON "PartnerDomainRegistration"("partnerId","status");
ALTER TABLE "PartnerDomainRegistration" ADD CONSTRAINT "PartnerDomainRegistration_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerDomainRegistration" ADD CONSTRAINT "PartnerDomainRegistration_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "PartnerDomainEvent" (
 "id" UUID NOT NULL,
 "domainId" UUID NOT NULL,
 "partnerId" UUID NOT NULL,
 "actorId" UUID NOT NULL,
 "revision" INTEGER NOT NULL,
 "action" "PartnerDomainAction" NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PartnerDomainEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerDomainEvent_domainId_revision_key" ON "PartnerDomainEvent"("domainId","revision");
CREATE INDEX "PartnerDomainEvent_partnerId_createdAt_idx" ON "PartnerDomainEvent"("partnerId","createdAt");
ALTER TABLE "PartnerDomainEvent" ADD CONSTRAINT "PartnerDomainEvent_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "PartnerDomainRegistration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerDomainEvent" ADD CONSTRAINT "PartnerDomainEvent_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerDomainEvent" ADD CONSTRAINT "PartnerDomainEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION aaraagate_immutable_partner_domain_event() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Partner domain verification audit is immutable' USING ERRCODE='55000';
END $$;
CREATE TRIGGER "PartnerDomainEvent_immutable" BEFORE UPDATE OR DELETE ON "PartnerDomainEvent"
 FOR EACH ROW EXECUTE FUNCTION aaraagate_immutable_partner_domain_event();
COMMIT;
