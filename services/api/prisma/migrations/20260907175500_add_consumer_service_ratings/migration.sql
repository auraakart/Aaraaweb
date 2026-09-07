CREATE TABLE "ConsumerServiceRating" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "offeringId" UUID NOT NULL,
  "stars" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceRating_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerServiceRating_stars_check" CHECK ("stars" BETWEEN 1 AND 5),
  CONSTRAINT "ConsumerServiceRating_comment_check" CHECK ("comment" IS NULL OR char_length("comment") <= 1000)
);

CREATE UNIQUE INDEX "ConsumerServiceRating_booking_key"
  ON "ConsumerServiceRating"("bookingId");
CREATE INDEX "ConsumerServiceRating_provider_time_idx"
  ON "ConsumerServiceRating"("providerId", "createdAt" DESC);
CREATE INDEX "ConsumerServiceRating_offering_time_idx"
  ON "ConsumerServiceRating"("offeringId", "createdAt" DESC);

ALTER TABLE "ConsumerServiceRating"
  ADD CONSTRAINT "ConsumerServiceRating_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "ConsumerServiceBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsumerServiceRating"
  ADD CONSTRAINT "ConsumerServiceRating_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerServiceRating"
  ADD CONSTRAINT "ConsumerServiceRating_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerServiceRating"
  ADD CONSTRAINT "ConsumerServiceRating_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
