-- Defense-in-depth tenant isolation for receivable-to-payment allocations.
-- PostgreSQL requires a unique target key for the composite FK.
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_id_society_key" ON "Payment" ("id", "societyId");

ALTER TABLE "ReceivableAllocation"
  DROP CONSTRAINT "ReceivableAllocation_payment_fkey";

ALTER TABLE "ReceivableAllocation"
  ADD CONSTRAINT "ReceivableAllocation_payment_fkey"
  FOREIGN KEY ("paymentId", "societyId") REFERENCES "Payment"("id", "societyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;
