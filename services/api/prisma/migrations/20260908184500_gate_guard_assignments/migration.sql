CREATE TABLE "GateGuardAssignment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "gateId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "effectiveFrom" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMPTZ(6),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GateGuardAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GateGuardAssignment_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GateGuardAssignment_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GateGuardAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "GateGuardAssignment_society_gate_active_idx"
  ON "GateGuardAssignment"("societyId", "gateId", "active", "effectiveFrom", "effectiveTo");
CREATE INDEX "GateGuardAssignment_society_user_active_idx"
  ON "GateGuardAssignment"("societyId", "userId", "active", "effectiveFrom", "effectiveTo");
CREATE UNIQUE INDEX "GateGuardAssignment_active_gate_user_key"
  ON "GateGuardAssignment"("societyId", "gateId", "userId") WHERE "active" = true;
