CREATE TABLE "AmenityWaitlistEntry" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "amenityId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "startsAt" TIMESTAMPTZ(6) NOT NULL,
  "endsAt" TIMESTAMPTZ(6) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'WAITING',
  "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "promotedAt" TIMESTAMPTZ(6),
  "cancelledAt" TIMESTAMPTZ(6),
  "promotedBookingId" UUID,
  CONSTRAINT "AmenityWaitlistEntry_window_check" CHECK ("endsAt">"startsAt"),
  CONSTRAINT "AmenityWaitlistEntry_status_check" CHECK ("status" IN ('WAITING','PROMOTED','CANCELLED')),
  CONSTRAINT "AmenityWaitlistEntry_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "AmenityWaitlistEntry_amenity_fkey" FOREIGN KEY ("amenityId") REFERENCES "Amenity"("id") ON DELETE CASCADE,
  CONSTRAINT "AmenityWaitlistEntry_unit_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE,
  CONSTRAINT "AmenityWaitlistEntry_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "AmenityWaitlistEntry_promoted_booking_fkey" FOREIGN KEY ("promotedBookingId") REFERENCES "AmenityBooking"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "AmenityWaitlist_active_unique"
  ON "AmenityWaitlistEntry" ("societyId","amenityId","unitId","userId","startsAt","endsAt")
  WHERE "status"='WAITING';

CREATE INDEX "AmenityWaitlist_society_window_status_idx"
  ON "AmenityWaitlistEntry" ("societyId","amenityId","startsAt","endsAt","status","joinedAt");

CREATE INDEX "AmenityWaitlist_society_user_unit_idx"
  ON "AmenityWaitlistEntry" ("societyId","userId","unitId","joinedAt" DESC);
