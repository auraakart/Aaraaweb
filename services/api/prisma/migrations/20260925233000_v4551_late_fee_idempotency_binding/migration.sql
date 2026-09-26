-- V4.55.1 late-fee batch idempotency request binding.
-- Historical rows predate request fingerprints and remain nullable. New service
-- writes a SHA-256 request hash and fails closed when a legacy key is replayed.

ALTER TABLE "LateFeeBatch"
  ADD COLUMN "requestHash" TEXT;

ALTER TABLE "LateFeeBatch"
  ADD CONSTRAINT "LateFeeBatch_request_hash_valid"
  CHECK ("requestHash" IS NULL OR "requestHash" ~ '^[0-9a-f]{64}$');
