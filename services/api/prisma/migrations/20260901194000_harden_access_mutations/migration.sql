ALTER TABLE "AuditEvent" ALTER COLUMN "gateId" DROP NOT NULL;
ALTER TABLE "AuditEvent" ALTER COLUMN "visitorPassId" DROP NOT NULL;
ALTER TABLE "AuditEvent" ADD COLUMN "accessRequestId" UUID;

ALTER TABLE "AuditEvent" DROP CONSTRAINT IF EXISTS "AuditEvent_gateId_fkey";
ALTER TABLE "AuditEvent" DROP CONSTRAINT IF EXISTS "AuditEvent_visitorPassId_fkey";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_visitorPassId_fkey" FOREIGN KEY ("visitorPassId") REFERENCES "VisitorPass"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_accessRequestId_fkey" FOREIGN KEY ("accessRequestId") REFERENCES "AccessRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AuditEvent_societyId_accessRequestId_occurredAt_idx" ON "AuditEvent"("societyId", "accessRequestId", "occurredAt");

ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ACCESS_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ACCESS_APPROVED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ACCESS_DENIED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ACCESS_CANCELLED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ACCESS_VERIFIED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ACCESS_CHECKED_IN';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ACCESS_CHECKED_OUT';

CREATE TYPE "GateMutationAction" AS ENUM ('CHECK_IN', 'CHECK_OUT');

CREATE TABLE "GateMutationReceipt" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "gateId" UUID NOT NULL,
  "accessRequestId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "action" "GateMutationAction" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GateMutationReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GateMutationReceipt_societyId_idempotencyKey_key" ON "GateMutationReceipt"("societyId", "idempotencyKey");
CREATE INDEX "GateMutationReceipt_societyId_gateId_createdAt_idx" ON "GateMutationReceipt"("societyId", "gateId", "createdAt");
CREATE INDEX "GateMutationReceipt_accessRequestId_createdAt_idx" ON "GateMutationReceipt"("accessRequestId", "createdAt");

ALTER TABLE "GateMutationReceipt" ADD CONSTRAINT "GateMutationReceipt_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GateMutationReceipt" ADD CONSTRAINT "GateMutationReceipt_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GateMutationReceipt" ADD CONSTRAINT "GateMutationReceipt_accessRequestId_fkey" FOREIGN KEY ("accessRequestId") REFERENCES "AccessRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
