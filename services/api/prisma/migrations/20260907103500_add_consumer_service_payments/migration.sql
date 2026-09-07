CREATE TYPE "ConsumerServicePaymentStatus" AS ENUM (
  'CREATED',
  'PENDING',
  'CAPTURED',
  'FAILED',
  'REFUND_PENDING',
  'REFUNDED'
);

CREATE TABLE "ConsumerServicePayment" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "ConsumerServicePaymentStatus" NOT NULL DEFAULT 'CREATED',
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "grossAmountPaise" INTEGER NOT NULL,
  "platformFeePaise" INTEGER,
  "providerAmountPaise" INTEGER,
  "provider" TEXT,
  "providerOrderId" TEXT,
  "providerPaymentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "capturedAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  CONSTRAINT "ConsumerServicePayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerServicePayment_grossAmount_check" CHECK ("grossAmountPaise" >= 0),
  CONSTRAINT "ConsumerServicePayment_platformFee_check" CHECK ("platformFeePaise" IS NULL OR "platformFeePaise" >= 0),
  CONSTRAINT "ConsumerServicePayment_providerAmount_check" CHECK ("providerAmountPaise" IS NULL OR "providerAmountPaise" >= 0),
  CONSTRAINT "ConsumerServicePayment_split_pair_check" CHECK (("platformFeePaise" IS NULL) = ("providerAmountPaise" IS NULL)),
  CONSTRAINT "ConsumerServicePayment_split_sum_check" CHECK (
    "platformFeePaise" IS NULL OR "grossAmountPaise" = "platformFeePaise" + "providerAmountPaise"
  ),
  CONSTRAINT "ConsumerServicePayment_currency_check" CHECK ("currency" = 'INR')
);

CREATE UNIQUE INDEX "ConsumerServicePayment_user_booking_idempotency_key"
  ON "ConsumerServicePayment"("userId", "bookingId", "idempotencyKey");
CREATE INDEX "ConsumerServicePayment_user_createdAt_idx"
  ON "ConsumerServicePayment"("userId", "createdAt" DESC);
CREATE INDEX "ConsumerServicePayment_booking_status_idx"
  ON "ConsumerServicePayment"("bookingId", "status");
CREATE UNIQUE INDEX "ConsumerServicePayment_provider_order_key"
  ON "ConsumerServicePayment"("provider", "providerOrderId")
  WHERE "provider" IS NOT NULL AND "providerOrderId" IS NOT NULL;

ALTER TABLE "ConsumerServicePayment"
  ADD CONSTRAINT "ConsumerServicePayment_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "ConsumerServiceBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerServicePayment"
  ADD CONSTRAINT "ConsumerServicePayment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ConsumerServicePaymentEvent" (
  "id" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "actorUserId" UUID,
  "type" TEXT NOT NULL,
  "fromStatus" "ConsumerServicePaymentStatus",
  "toStatus" "ConsumerServicePaymentStatus",
  "providerEventId" TEXT,
  "providerReference" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServicePaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsumerServicePaymentEvent_payment_time_idx"
  ON "ConsumerServicePaymentEvent"("paymentId", "occurredAt");
CREATE UNIQUE INDEX "ConsumerServicePaymentEvent_provider_event_key"
  ON "ConsumerServicePaymentEvent"("providerEventId")
  WHERE "providerEventId" IS NOT NULL;

ALTER TABLE "ConsumerServicePaymentEvent"
  ADD CONSTRAINT "ConsumerServicePaymentEvent_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "ConsumerServicePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsumerServicePaymentEvent"
  ADD CONSTRAINT "ConsumerServicePaymentEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
