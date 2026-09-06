CREATE TABLE "ConsumerHome" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "label" TEXT NOT NULL,
  "addressLine1" TEXT NOT NULL,
  "addressLine2" TEXT,
  "locality" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "postalCode" TEXT NOT NULL,
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerHome_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsumerHome_userId_active_idx" ON "ConsumerHome"("userId", "active");

CREATE TABLE "ConsumerServiceBooking" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "homeId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "offeringId" UUID NOT NULL,
  "offeringName" TEXT NOT NULL,
  "providerName" TEXT NOT NULL,
  "addressSnapshot" JSONB NOT NULL,
  "status" "ServiceBookingStatus" NOT NULL DEFAULT 'REQUESTED',
  "scheduledFrom" TIMESTAMP(3) NOT NULL,
  "scheduledUntil" TIMESTAMP(3) NOT NULL,
  "servicePricePaise" INTEGER NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceBooking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerServiceBooking_schedule_check" CHECK ("scheduledUntil" > "scheduledFrom"),
  CONSTRAINT "ConsumerServiceBooking_price_check" CHECK ("servicePricePaise" >= 0)
);

CREATE INDEX "ConsumerServiceBooking_userId_createdAt_idx" ON "ConsumerServiceBooking"("userId", "createdAt" DESC);
CREATE INDEX "ConsumerServiceBooking_userId_status_idx" ON "ConsumerServiceBooking"("userId", "status");
CREATE INDEX "ConsumerServiceBooking_providerId_status_idx" ON "ConsumerServiceBooking"("providerId", "status");

ALTER TABLE "ConsumerHome"
  ADD CONSTRAINT "ConsumerHome_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsumerServiceBooking"
  ADD CONSTRAINT "ConsumerServiceBooking_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsumerServiceBooking"
  ADD CONSTRAINT "ConsumerServiceBooking_homeId_fkey"
  FOREIGN KEY ("homeId") REFERENCES "ConsumerHome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsumerServiceBooking"
  ADD CONSTRAINT "ConsumerServiceBooking_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsumerServiceBooking"
  ADD CONSTRAINT "ConsumerServiceBooking_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
