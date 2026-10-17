-- V5.4.9: additive commercial-only member invitations and immutable audit.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TYPE "PartnerInvitationStatus" AS ENUM ('PENDING','ACCEPTED','DECLINED','REVOKED','EXPIRED');
CREATE TYPE "PartnerMemberAction" AS ENUM ('INVITED','ACCEPTED','DECLINED','INVITATION_REVOKED','ROLE_CHANGED','MEMBER_REVOKED');
CREATE TABLE "PartnerInvitation" (
 "id" UUID NOT NULL,
 "partnerId" UUID NOT NULL,
 "userId" UUID NOT NULL,
 "invitedById" UUID NOT NULL,
 "role" "PartnerRole" NOT NULL,
 "status" "PartnerInvitationStatus" NOT NULL DEFAULT 'PENDING',
 "idempotencyKey" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMPTZ(6) NOT NULL,
 "respondedAt" TIMESTAMPTZ(6),
 CONSTRAINT "PartnerInvitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerInvitation_partnerId_idempotencyKey_key" ON "PartnerInvitation"("partnerId","idempotencyKey");
CREATE INDEX "PartnerInvitation_userId_status_expiresAt_idx" ON "PartnerInvitation"("userId","status","expiresAt");
CREATE INDEX "PartnerInvitation_partnerId_userId_status_idx" ON "PartnerInvitation"("partnerId","userId","status");
ALTER TABLE "PartnerInvitation" ADD CONSTRAINT "PartnerInvitation_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerInvitation" ADD CONSTRAINT "PartnerInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerInvitation" ADD CONSTRAINT "PartnerInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "PartnerMembershipEvent" (
 "id" UUID NOT NULL,
 "partnerId" UUID NOT NULL,
 "subjectUserId" UUID NOT NULL,
 "actorId" UUID NOT NULL,
 "action" "PartnerMemberAction" NOT NULL,
 "beforeRole" "PartnerRole",
 "afterRole" "PartnerRole",
 "invitationId" UUID,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PartnerMembershipEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PartnerMembershipEvent_partnerId_createdAt_idx" ON "PartnerMembershipEvent"("partnerId","createdAt");
ALTER TABLE "PartnerMembershipEvent" ADD CONSTRAINT "PartnerMembershipEvent_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerMembershipEvent" ADD CONSTRAINT "PartnerMembershipEvent_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerMembershipEvent" ADD CONSTRAINT "PartnerMembershipEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE FUNCTION aaraagate_immutable_partner_member_event() RETURNS TRIGGER AS $$
BEGIN
 RAISE EXCEPTION 'Partner membership audit events are immutable' USING ERRCODE='55000';
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "PartnerMembershipEvent_immutable" BEFORE UPDATE OR DELETE ON "PartnerMembershipEvent"
 FOR EACH ROW EXECUTE FUNCTION aaraagate_immutable_partner_member_event();
COMMIT;
