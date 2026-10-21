-- CreateTable
CREATE TABLE "HelpdeskPhoto" (
    "id" UUID NOT NULL,
    "societyId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpdeskPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HelpdeskPhoto_storageKey_key" ON "HelpdeskPhoto"("storageKey");

-- CreateIndex
CREATE INDEX "HelpdeskPhoto_societyId_ticketId_createdAt_idx" ON "HelpdeskPhoto"("societyId", "ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HelpdeskPhoto_societyId_createdById_idempotencyKey_key" ON "HelpdeskPhoto"("societyId", "createdById", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "HelpdeskTicket_id_societyId_key" ON "HelpdeskTicket"("id", "societyId");

-- AddForeignKey
ALTER TABLE "HelpdeskPhoto" ADD CONSTRAINT "HelpdeskPhoto_ticketId_societyId_fkey" FOREIGN KEY ("ticketId", "societyId") REFERENCES "HelpdeskTicket"("id", "societyId") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "HelpdeskPhoto" ADD CONSTRAINT "HelpdeskPhoto_kind_check" CHECK ("kind" IN ('BEFORE','AFTER')),
 ADD CONSTRAINT "HelpdeskPhoto_size_check" CHECK ("sizeBytes">0 AND "sizeBytes"<=2097152),
 ADD CONSTRAINT "HelpdeskPhoto_digest_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
 ADD CONSTRAINT "HelpdeskPhoto_note_check" CHECK (length("note")<=200);

ALTER TABLE "HelpdeskActivity" DROP CONSTRAINT "HelpdeskActivity_type_check";
ALTER TABLE "HelpdeskActivity" ADD CONSTRAINT "HelpdeskActivity_type_check"
 CHECK ("type" IN ('CREATED','COMMENT','INTERNAL_NOTE','STATUS_CHANGED','REOPENED','ASSIGNED','ASSET_LINKED','ASSET_UNLINKED','PHOTO_ADDED'));

-- These existing marketplace tables use raw-SQL contracts rather than Prisma models.
-- No commercial policy is invented or backfilled for historical bookings.
ALTER TABLE "ServiceOfferingExperiencePolicy" ADD COLUMN "commercialTerms" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "ConsumerServiceBooking" ADD COLUMN "commercialTermsSnapshot" JSONB;
ALTER TABLE "ServiceOfferingExperiencePolicy" ADD CONSTRAINT "ServiceOfferingExperiencePolicy_terms_object" CHECK (jsonb_typeof("commercialTerms")='object');
CREATE FUNCTION preserve_consumer_booking_terms() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."commercialTermsSnapshot" IS DISTINCT FROM OLD."commercialTermsSnapshot" THEN
  RAISE EXCEPTION 'Recorded booking terms cannot be changed' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "ConsumerServiceBooking_preserve_terms" BEFORE UPDATE OF "commercialTermsSnapshot" ON "ConsumerServiceBooking"
 FOR EACH ROW EXECUTE FUNCTION preserve_consumer_booking_terms();
