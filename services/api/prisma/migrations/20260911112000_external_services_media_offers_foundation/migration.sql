CREATE TYPE "ProviderMediaKind" AS ENUM ('LOGO', 'GALLERY');
CREATE TYPE "ProviderMediaStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REMOVED');
CREATE TYPE "ServiceOfferDiscountType" AS ENUM ('PERCENT', 'FLAT');
CREATE TYPE "ServiceOfferStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'EXPIRED');

CREATE TABLE "ServiceProviderMedia" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "providerId" uuid NOT NULL,
  "kind" "ProviderMediaKind" NOT NULL,
  "storageKey" text NOT NULL,
  "publicUrl" text,
  "altText" text,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "status" "ProviderMediaStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" uuid,
  "reviewedAt" timestamptz,
  "reviewNote" text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceProviderMedia_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceProviderMedia_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceProviderMedia_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX "ServiceProviderMedia_provider_status_kind_idx"
  ON "ServiceProviderMedia" ("providerId", "status", "kind", "sortOrder");
CREATE UNIQUE INDEX "ServiceProviderMedia_provider_storageKey_key"
  ON "ServiceProviderMedia" ("providerId", "storageKey");

CREATE TABLE "ServiceOffer" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "providerId" uuid NOT NULL,
  "offeringId" uuid,
  "title" text NOT NULL,
  "description" text,
  "discountType" "ServiceOfferDiscountType" NOT NULL,
  "discountValue" integer NOT NULL,
  "startsAt" timestamptz NOT NULL,
  "endsAt" timestamptz NOT NULL,
  "status" "ServiceOfferStatus" NOT NULL DEFAULT 'DRAFT',
  "terms" text,
  "maxRedemptions" integer,
  "perUserLimit" integer NOT NULL DEFAULT 1,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceOffer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceOffer_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceOffer_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceOffer_discountValue_check" CHECK ("discountValue" > 0),
  CONSTRAINT "ServiceOffer_percent_check" CHECK ("discountType" <> 'PERCENT' OR "discountValue" <= 10000),
  CONSTRAINT "ServiceOffer_window_check" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "ServiceOffer_redemptions_check" CHECK ("maxRedemptions" IS NULL OR "maxRedemptions" > 0),
  CONSTRAINT "ServiceOffer_per_user_check" CHECK ("perUserLimit" > 0)
);

CREATE INDEX "ServiceOffer_provider_status_window_idx"
  ON "ServiceOffer" ("providerId", "status", "startsAt", "endsAt");
CREATE INDEX "ServiceOffer_offering_status_window_idx"
  ON "ServiceOffer" ("offeringId", "status", "startsAt", "endsAt");
