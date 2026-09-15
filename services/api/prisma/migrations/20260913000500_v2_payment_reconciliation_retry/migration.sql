-- Durable retry state for provider-neutral payment gateway operations.
ALTER TABLE "PaymentGatewayOperation"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt" TIMESTAMPTZ(6),
  ADD COLUMN "nextAttemptAt" TIMESTAMPTZ(6);

ALTER TABLE "PaymentGatewayOperation"
  ADD CONSTRAINT "PaymentGatewayOperation_attempt_count_check" CHECK ("attemptCount" >= 0);

CREATE INDEX "PaymentGatewayOperation_retry_due_idx"
  ON "PaymentGatewayOperation"("status", "nextAttemptAt", "createdAt")
  WHERE "status" IN ('REQUESTED','UNKNOWN');

-- Retry bookkeeping is operational metadata. Existing economics/identity immutability trigger remains authoritative.
