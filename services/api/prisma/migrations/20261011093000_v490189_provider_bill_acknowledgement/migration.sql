-- V4.90.18.9 — Provider acknowledgement of a resident-issued separate BILL REQUEST.
-- This receipt is NOT an invoice, payment authorization, gateway order, or tax document.
CREATE TABLE "ConsumerServiceExtraWorkBillAcknowledgement" (
  "id" UUID NOT NULL,
  "billingRequestId" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceExtraWorkBillAcknowledgement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerServiceExtraWorkBillAcknowledgement_request_unique" UNIQUE ("billingRequestId"),
  CONSTRAINT "ConsumerServiceExtraWorkBillAcknowledgement_request_fkey" FOREIGN KEY ("billingRequestId")
    REFERENCES "ConsumerServiceExtraWorkBillingRequest"("id") ON DELETE RESTRICT,
  CONSTRAINT "ConsumerServiceExtraWorkBillAcknowledgement_booking_fkey" FOREIGN KEY ("bookingId")
    REFERENCES "ConsumerServiceBooking"("id") ON DELETE RESTRICT,
  CONSTRAINT "ConsumerServiceExtraWorkBillAcknowledgement_provider_fkey" FOREIGN KEY ("providerId")
    REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT
);
CREATE INDEX "ConsumerServiceExtraWorkBillAcknowledgement_provider_created_idx"
  ON "ConsumerServiceExtraWorkBillAcknowledgement" ("providerId", "createdAt" DESC);
CREATE OR REPLACE FUNCTION "aaraagate_guard_extra_work_bill_ack"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Extra-work bill acknowledgement is immutable';
END;
$$;
CREATE TRIGGER "ConsumerServiceExtraWorkBillAcknowledgement_immutable"
BEFORE UPDATE OR DELETE ON "ConsumerServiceExtraWorkBillAcknowledgement"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_guard_extra_work_bill_ack"();
