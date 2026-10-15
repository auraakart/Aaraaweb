ALTER TABLE "AmenityBooking"
  ADD COLUMN "guestCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AmenityWaitlistEntry"
  ADD COLUMN "guestCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AmenityBooking"
  ADD CONSTRAINT "AmenityBooking_guestCount_check"
  CHECK ("guestCount" BETWEEN 0 AND 50);

ALTER TABLE "AmenityWaitlistEntry"
  ADD CONSTRAINT "AmenityWaitlistEntry_guestCount_check"
  CHECK ("guestCount" BETWEEN 0 AND 50);
