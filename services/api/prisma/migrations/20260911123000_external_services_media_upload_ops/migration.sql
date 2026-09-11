ALTER TABLE "ServiceProviderMedia"
  ADD COLUMN "contentType" text,
  ADD COLUMN "contentLengthBytes" integer,
  ADD COLUMN "originalFileName" text,
  ADD COLUMN "uploadedAt" timestamptz;

ALTER TABLE "ServiceProviderMedia"
  ADD CONSTRAINT "ServiceProviderMedia_contentLengthBytes_check"
  CHECK ("contentLengthBytes" IS NULL OR ("contentLengthBytes" > 0 AND "contentLengthBytes" <= 5242880));

CREATE INDEX "ServiceProviderMedia_status_uploaded_idx"
  ON "ServiceProviderMedia" ("status", "uploadedAt", "createdAt");
