CREATE TABLE "ConsumerProviderCommercialProfile" (
  "providerId" UUID NOT NULL,
  "subscriptionTier" TEXT NOT NULL DEFAULT 'BASIC',
  "subscriptionStartsAt" TIMESTAMPTZ(6),
  "subscriptionEndsAt" TIMESTAMPTZ(6),
  "placementType" TEXT NOT NULL DEFAULT 'NONE',
  "placementStartsAt" TIMESTAMPTZ(6),
  "placementEndsAt" TIMESTAMPTZ(6),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerProviderCommercialProfile_pkey" PRIMARY KEY ("providerId"),
  CONSTRAINT "ConsumerProviderCommercialProfile_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ConsumerProviderCommercialProfile_subscriptionTier_check"
    CHECK ("subscriptionTier" IN ('BASIC', 'GROWTH', 'PREMIUM')),
  CONSTRAINT "ConsumerProviderCommercialProfile_placementType_check"
    CHECK ("placementType" IN ('NONE', 'FEATURED', 'SPONSORED')),
  CONSTRAINT "ConsumerProviderCommercialProfile_subscription_window_check"
    CHECK (
      ("subscriptionStartsAt" IS NULL AND "subscriptionEndsAt" IS NULL)
      OR ("subscriptionStartsAt" IS NOT NULL AND "subscriptionEndsAt" IS NOT NULL AND "subscriptionEndsAt" > "subscriptionStartsAt")
    ),
  CONSTRAINT "ConsumerProviderCommercialProfile_placement_window_check"
    CHECK (
      ("placementStartsAt" IS NULL AND "placementEndsAt" IS NULL)
      OR ("placementStartsAt" IS NOT NULL AND "placementEndsAt" IS NOT NULL AND "placementEndsAt" > "placementStartsAt")
    )
);

CREATE INDEX "ConsumerProviderCommercialProfile_placement_idx"
  ON "ConsumerProviderCommercialProfile" ("active", "placementType", "placementStartsAt", "placementEndsAt");

CREATE INDEX "ConsumerProviderCommercialProfile_subscription_idx"
  ON "ConsumerProviderCommercialProfile" ("active", "subscriptionTier", "subscriptionStartsAt", "subscriptionEndsAt");
