CREATE TABLE "ConsumerProviderOperator" (
  "id" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerProviderOperator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsumerProviderOperator_provider_user_key"
  ON "ConsumerProviderOperator"("providerId", "userId");
CREATE INDEX "ConsumerProviderOperator_user_active_idx"
  ON "ConsumerProviderOperator"("userId", "active");
CREATE INDEX "ConsumerProviderOperator_provider_active_idx"
  ON "ConsumerProviderOperator"("providerId", "active");

ALTER TABLE "ConsumerProviderOperator"
  ADD CONSTRAINT "ConsumerProviderOperator_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsumerProviderOperator"
  ADD CONSTRAINT "ConsumerProviderOperator_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
