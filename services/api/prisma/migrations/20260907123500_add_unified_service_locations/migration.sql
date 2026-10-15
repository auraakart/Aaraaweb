CREATE TABLE "SocietyServiceAddress" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
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
  CONSTRAINT "SocietyServiceAddress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyServiceAddress_postalCode_check" CHECK ("postalCode" ~ '^[1-9][0-9]{5}$')
);

CREATE UNIQUE INDEX "SocietyServiceAddress_societyId_key" ON "SocietyServiceAddress"("societyId");
CREATE INDEX "SocietyServiceAddress_postalCode_active_idx" ON "SocietyServiceAddress"("postalCode", "active");

ALTER TABLE "SocietyServiceAddress"
  ADD CONSTRAINT "SocietyServiceAddress_societyId_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ConsumerOfferingServiceArea" (
  "id" UUID NOT NULL,
  "offeringId" UUID NOT NULL,
  "postalCode" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerOfferingServiceArea_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerOfferingServiceArea_postalCode_check" CHECK ("postalCode" ~ '^[1-9][0-9]{5}$')
);

CREATE UNIQUE INDEX "ConsumerOfferingServiceArea_offeringId_postalCode_key"
  ON "ConsumerOfferingServiceArea"("offeringId", "postalCode");
CREATE INDEX "ConsumerOfferingServiceArea_postalCode_active_idx"
  ON "ConsumerOfferingServiceArea"("postalCode", "active");

ALTER TABLE "ConsumerOfferingServiceArea"
  ADD CONSTRAINT "ConsumerOfferingServiceArea_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsumerServiceBooking"
  ADD COLUMN "societyUnitId" UUID;

ALTER TABLE "ConsumerServiceBooking"
  ALTER COLUMN "homeId" DROP NOT NULL;

ALTER TABLE "ConsumerServiceBooking"
  ADD CONSTRAINT "ConsumerServiceBooking_societyUnitId_fkey"
  FOREIGN KEY ("societyUnitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsumerServiceBooking"
  ADD CONSTRAINT "ConsumerServiceBooking_delivery_location_check"
  CHECK (num_nonnulls("homeId", "societyUnitId") = 1);

CREATE INDEX "ConsumerServiceBooking_societyUnitId_createdAt_idx"
  ON "ConsumerServiceBooking"("societyUnitId", "createdAt" DESC);
