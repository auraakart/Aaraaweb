CREATE TABLE "ConsumerFavoriteProvider" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL,
  "providerId" uuid NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerFavoriteProvider_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerFavoriteProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "ConsumerFavoriteProvider_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "ConsumerFavoriteProvider_user_provider_key"
  ON "ConsumerFavoriteProvider" ("userId", "providerId");
CREATE INDEX "ConsumerFavoriteProvider_user_active_updated_idx"
  ON "ConsumerFavoriteProvider" ("userId", "active", "updatedAt" DESC);
