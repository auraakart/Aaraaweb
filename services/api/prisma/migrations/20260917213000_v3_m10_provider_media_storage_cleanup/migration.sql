ALTER TABLE "ServiceProviderMedia"
  ADD COLUMN "storageDeletedAt" timestamptz,
  ADD COLUMN "storageDeleteAttemptCount" integer NOT NULL DEFAULT 0,
  ADD COLUMN "storageDeleteNextAttemptAt" timestamptz,
  ADD COLUMN "storageDeleteLastError" text;

ALTER TABLE "ServiceProviderMedia"
  ADD CONSTRAINT "ServiceProviderMedia_storageDeleteAttemptCount_check"
  CHECK ("storageDeleteAttemptCount" >= 0);

CREATE INDEX "ServiceProviderMedia_storage_cleanup_idx"
  ON "ServiceProviderMedia" ("status", "storageDeletedAt", "storageDeleteNextAttemptAt", "updatedAt");
