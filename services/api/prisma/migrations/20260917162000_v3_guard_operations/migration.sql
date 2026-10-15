-- Aaraagate V3.3 Guard App 2.0 operational foundation.
-- These records are society scoped and append/audit oriented; existing AccessRequest
-- remains the authority for visitor entry/exit and is not rewritten by this module.

CREATE TABLE "GuardWatchlistEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "subjectName" TEXT NOT NULL,
  "phone" TEXT,
  "vehicleNumber" TEXT,
  "reason" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMPTZ(6),
  "validUntil" TIMESTAMPTZ(6),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuardWatchlistEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuardWatchlistEntry_kind_valid" CHECK ("kind" IN ('WATCH','DENY','INFO')),
  CONSTRAINT "GuardWatchlistEntry_window_valid" CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" > "validFrom")
);
CREATE INDEX "GuardWatchlistEntry_society_active_idx" ON "GuardWatchlistEntry" ("societyId","active","updatedAt" DESC);
CREATE INDEX "GuardWatchlistEntry_society_vehicle_idx" ON "GuardWatchlistEntry" ("societyId","vehicleNumber") WHERE "vehicleNumber" IS NOT NULL;
ALTER TABLE "GuardWatchlistEntry" ADD CONSTRAINT "GuardWatchlistEntry_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuardWatchlistEntry" ADD CONSTRAINT "GuardWatchlistEntry_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MaterialGatePass" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "gateId" UUID,
  "unitId" UUID,
  "referenceCode" TEXT NOT NULL,
  "movementType" TEXT NOT NULL,
  "subjectName" TEXT NOT NULL,
  "itemDescription" TEXT NOT NULL,
  "vehicleNumber" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "validFrom" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMPTZ(6),
  "createdByUserId" UUID NOT NULL,
  "processedByUserId" UUID,
  "processedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MaterialGatePass_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MaterialGatePass_movement_valid" CHECK ("movementType" IN ('MATERIAL_IN','MATERIAL_OUT','MOVE_IN','MOVE_OUT')),
  CONSTRAINT "MaterialGatePass_status_valid" CHECK ("status" IN ('OPEN','PROCESSED','CANCELLED')),
  CONSTRAINT "MaterialGatePass_window_valid" CHECK ("validUntil" IS NULL OR "validUntil" > "validFrom")
);
CREATE UNIQUE INDEX "MaterialGatePass_society_reference_key" ON "MaterialGatePass" ("societyId","referenceCode");
CREATE INDEX "MaterialGatePass_society_status_valid_idx" ON "MaterialGatePass" ("societyId","status","validUntil");
ALTER TABLE "MaterialGatePass" ADD CONSTRAINT "MaterialGatePass_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialGatePass" ADD CONSTRAINT "MaterialGatePass_gate_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialGatePass" ADD CONSTRAINT "MaterialGatePass_unit_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialGatePass" ADD CONSTRAINT "MaterialGatePass_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialGatePass" ADD CONSTRAINT "MaterialGatePass_processor_fkey" FOREIGN KEY ("processedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PatrolCheckpoint" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "location" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatrolCheckpoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PatrolCheckpoint_society_code_key" ON "PatrolCheckpoint" ("societyId","code");
CREATE INDEX "PatrolCheckpoint_society_active_idx" ON "PatrolCheckpoint" ("societyId","active","name");
ALTER TABLE "PatrolCheckpoint" ADD CONSTRAINT "PatrolCheckpoint_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatrolCheckpoint" ADD CONSTRAINT "PatrolCheckpoint_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PatrolScan" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "checkpointId" UUID NOT NULL,
  "guardUserId" UUID NOT NULL,
  "gateId" UUID,
  "scannedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  CONSTRAINT "PatrolScan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PatrolScan_society_scanned_idx" ON "PatrolScan" ("societyId","scannedAt" DESC);
CREATE INDEX "PatrolScan_checkpoint_scanned_idx" ON "PatrolScan" ("checkpointId","scannedAt" DESC);
ALTER TABLE "PatrolScan" ADD CONSTRAINT "PatrolScan_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatrolScan" ADD CONSTRAINT "PatrolScan_checkpoint_fkey" FOREIGN KEY ("checkpointId") REFERENCES "PatrolCheckpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatrolScan" ADD CONSTRAINT "PatrolScan_guard_fkey" FOREIGN KEY ("guardUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatrolScan" ADD CONSTRAINT "PatrolScan_gate_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SecurityIncident" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "gateId" UUID,
  "guardUserId" UUID NOT NULL,
  "severity" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "mediaRefs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedByUserId" UUID,
  "reviewedAt" TIMESTAMPTZ(6),
  "resolution" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SecurityIncident_severity_valid" CHECK ("severity" IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  CONSTRAINT "SecurityIncident_status_valid" CHECK ("status" IN ('OPEN','REVIEWED','CLOSED'))
);
CREATE INDEX "SecurityIncident_society_status_idx" ON "SecurityIncident" ("societyId","status","occurredAt" DESC);
ALTER TABLE "SecurityIncident" ADD CONSTRAINT "SecurityIncident_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecurityIncident" ADD CONSTRAINT "SecurityIncident_gate_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityIncident" ADD CONSTRAINT "SecurityIncident_guard_fkey" FOREIGN KEY ("guardUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SecurityIncident" ADD CONSTRAINT "SecurityIncident_reviewer_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
