CREATE TYPE "ProviderQualityTier" AS ENUM ('STANDARD', 'TRUSTED', 'PREMIUM');
CREATE TYPE "ProviderPromotionStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'EXPIRED');

CREATE TABLE "ServiceProviderTrustProfile" (
  "providerId" uuid NOT NULL,
  "qualityTier" "ProviderQualityTier" NOT NULL DEFAULT 'STANDARD',
  "qualityNote" text,
  "reviewedByUserId" uuid,
  "reviewedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceProviderTrustProfile_pkey" PRIMARY KEY ("providerId"),
  CONSTRAINT "ServiceProviderTrustProfile_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceProviderTrustProfile_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE TABLE "ServiceProviderPromotion" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "providerId" uuid NOT NULL,
  "label" text NOT NULL DEFAULT 'Sponsored',
  "startsAt" timestamptz NOT NULL,
  "endsAt" timestamptz NOT NULL,
  "status" "ProviderPromotionStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceProviderPromotion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceProviderPromotion_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE,
  CONSTRAINT "ServiceProviderPromotion_window_check" CHECK ("endsAt" > "startsAt")
);

CREATE INDEX "ServiceProviderPromotion_provider_status_window_idx"
  ON "ServiceProviderPromotion" ("providerId", "status", "startsAt", "endsAt");
