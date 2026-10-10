-- V4.90.18.8: independent *request for a bill* following explicit quote consent.
-- This is NOT an invoice, payment order, gateway intent, settlement or capture.
CREATE TABLE "ConsumerServiceExtraWorkBillingRequest" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "quoteId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceExtraWorkBillingRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerServiceExtraWorkBillingRequest_amount_check" CHECK ("amountPaise" BETWEEN 1 AND 100000000),
  CONSTRAINT "ConsumerServiceExtraWorkBillingRequest_status_check" CHECK ("status"='REQUESTED'),
  CONSTRAINT "ConsumerServiceExtraWorkBillingRequest_quote_unique" UNIQUE ("quoteId"),
  CONSTRAINT "ConsumerServiceExtraWorkBillingRequest_booking_fkey" FOREIGN KEY ("bookingId")
    REFERENCES "ConsumerServiceBooking"("id") ON DELETE RESTRICT,
  CONSTRAINT "ConsumerServiceExtraWorkBillingRequest_quote_fkey" FOREIGN KEY ("quoteId")
    REFERENCES "ConsumerServiceExtraWorkQuote"("id") ON DELETE RESTRICT,
  CONSTRAINT "ConsumerServiceExtraWorkBillingRequest_user_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "ConsumerServiceExtraWorkBillingRequest_provider_fkey" FOREIGN KEY ("providerId")
    REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT
);
CREATE INDEX "ConsumerServiceExtraWorkBillingRequest_owner_created_idx"
  ON "ConsumerServiceExtraWorkBillingRequest" ("userId","createdAt" DESC);
CREATE INDEX "ConsumerServiceExtraWorkBillingRequest_provider_created_idx"
  ON "ConsumerServiceExtraWorkBillingRequest" ("providerId","createdAt" DESC);
CREATE OR REPLACE FUNCTION "aaraagate_protect_extra_work_billing_request"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Extra-work separate bill request is immutable';
END;
$$;
CREATE TRIGGER "ConsumerServiceExtraWorkBillingRequest_immutable"
BEFORE UPDATE OR DELETE ON "ConsumerServiceExtraWorkBillingRequest"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_protect_extra_work_billing_request"();
