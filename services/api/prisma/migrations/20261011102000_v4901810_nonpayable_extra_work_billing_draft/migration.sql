-- V4.90.18.10 — a provider-prepared NON-PAYABLE extra-work billing draft.
-- No tax invoice number, GST determination, payment authorization or receivable recognition.
CREATE TABLE "ConsumerServiceExtraWorkBillingDraft" (
  "id" UUID NOT NULL,
  "billingRequestId" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "quoteId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceExtraWorkBillingDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerServiceExtraWorkBillingDraft_request_unique" UNIQUE ("billingRequestId"),
  CONSTRAINT "ConsumerServiceExtraWorkBillingDraft_amount_check" CHECK ("amountPaise" BETWEEN 1 AND 100000000),
  CONSTRAINT "ConsumerServiceExtraWorkBillingDraft_currency_check" CHECK ("currency"='INR'),
  CONSTRAINT "ConsumerServiceExtraWorkBillingDraft_status_check" CHECK ("status"='DRAFT'),
  CONSTRAINT "ConsumerServiceExtraWorkBillingDraft_request_fkey" FOREIGN KEY ("billingRequestId")
    REFERENCES "ConsumerServiceExtraWorkBillingRequest"("id") ON DELETE RESTRICT,
  CONSTRAINT "ConsumerServiceExtraWorkBillingDraft_booking_fkey" FOREIGN KEY ("bookingId")
    REFERENCES "ConsumerServiceBooking"("id") ON DELETE RESTRICT,
  CONSTRAINT "ConsumerServiceExtraWorkBillingDraft_quote_fkey" FOREIGN KEY ("quoteId")
    REFERENCES "ConsumerServiceExtraWorkQuote"("id") ON DELETE RESTRICT,
  CONSTRAINT "ConsumerServiceExtraWorkBillingDraft_provider_fkey" FOREIGN KEY ("providerId")
    REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT,
  CONSTRAINT "ConsumerServiceExtraWorkBillingDraft_user_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE INDEX "ConsumerServiceExtraWorkBillingDraft_owner_created_idx"
  ON "ConsumerServiceExtraWorkBillingDraft" ("userId","createdAt" DESC);
CREATE INDEX "ConsumerServiceExtraWorkBillingDraft_provider_created_idx"
  ON "ConsumerServiceExtraWorkBillingDraft" ("providerId","createdAt" DESC);
CREATE OR REPLACE FUNCTION "aaraagate_protect_extra_work_billing_draft"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Separate extra-work billing draft is immutable';
END;
$$;
CREATE TRIGGER "ConsumerServiceExtraWorkBillingDraft_immutable"
BEFORE UPDATE OR DELETE ON "ConsumerServiceExtraWorkBillingDraft"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_protect_extra_work_billing_draft"();
