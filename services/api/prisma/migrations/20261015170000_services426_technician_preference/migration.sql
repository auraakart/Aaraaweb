-- Resident-initiated booking-level technician request; not an assignment or reservation.
CREATE TABLE "ConsumerServiceTechnicianPreference" (
  "bookingId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "agentId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceTechnicianPreference_pkey" PRIMARY KEY ("bookingId")
);

CREATE INDEX "ConsumerServiceTechnicianPreference_user_idx"
  ON "ConsumerServiceTechnicianPreference" ("userId", "bookingId");

ALTER TABLE "ConsumerServiceTechnicianPreference"
  ADD CONSTRAINT "ConsumerServiceTechnicianPreference_booking_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "ConsumerServiceBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsumerServiceTechnicianPreference"
  ADD CONSTRAINT "ConsumerServiceTechnicianPreference_user_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerServiceTechnicianPreference"
  ADD CONSTRAINT "ConsumerServiceTechnicianPreference_provider_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerServiceTechnicianPreference"
  ADD CONSTRAINT "ConsumerServiceTechnicianPreference_agent_fkey"
  FOREIGN KEY ("agentId") REFERENCES "ConsumerProviderAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
