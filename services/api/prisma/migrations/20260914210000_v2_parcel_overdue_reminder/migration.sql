ALTER TABLE "ParcelEvent" DROP CONSTRAINT "ParcelEvent_action_check";
ALTER TABLE "ParcelEvent"
  ADD CONSTRAINT "ParcelEvent_action_check"
  CHECK ("action" IN ('RECEIVED','COLLECTED','RETURNED','PICKUP_CODE_ISSUED','PICKUP_CODE_FAILED','PICKUP_CODE_LOCKED','PICKUP_CODE_VERIFIED','REMINDER_SENT'));

CREATE INDEX "ParcelEvent_reminder_rate_idx"
  ON "ParcelEvent"("parcelId","occurredAt" DESC)
  WHERE "action"='REMINDER_SENT';
