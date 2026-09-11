ALTER TABLE "ServiceProviderMedia"
  ADD COLUMN "malwareScanStatus" text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "malwareScannedAt" timestamptz,
  ADD COLUMN "malwareScanEngine" text,
  ADD COLUMN "malwareScanReference" text;

ALTER TABLE "ServiceProviderMedia"
  ADD CONSTRAINT "ServiceProviderMedia_malwareScanStatus_check"
  CHECK ("malwareScanStatus" IN ('PENDING', 'CLEAN', 'INFECTED', 'ERROR'));

CREATE INDEX "ServiceProviderMedia_malware_scan_idx"
  ON "ServiceProviderMedia" ("malwareScanStatus", "status", "uploadedAt", "createdAt");
