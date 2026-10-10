-- V4.90.18.2: explicit resident acceptance of provider extra-work quotes.
-- Consent evidence only: no automatic booking repricing or payment.
CREATE TABLE "ConsumerServiceExtraWorkQuote" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "scopeDescription" TEXT NOT NULL,
  "amountPaise" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdByUserId" UUID NOT NULL,
  "respondedByUserId" UUID,
  "responseReason" TEXT,
  "respondedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceExtraWorkQuote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerServiceExtraWorkQuote_scope_check" CHECK
    (char_length(btrim("scopeDescription")) BETWEEN 10 AND 1500),
  CONSTRAINT "ConsumerServiceExtraWorkQuote_amount_check" CHECK ("amountPaise" BETWEEN 1 AND 100000000),
  CONSTRAINT "ConsumerServiceExtraWorkQuote_status_check" CHECK ("status" IN ('PENDING','APPROVED','DECLINED')),
  CONSTRAINT "ConsumerServiceExtraWorkQuote_response_check" CHECK (
    ("status"='PENDING' AND "respondedByUserId" IS NULL AND "respondedAt" IS NULL AND "responseReason" IS NULL)
    OR ("status"='APPROVED' AND "respondedByUserId" IS NOT NULL AND "respondedAt" IS NOT NULL AND "responseReason" IS NULL)
    OR ("status"='DECLINED' AND "respondedByUserId" IS NOT NULL AND "respondedAt" IS NOT NULL
        AND length(btrim("responseReason")) BETWEEN 3 AND 500)
  )
);
CREATE UNIQUE INDEX "ConsumerServiceExtraWorkQuote_one_pending"
  ON "ConsumerServiceExtraWorkQuote" ("bookingId") WHERE "status"='PENDING';
CREATE INDEX "ConsumerServiceExtraWorkQuote_booking_created_idx"
  ON "ConsumerServiceExtraWorkQuote" ("bookingId","createdAt" DESC);
ALTER TABLE "ConsumerServiceExtraWorkQuote"
  ADD CONSTRAINT "ConsumerServiceExtraWorkQuote_booking_fkey" FOREIGN KEY ("bookingId")
    REFERENCES "ConsumerServiceBooking"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ConsumerServiceExtraWorkQuote_provider_fkey" FOREIGN KEY ("providerId")
    REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ConsumerServiceExtraWorkQuote_creator_fkey" FOREIGN KEY ("createdByUserId")
    REFERENCES "User"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "ConsumerServiceExtraWorkQuote_responder_fkey" FOREIGN KEY ("respondedByUserId")
    REFERENCES "User"("id") ON DELETE RESTRICT;
CREATE OR REPLACE FUNCTION "aaraagate_guard_extra_work_quote_evidence"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Extra work quotation evidence cannot be deleted'; END IF;
  IF OLD."status"<>'PENDING'
    OR NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."bookingId" IS DISTINCT FROM OLD."bookingId"
    OR NEW."providerId" IS DISTINCT FROM OLD."providerId"
    OR NEW."scopeDescription" IS DISTINCT FROM OLD."scopeDescription"
    OR NEW."amountPaise" IS DISTINCT FROM OLD."amountPaise"
    OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
  THEN RAISE EXCEPTION 'Extra work quotation scope and price are immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ConsumerServiceExtraWorkQuote_protect"
BEFORE UPDATE OR DELETE ON "ConsumerServiceExtraWorkQuote"
FOR EACH ROW EXECUTE FUNCTION "aaraagate_guard_extra_work_quote_evidence"();
