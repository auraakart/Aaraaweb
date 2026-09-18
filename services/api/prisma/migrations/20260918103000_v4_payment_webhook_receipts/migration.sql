CREATE TABLE "PaymentWebhookReceipt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "providerOrderId" TEXT NOT NULL,
  "providerPaymentId" TEXT NOT NULL,
  "eventStatus" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadDigest" VARCHAR(64) NOT NULL,
  "processingStatus" TEXT NOT NULL DEFAULT 'RECEIVED',
  "receiveCount" INTEGER NOT NULL DEFAULT 1,
  "lastReceivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMPTZ(6),
  "lastError" VARCHAR(500),
  "replayCount" INTEGER NOT NULL DEFAULT 0,
  "lastReplayedAt" TIMESTAMPTZ(6),
  "lastReplayedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentWebhookReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentWebhookReceipt_status_check" CHECK ("eventStatus" IN ('CAPTURED','FAILED','REFUNDED')),
  CONSTRAINT "PaymentWebhookReceipt_processing_check" CHECK ("processingStatus" IN ('RECEIVED','PROCESSED','FAILED')),
  CONSTRAINT "PaymentWebhookReceipt_receive_count_check" CHECK ("receiveCount" >= 1),
  CONSTRAINT "PaymentWebhookReceipt_replay_count_check" CHECK ("replayCount" >= 0),
  CONSTRAINT "PaymentWebhookReceipt_digest_check" CHECK ("payloadDigest" ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX "PaymentWebhookReceipt_event_key"
  ON "PaymentWebhookReceipt" ("providerEventId");
CREATE INDEX "PaymentWebhookReceipt_society_status_idx"
  ON "PaymentWebhookReceipt" ("societyId","processingStatus","createdAt" DESC);
CREATE INDEX "PaymentWebhookReceipt_payment_idx"
  ON "PaymentWebhookReceipt" ("paymentId","createdAt" DESC);

ALTER TABLE "PaymentWebhookReceipt"
  ADD CONSTRAINT "PaymentWebhookReceipt_society_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentWebhookReceipt_payment_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PaymentWebhookReceipt_replayed_by_fkey"
  FOREIGN KEY ("lastReplayedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
