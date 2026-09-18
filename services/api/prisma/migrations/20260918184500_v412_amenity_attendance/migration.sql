ALTER TYPE "AmenityBookingStatus" ADD VALUE IF NOT EXISTS 'CHECKED_IN';
ALTER TYPE "AmenityBookingStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "AmenityBookingStatus" ADD VALUE IF NOT EXISTS 'NO_SHOW';

ALTER TABLE "AmenityBooking"
  ADD COLUMN IF NOT EXISTS "checkedInAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "noShowAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "attendanceByUserId" UUID,
  ADD COLUMN IF NOT EXISTS "attendanceNote" TEXT;

CREATE INDEX IF NOT EXISTS "AmenityBooking_society_status_starts_idx"
  ON "AmenityBooking" ("societyId", "status", "startsAt");
