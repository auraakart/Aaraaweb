CREATE TABLE "GuardShiftHandover" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "gateId" UUID,
  "outgoingGuardUserId" UUID NOT NULL,
  "incomingGuardUserId" UUID,
  "summary" TEXT NOT NULL,
  "openItems" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status" VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedByUserId" UUID,
  "acknowledgedAt" TIMESTAMPTZ,
  CONSTRAINT "GuardShiftHandover_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuardShiftHandover_status_check" CHECK ("status" IN ('OPEN','ACKNOWLEDGED')),
  CONSTRAINT "GuardShiftHandover_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GuardShiftHandover_gate_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "GuardShiftHandover_outgoing_fkey" FOREIGN KEY ("outgoingGuardUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GuardShiftHandover_incoming_fkey" FOREIGN KEY ("incomingGuardUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GuardShiftHandover_acknowledged_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "GuardShiftHandover_society_status_created_idx"
  ON "GuardShiftHandover" ("societyId", "status", "createdAt" DESC);
