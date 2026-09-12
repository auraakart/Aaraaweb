-- Aaraagate V2 provider-neutral payment reconciliation foundation.
-- Gateway/provider state is evidence about transaction processing; it is not accounting truth.

CREATE TYPE "GatewayOperationType" AS ENUM ('STATUS_QUERY', 'REFUND');
CREATE TYPE "GatewayOperationStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'SETTLED', 'FAILED', 'UNKNOWN');
CREATE TYPE "PaymentReconciliationStatus" AS ENUM ('PENDING', 'MATCHED', 'MISMATCH', 'ACTION_REQUIRED', 'RESOLVED');

CREATE TABLE "PaymentGatewayOperation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "operationType" "GatewayOperationType" NOT NULL,
  "status" "GatewayOperationStatus" NOT NULL DEFAULT 'REQUESTED',
  "provider" TEXT NOT NULL,
  "providerOperationId" TEXT,
  "amountPaise" BIGINT,
  "idempotencyKey" TEXT NOT NULL,
  "requestedByUserId" UUID,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "requestedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentGatewayOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentGatewayOperation_amount_check" CHECK ("amountPaise" IS NULL OR "amountPaise" > 0),
  CONSTRAINT "PaymentGatewayOperation_refund_amount_check" CHECK (
    ("operationType" = 'REFUND' AND "amountPaise" IS NOT NULL)
    OR ("operationType" <> 'REFUND')
  )
);

CREATE UNIQUE INDEX "PaymentGatewayOperation_society_idempotency_key"
  ON "PaymentGatewayOperation"("societyId", "idempotencyKey");
CREATE UNIQUE INDEX "PaymentGatewayOperation_provider_operation_key"
  ON "PaymentGatewayOperation"("provider", "providerOperationId")
  WHERE "providerOperationId" IS NOT NULL;
CREATE INDEX "PaymentGatewayOperation_society_payment_idx"
  ON "PaymentGatewayOperation"("societyId", "paymentId", "createdAt" DESC);
CREATE UNIQUE INDEX "PaymentGatewayOperation_id_society_key"
  ON "PaymentGatewayOperation"("id", "societyId");

ALTER TABLE "PaymentGatewayOperation"
  ADD CONSTRAINT "PaymentGatewayOperation_society_fkey"
    FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "PaymentGatewayOperation_payment_society_fkey"
    FOREIGN KEY ("paymentId", "societyId") REFERENCES "Payment"("id", "societyId") ON DELETE RESTRICT,
  ADD CONSTRAINT "PaymentGatewayOperation_requested_by_fkey"
    FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;

CREATE TABLE "PaymentReconciliationCase" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "status" "PaymentReconciliationStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "observedProviderStatus" TEXT,
  "observedAmountPaise" BIGINT,
  "expectedCapturedPaise" BIGINT NOT NULL,
  "expectedRefundedPaise" BIGINT NOT NULL DEFAULT 0,
  "reason" TEXT,
  "lastCheckedAt" TIMESTAMPTZ(6),
  "resolvedByUserId" UUID,
  "resolvedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentReconciliationCase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentReconciliationCase_expected_check" CHECK (
    "expectedCapturedPaise" >= 0 AND "expectedRefundedPaise" >= 0
  ),
  CONSTRAINT "PaymentReconciliationCase_observed_check" CHECK (
    "observedAmountPaise" IS NULL OR "observedAmountPaise" >= 0
  ),
  CONSTRAINT "PaymentReconciliationCase_resolution_check" CHECK (
    ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL)
    OR ("status" <> 'RESOLVED')
  )
);

CREATE UNIQUE INDEX "PaymentReconciliationCase_open_payment_key"
  ON "PaymentReconciliationCase"("societyId", "paymentId")
  WHERE "status" <> 'RESOLVED';
CREATE INDEX "PaymentReconciliationCase_society_status_idx"
  ON "PaymentReconciliationCase"("societyId", "status", "updatedAt" DESC);

ALTER TABLE "PaymentReconciliationCase"
  ADD CONSTRAINT "PaymentReconciliationCase_society_fkey"
    FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "PaymentReconciliationCase_payment_society_fkey"
    FOREIGN KEY ("paymentId", "societyId") REFERENCES "Payment"("id", "societyId") ON DELETE RESTRICT,
  ADD CONSTRAINT "PaymentReconciliationCase_resolved_by_fkey"
    FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;

-- Gateway-operation history is append-only with respect to identity/economics.
-- Status and provider evidence may advance as asynchronous provider responses arrive.
CREATE OR REPLACE FUNCTION "aaraagate_protect_gateway_operation_economics"() RETURNS trigger AS $$
BEGIN
  IF NEW."societyId" IS DISTINCT FROM OLD."societyId"
     OR NEW."paymentId" IS DISTINCT FROM OLD."paymentId"
     OR NEW."operationType" IS DISTINCT FROM OLD."operationType"
     OR NEW."provider" IS DISTINCT FROM OLD."provider"
     OR NEW."amountPaise" IS DISTINCT FROM OLD."amountPaise"
     OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
  THEN
    RAISE EXCEPTION 'Gateway operation identity and economics are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PaymentGatewayOperation_economics_immutable"
BEFORE UPDATE ON "PaymentGatewayOperation"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_protect_gateway_operation_economics"();

CREATE OR REPLACE FUNCTION "aaraagate_prevent_gateway_operation_delete"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Gateway operation history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PaymentGatewayOperation_no_delete"
BEFORE DELETE ON "PaymentGatewayOperation"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_prevent_gateway_operation_delete"();
