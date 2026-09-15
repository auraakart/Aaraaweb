ALTER TABLE "MaintenanceInvoice"
  ADD COLUMN "sourceUtilityChargeDraftId" UUID REFERENCES "UtilityChargeDraft"("id") ON DELETE RESTRICT;

CREATE UNIQUE INDEX "MaintenanceInvoice_utility_charge_draft_key"
  ON "MaintenanceInvoice"("sourceUtilityChargeDraftId")
  WHERE "sourceUtilityChargeDraftId" IS NOT NULL;

ALTER TABLE "UtilityChargeDraft" DROP CONSTRAINT "UtilityChargeDraft_status_check";
ALTER TABLE "UtilityChargeDraft"
  ADD CONSTRAINT "UtilityChargeDraft_status_check" CHECK ("status" IN ('DRAFT','ISSUED','VOID'));

ALTER TABLE "UtilityChargeDraft"
  ADD COLUMN "issuedByUserId" UUID REFERENCES "User"("id"),
  ADD COLUMN "issuedAt" TIMESTAMPTZ;

ALTER TABLE "UtilityChargeEvent" DROP CONSTRAINT "UtilityChargeEvent_action_check";
ALTER TABLE "UtilityChargeEvent"
  ADD CONSTRAINT "UtilityChargeEvent_action_check" CHECK ("action" IN ('DRAFT_CREATED','DRAFT_ISSUED','DRAFT_VOIDED'));
