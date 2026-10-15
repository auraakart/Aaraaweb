DO $$ BEGIN
  CREATE TYPE "AmenityBookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "Amenity" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "schedule" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "bookingRules" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "feePaise" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
  "slotMinutes" INTEGER NOT NULL DEFAULT 60,
  "maxConcurrentBookings" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Amenity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Amenity_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Amenity_fee_nonnegative" CHECK ("feePaise" >= 0),
  CONSTRAINT "Amenity_slot_minutes_positive" CHECK ("slotMinutes" > 0),
  CONSTRAINT "Amenity_capacity_positive" CHECK ("maxConcurrentBookings" > 0)
);

CREATE UNIQUE INDEX "Amenity_societyId_code_key" ON "Amenity"("societyId", "code");
CREATE INDEX "Amenity_societyId_active_name_idx" ON "Amenity"("societyId", "active", "name");

CREATE TABLE "AmenityBooking" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "amenityId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "startsAt" TIMESTAMPTZ(6) NOT NULL,
  "endsAt" TIMESTAMPTZ(6) NOT NULL,
  "status" "AmenityBookingStatus" NOT NULL DEFAULT 'PENDING',
  "feePaise" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "reviewNote" TEXT,
  "reviewedByUserId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AmenityBooking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AmenityBooking_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AmenityBooking_amenityId_fkey" FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AmenityBooking_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AmenityBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AmenityBooking_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AmenityBooking_valid_window" CHECK ("startsAt" < "endsAt"),
  CONSTRAINT "AmenityBooking_fee_nonnegative" CHECK ("feePaise" >= 0)
);

CREATE INDEX "AmenityBooking_society_amenity_window_idx"
  ON "AmenityBooking"("societyId", "amenityId", "startsAt", "endsAt", "status");
CREATE INDEX "AmenityBooking_society_user_created_idx"
  ON "AmenityBooking"("societyId", "userId", "createdAt" DESC);
CREATE INDEX "AmenityBooking_society_unit_created_idx"
  ON "AmenityBooking"("societyId", "unitId", "createdAt" DESC);

CREATE UNIQUE INDEX "AmenityBooking_active_exact_slot_key"
  ON "AmenityBooking"("amenityId", "unitId", "startsAt", "endsAt")
  WHERE "status" IN ('PENDING', 'CONFIRMED');
