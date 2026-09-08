CREATE TABLE "ConsumerPushDeviceToken" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "token" TEXT NOT NULL,
  "platform" "DevicePlatform" NOT NULL,
  "deviceId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConsumerPushDeviceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsumerPushDeviceToken_token_key"
  ON "ConsumerPushDeviceToken"("token");

CREATE INDEX "ConsumerPushDeviceToken_userId_active_idx"
  ON "ConsumerPushDeviceToken"("userId", "active");

ALTER TABLE "ConsumerPushDeviceToken"
  ADD CONSTRAINT "ConsumerPushDeviceToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
