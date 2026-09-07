CREATE TYPE "ConsumerDispatchStatus" AS ENUM (
  'ASSIGNED',
  'ACCEPTED',
  'REJECTED',
  'EN_ROUTE',
  'ARRIVED',
  'RELEASED'
);

CREATE TABLE "ConsumerProviderAgent" (
  "id" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "displayName" TEXT NOT NULL,
  "phone" TEXT,
  "externalRef" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerProviderAgent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerProviderAgent_name_check" CHECK (char_length(trim("displayName")) > 0)
);

CREATE UNIQUE INDEX "ConsumerProviderAgent_provider_external_ref_key"
  ON "ConsumerProviderAgent"("providerId", "externalRef")
  WHERE "externalRef" IS NOT NULL;
CREATE INDEX "ConsumerProviderAgent_provider_active_idx"
  ON "ConsumerProviderAgent"("providerId", "active", "createdAt" DESC);

ALTER TABLE "ConsumerProviderAgent"
  ADD CONSTRAINT "ConsumerProviderAgent_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ConsumerServiceAssignment" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "agentId" UUID NOT NULL,
  "assignedByUserId" UUID NOT NULL,
  "status" "ConsumerDispatchStatus" NOT NULL DEFAULT 'ASSIGNED',
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "enRouteAt" TIMESTAMP(3),
  "arrivedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsumerServiceAssignment_one_active_per_booking"
  ON "ConsumerServiceAssignment"("bookingId")
  WHERE "status" IN ('ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED');
CREATE INDEX "ConsumerServiceAssignment_booking_time_idx"
  ON "ConsumerServiceAssignment"("bookingId", "createdAt" DESC);
CREATE INDEX "ConsumerServiceAssignment_provider_status_idx"
  ON "ConsumerServiceAssignment"("providerId", "status", "createdAt" DESC);
CREATE INDEX "ConsumerServiceAssignment_agent_status_idx"
  ON "ConsumerServiceAssignment"("agentId", "status", "createdAt" DESC);

ALTER TABLE "ConsumerServiceAssignment"
  ADD CONSTRAINT "ConsumerServiceAssignment_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "ConsumerServiceBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerServiceAssignment"
  ADD CONSTRAINT "ConsumerServiceAssignment_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerServiceAssignment"
  ADD CONSTRAINT "ConsumerServiceAssignment_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "ConsumerProviderAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConsumerServiceAssignment"
  ADD CONSTRAINT "ConsumerServiceAssignment_assignedByUserId_fkey"
  FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ConsumerServiceAssignmentEvent" (
  "id" UUID NOT NULL,
  "assignmentId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "fromStatus" "ConsumerDispatchStatus",
  "toStatus" "ConsumerDispatchStatus",
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceAssignmentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsumerServiceAssignmentEvent_assignment_time_idx"
  ON "ConsumerServiceAssignmentEvent"("assignmentId", "occurredAt");

ALTER TABLE "ConsumerServiceAssignmentEvent"
  ADD CONSTRAINT "ConsumerServiceAssignmentEvent_assignmentId_fkey"
  FOREIGN KEY ("assignmentId") REFERENCES "ConsumerServiceAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsumerServiceAssignmentEvent"
  ADD CONSTRAINT "ConsumerServiceAssignmentEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
