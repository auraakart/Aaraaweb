-- V2.3 connector operations: append-only manual retry evidence.
-- Delivery state remains tenant-scoped; manual actions are recorded separately
-- so operational intervention never overwrites the prior delivery evidence.

CREATE UNIQUE INDEX IF NOT EXISTS "AccountingConnectorDelivery_id_society_key"
  ON "AccountingConnectorDelivery"("id", "societyId");

CREATE TABLE "AccountingConnectorDeliveryAction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "deliveryId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "fromStatus" VARCHAR(20) NOT NULL,
  "previousAttemptCount" INTEGER NOT NULL,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountingConnectorDeliveryAction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountingConnectorDeliveryAction_action_valid" CHECK ("action" IN ('MANUAL_RETRY')),
  CONSTRAINT "AccountingConnectorDeliveryAction_from_status_valid" CHECK ("fromStatus" IN ('FAILED','UNKNOWN')),
  CONSTRAINT "AccountingConnectorDeliveryAction_attempt_count_valid" CHECK ("previousAttemptCount" >= 0)
);

CREATE INDEX "AccountingConnectorDeliveryAction_society_time_idx"
  ON "AccountingConnectorDeliveryAction"("societyId", "occurredAt" DESC);
CREATE INDEX "AccountingConnectorDeliveryAction_delivery_time_idx"
  ON "AccountingConnectorDeliveryAction"("deliveryId", "occurredAt" DESC);

ALTER TABLE "AccountingConnectorDeliveryAction"
  ADD CONSTRAINT "AccountingConnectorDeliveryAction_society_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingConnectorDeliveryAction"
  ADD CONSTRAINT "AccountingConnectorDeliveryAction_delivery_fkey"
  FOREIGN KEY ("deliveryId", "societyId") REFERENCES "AccountingConnectorDelivery"("id", "societyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountingConnectorDeliveryAction"
  ADD CONSTRAINT "AccountingConnectorDeliveryAction_actor_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
