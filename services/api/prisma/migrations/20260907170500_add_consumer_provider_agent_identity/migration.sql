CREATE TABLE "ConsumerProviderAgentIdentity" (
  "id" UUID NOT NULL,
  "agentId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerProviderAgentIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsumerProviderAgentIdentity_one_active_agent"
  ON "ConsumerProviderAgentIdentity"("agentId")
  WHERE "active" = true;

CREATE UNIQUE INDEX "ConsumerProviderAgentIdentity_one_active_user"
  ON "ConsumerProviderAgentIdentity"("userId")
  WHERE "active" = true;

CREATE INDEX "ConsumerProviderAgentIdentity_user_active_idx"
  ON "ConsumerProviderAgentIdentity"("userId", "active");

ALTER TABLE "ConsumerProviderAgentIdentity"
  ADD CONSTRAINT "ConsumerProviderAgentIdentity_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "ConsumerProviderAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsumerProviderAgentIdentity"
  ADD CONSTRAINT "ConsumerProviderAgentIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
