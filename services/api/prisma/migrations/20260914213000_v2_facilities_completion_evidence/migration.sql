ALTER TABLE "FacilityWorkOrder"
  ADD CONSTRAINT "FacilityWorkOrder_completion_evidence_check"
  CHECK (
    "status" <> 'COMPLETED'
    OR (
      "completedAt" IS NOT NULL
      AND "completionNote" IS NOT NULL
      AND length(btrim("completionNote")) >= 5
    )
  ) NOT VALID;

COMMENT ON CONSTRAINT "FacilityWorkOrder_completion_evidence_check" ON "FacilityWorkOrder"
  IS 'New/updated completed work orders require timestamped completion evidence; legacy rows remain readable until separately remediated.';
