ALTER TABLE "ConsumerProviderCommercialProfile"
  ADD COLUMN "settlementCommissionBps" INTEGER;

ALTER TABLE "ConsumerProviderCommercialProfile"
  ADD CONSTRAINT "ConsumerProviderCommercialProfile_settlementCommissionBps_check"
  CHECK ("settlementCommissionBps" IS NULL OR ("settlementCommissionBps" >= 0 AND "settlementCommissionBps" <= 10000));

CREATE TABLE "ConsumerProviderSettlementBatch" (
  "id" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "grossAmountPaise" BIGINT NOT NULL DEFAULT 0,
  "platformFeePaise" BIGINT NOT NULL DEFAULT 0,
  "providerAmountPaise" BIGINT NOT NULL DEFAULT 0,
  "createdByUserId" UUID NOT NULL,
  "approvedByUserId" UUID,
  "approvedAt" TIMESTAMPTZ(6),
  "paidByUserId" UUID,
  "paidAt" TIMESTAMPTZ(6),
  "paymentReference" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerProviderSettlementBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerProviderSettlementBatch_status_check" CHECK ("status" IN ('DRAFT','APPROVED','PAID','CANCELLED')),
  CONSTRAINT "ConsumerProviderSettlementBatch_currency_check" CHECK ("currency"='INR'),
  CONSTRAINT "ConsumerProviderSettlementBatch_amounts_check" CHECK (
    "grossAmountPaise">=0 AND "platformFeePaise">=0 AND "providerAmountPaise">=0
    AND "grossAmountPaise"="platformFeePaise"+"providerAmountPaise"
  ),
  CONSTRAINT "ConsumerProviderSettlementBatch_paid_reference_check" CHECK (
    "status"<>'PAID' OR ("paidAt" IS NOT NULL AND "paidByUserId" IS NOT NULL AND length(trim(COALESCE("paymentReference",'')))>=3)
  )
);

CREATE TABLE "ConsumerProviderSettlementEntry" (
  "id" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "grossAmountPaise" INTEGER NOT NULL,
  "platformFeePaise" INTEGER NOT NULL,
  "providerAmountPaise" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "capturedAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerProviderSettlementEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerProviderSettlementEntry_amounts_check" CHECK (
    "grossAmountPaise">=0 AND "platformFeePaise">=0 AND "providerAmountPaise">=0
    AND "grossAmountPaise"="platformFeePaise"+"providerAmountPaise"
  ),
  CONSTRAINT "ConsumerProviderSettlementEntry_currency_check" CHECK ("currency"='INR')
);

CREATE UNIQUE INDEX "ConsumerProviderSettlementEntry_payment_key"
  ON "ConsumerProviderSettlementEntry"("paymentId");
CREATE INDEX "ConsumerProviderSettlementBatch_provider_status_created_idx"
  ON "ConsumerProviderSettlementBatch"("providerId","status","createdAt" DESC);
CREATE INDEX "ConsumerProviderSettlementEntry_batch_idx"
  ON "ConsumerProviderSettlementEntry"("batchId","createdAt");

ALTER TABLE "ConsumerProviderSettlementBatch"
  ADD CONSTRAINT "ConsumerProviderSettlementBatch_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerProviderSettlementBatch"
  ADD CONSTRAINT "ConsumerProviderSettlementBatch_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerProviderSettlementBatch"
  ADD CONSTRAINT "ConsumerProviderSettlementBatch_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerProviderSettlementBatch"
  ADD CONSTRAINT "ConsumerProviderSettlementBatch_paidByUserId_fkey"
  FOREIGN KEY ("paidByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsumerProviderSettlementEntry"
  ADD CONSTRAINT "ConsumerProviderSettlementEntry_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "ConsumerProviderSettlementBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerProviderSettlementEntry"
  ADD CONSTRAINT "ConsumerProviderSettlementEntry_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerProviderSettlementEntry"
  ADD CONSTRAINT "ConsumerProviderSettlementEntry_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "ConsumerServicePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerProviderSettlementEntry"
  ADD CONSTRAINT "ConsumerProviderSettlementEntry_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "ConsumerServiceBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE TABLE "ConsumerProviderSettlementEvent" (
  "id" UUID NOT NULL,
  "batchId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "reference" TEXT,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerProviderSettlementEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerProviderSettlementEvent_type_check" CHECK ("eventType" IN ('CREATED','APPROVED','PAID','CANCELLED'))
);
CREATE INDEX "ConsumerProviderSettlementEvent_batch_time_idx"
  ON "ConsumerProviderSettlementEvent"("batchId","occurredAt");
ALTER TABLE "ConsumerProviderSettlementEvent"
  ADD CONSTRAINT "ConsumerProviderSettlementEvent_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "ConsumerProviderSettlementBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerProviderSettlementEvent"
  ADD CONSTRAINT "ConsumerProviderSettlementEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE TABLE "ConsumerProviderSettlementRecovery" (
  "id" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "settlementEntryId" UUID NOT NULL,
  "providerAmountPaise" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "reason" TEXT NOT NULL,
  "resolvedReference" TEXT,
  "resolvedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(6),
  CONSTRAINT "ConsumerProviderSettlementRecovery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerProviderSettlementRecovery_status_check" CHECK ("status" IN ('OPEN','RESOLVED')),
  CONSTRAINT "ConsumerProviderSettlementRecovery_amount_check" CHECK ("providerAmountPaise">=0),
  CONSTRAINT "ConsumerProviderSettlementRecovery_resolved_check" CHECK (
    "status"<>'RESOLVED' OR ("resolvedAt" IS NOT NULL AND length(trim(COALESCE("resolvedReference",'')))>=3)
  )
);
CREATE UNIQUE INDEX "ConsumerProviderSettlementRecovery_payment_key"
  ON "ConsumerProviderSettlementRecovery"("paymentId");
CREATE INDEX "ConsumerProviderSettlementRecovery_provider_status_idx"
  ON "ConsumerProviderSettlementRecovery"("providerId","status","createdAt" DESC);
ALTER TABLE "ConsumerProviderSettlementRecovery"
  ADD CONSTRAINT "ConsumerProviderSettlementRecovery_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerProviderSettlementRecovery"
  ADD CONSTRAINT "ConsumerProviderSettlementRecovery_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "ConsumerServicePayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerProviderSettlementRecovery"
  ADD CONSTRAINT "ConsumerProviderSettlementRecovery_settlementEntryId_fkey"
  FOREIGN KEY ("settlementEntryId") REFERENCES "ConsumerProviderSettlementEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsumerProviderSettlementRecovery"
  ADD CONSTRAINT "ConsumerProviderSettlementRecovery_resolvedByUserId_fkey"
  FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
