CREATE TABLE "ConsumerServiceWarrantySnapshot" (
  "bookingId" UUID NOT NULL,
  "warrantyDays" INTEGER,
  "revisitPolicy" TEXT,
  "warrantyStartedAt" TIMESTAMPTZ(6) NOT NULL,
  "warrantyUntil" TIMESTAMPTZ(6),
  "capturedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConsumerServiceWarrantySnapshot_pkey" PRIMARY KEY ("bookingId"),
  CONSTRAINT "ConsumerServiceWarrantySnapshot_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "ConsumerServiceBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsumerServiceWarrantySnapshot_warrantyDays_check"
    CHECK ("warrantyDays" IS NULL OR ("warrantyDays" >= 1 AND "warrantyDays" <= 3650)),
  CONSTRAINT "ConsumerServiceWarrantySnapshot_warrantyUntil_check"
    CHECK ("warrantyUntil" IS NULL OR "warrantyUntil" >= "warrantyStartedAt")
);

CREATE INDEX "ConsumerServiceWarrantySnapshot_warrantyUntil_idx"
  ON "ConsumerServiceWarrantySnapshot"("warrantyUntil");

CREATE OR REPLACE FUNCTION prevent_consumer_service_warranty_snapshot_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ConsumerServiceWarrantySnapshot is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ConsumerServiceWarrantySnapshot_no_update"
BEFORE UPDATE ON "ConsumerServiceWarrantySnapshot"
FOR EACH ROW EXECUTE FUNCTION prevent_consumer_service_warranty_snapshot_mutation();

CREATE TRIGGER "ConsumerServiceWarrantySnapshot_no_delete"
BEFORE DELETE ON "ConsumerServiceWarrantySnapshot"
FOR EACH ROW EXECUTE FUNCTION prevent_consumer_service_warranty_snapshot_mutation();
