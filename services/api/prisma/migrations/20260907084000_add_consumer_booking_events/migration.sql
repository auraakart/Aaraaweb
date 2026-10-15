CREATE TABLE "ConsumerServiceBookingEvent" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" "ServiceBookingStatus" NOT NULL,
  "toStatus" "ServiceBookingStatus" NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceBookingEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsumerServiceBookingEvent_bookingId_occurredAt_idx"
  ON "ConsumerServiceBookingEvent"("bookingId", "occurredAt");
CREATE INDEX "ConsumerServiceBookingEvent_actorUserId_occurredAt_idx"
  ON "ConsumerServiceBookingEvent"("actorUserId", "occurredAt");

ALTER TABLE "ConsumerServiceBookingEvent"
  ADD CONSTRAINT "ConsumerServiceBookingEvent_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "ConsumerServiceBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConsumerServiceBookingEvent"
  ADD CONSTRAINT "ConsumerServiceBookingEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
