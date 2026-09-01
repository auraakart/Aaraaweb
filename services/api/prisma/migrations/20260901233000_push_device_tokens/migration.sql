CREATE TYPE "DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

CREATE TABLE "DevicePushToken" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "token" TEXT NOT NULL,
  "platform" "DevicePlatform" NOT NULL,
  "deviceId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DevicePushToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DevicePushToken_token_key" ON "DevicePushToken"("token");
CREATE INDEX "DevicePushToken_societyId_userId_active_idx" ON "DevicePushToken"("societyId", "userId", "active");
CREATE INDEX "DevicePushToken_userId_active_idx" ON "DevicePushToken"("userId", "active");

ALTER TABLE "DevicePushToken"
  ADD CONSTRAINT "DevicePushToken_societyId_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DevicePushToken"
  ADD CONSTRAINT "DevicePushToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
