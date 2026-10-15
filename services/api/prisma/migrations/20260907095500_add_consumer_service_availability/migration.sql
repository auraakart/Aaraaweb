CREATE TABLE "ConsumerProviderServiceArea" (
  "id" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "postalCode" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerProviderServiceArea_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerProviderServiceArea_postalCode_check" CHECK ("postalCode" ~ '^[1-9][0-9]{5}$')
);

CREATE UNIQUE INDEX "ConsumerProviderServiceArea_providerId_postalCode_key"
  ON "ConsumerProviderServiceArea"("providerId", "postalCode");
CREATE INDEX "ConsumerProviderServiceArea_postalCode_active_idx"
  ON "ConsumerProviderServiceArea"("postalCode", "active");
CREATE INDEX "ConsumerProviderServiceArea_providerId_active_idx"
  ON "ConsumerProviderServiceArea"("providerId", "active");

ALTER TABLE "ConsumerProviderServiceArea"
  ADD CONSTRAINT "ConsumerProviderServiceArea_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ConsumerOfferingAvailabilityWindow" (
  "id" UUID NOT NULL,
  "offeringId" UUID NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "slotCapacity" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerOfferingAvailabilityWindow_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerOfferingAvailabilityWindow_dayOfWeek_check" CHECK ("dayOfWeek" >= 0 AND "dayOfWeek" <= 6),
  CONSTRAINT "ConsumerOfferingAvailabilityWindow_startMinute_check" CHECK ("startMinute" >= 0 AND "startMinute" < 1440),
  CONSTRAINT "ConsumerOfferingAvailabilityWindow_endMinute_check" CHECK ("endMinute" > 0 AND "endMinute" <= 1440),
  CONSTRAINT "ConsumerOfferingAvailabilityWindow_range_check" CHECK ("startMinute" < "endMinute"),
  CONSTRAINT "ConsumerOfferingAvailabilityWindow_capacity_check" CHECK ("slotCapacity" >= 1)
);

CREATE INDEX "ConsumerOfferingAvailabilityWindow_offeringId_day_active_idx"
  ON "ConsumerOfferingAvailabilityWindow"("offeringId", "dayOfWeek", "active");

ALTER TABLE "ConsumerOfferingAvailabilityWindow"
  ADD CONSTRAINT "ConsumerOfferingAvailabilityWindow_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
