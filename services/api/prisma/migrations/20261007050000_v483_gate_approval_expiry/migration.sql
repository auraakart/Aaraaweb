ALTER TABLE "UnitOccupancy"
  ADD COLUMN "gateApprovalExpiresAt" TIMESTAMPTZ;

CREATE INDEX "UnitOccupancy_gate_approval_expiry_idx"
  ON "UnitOccupancy"("societyId","unitId","gateApprovalEnabled","gateApprovalExpiresAt")
  WHERE "active"=TRUE;
