CREATE TABLE "ProviderOnboardingApplication" (
  "id" UUID NOT NULL,
  "applicantUserId" UUID NOT NULL,
  "providerId" UUID,
  "businessName" TEXT NOT NULL,
  "contactName" TEXT,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "description" TEXT,
  "requestedCategoryIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "evidenceRefs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "reviewNote" TEXT,
  "reviewedByUserId" UUID,
  "submittedAt" TIMESTAMPTZ(6),
  "reviewedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderOnboardingApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderOnboardingApplication_status_check" CHECK ("status" IN ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED'))
);
CREATE UNIQUE INDEX "ProviderOnboardingApplication_active_user_key"
  ON "ProviderOnboardingApplication"("applicantUserId")
  WHERE "status" IN ('DRAFT','SUBMITTED','UNDER_REVIEW');
CREATE INDEX "ProviderOnboardingApplication_status_created_idx"
  ON "ProviderOnboardingApplication"("status","createdAt" DESC);
ALTER TABLE "ProviderOnboardingApplication"
  ADD CONSTRAINT "ProviderOnboardingApplication_user_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ProviderOnboardingApplication"
  ADD CONSTRAINT "ProviderOnboardingApplication_provider_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE SET NULL;
ALTER TABLE "ProviderOnboardingApplication"
  ADD CONSTRAINT "ProviderOnboardingApplication_reviewer_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;

CREATE TABLE "ProviderBookingProposal" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "proposedFrom" TIMESTAMPTZ(6) NOT NULL,
  "proposedUntil" TIMESTAMPTZ(6) NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdByUserId" UUID NOT NULL,
  "respondedByUserId" UUID,
  "respondedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderBookingProposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderBookingProposal_schedule_check" CHECK ("proposedUntil" > "proposedFrom"),
  CONSTRAINT "ProviderBookingProposal_status_check" CHECK ("status" IN ('PENDING','ACCEPTED','REJECTED','WITHDRAWN'))
);
CREATE UNIQUE INDEX "ProviderBookingProposal_one_pending_key" ON "ProviderBookingProposal"("bookingId") WHERE "status"='PENDING';
CREATE INDEX "ProviderBookingProposal_provider_created_idx" ON "ProviderBookingProposal"("providerId","createdAt" DESC);
ALTER TABLE "ProviderBookingProposal" ADD CONSTRAINT "ProviderBookingProposal_booking_fkey" FOREIGN KEY ("bookingId") REFERENCES "ConsumerServiceBooking"("id") ON DELETE CASCADE;
ALTER TABLE "ProviderBookingProposal" ADD CONSTRAINT "ProviderBookingProposal_provider_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT;
ALTER TABLE "ProviderBookingProposal" ADD CONSTRAINT "ProviderBookingProposal_creator_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ProviderBookingProposal" ADD CONSTRAINT "ProviderBookingProposal_responder_fkey" FOREIGN KEY ("respondedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;

CREATE TABLE "ConsumerServiceCompletionEvidence" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "evidenceType" TEXT NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceCompletionEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerServiceCompletionEvidence_type_check" CHECK ("evidenceType" IN ('NOTE','REFERENCE'))
);
CREATE INDEX "ConsumerServiceCompletionEvidence_booking_time_idx" ON "ConsumerServiceCompletionEvidence"("bookingId","occurredAt");
ALTER TABLE "ConsumerServiceCompletionEvidence" ADD CONSTRAINT "ConsumerServiceCompletionEvidence_booking_fkey" FOREIGN KEY ("bookingId") REFERENCES "ConsumerServiceBooking"("id") ON DELETE CASCADE;
ALTER TABLE "ConsumerServiceCompletionEvidence" ADD CONSTRAINT "ConsumerServiceCompletionEvidence_provider_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT;
ALTER TABLE "ConsumerServiceCompletionEvidence" ADD CONSTRAINT "ConsumerServiceCompletionEvidence_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT;

CREATE TABLE "ConsumerServiceDispute" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "resolutionNote" TEXT,
  "resolvedByUserId" UUID,
  "resolvedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerServiceDispute_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerServiceDispute_status_check" CHECK ("status" IN ('OPEN','UNDER_REVIEW','RESOLVED','DISMISSED'))
);
CREATE UNIQUE INDEX "ConsumerServiceDispute_one_open_key" ON "ConsumerServiceDispute"("bookingId") WHERE "status" IN ('OPEN','UNDER_REVIEW');
CREATE INDEX "ConsumerServiceDispute_provider_status_idx" ON "ConsumerServiceDispute"("providerId","status","createdAt" DESC);
ALTER TABLE "ConsumerServiceDispute" ADD CONSTRAINT "ConsumerServiceDispute_booking_fkey" FOREIGN KEY ("bookingId") REFERENCES "ConsumerServiceBooking"("id") ON DELETE CASCADE;
ALTER TABLE "ConsumerServiceDispute" ADD CONSTRAINT "ConsumerServiceDispute_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT;
ALTER TABLE "ConsumerServiceDispute" ADD CONSTRAINT "ConsumerServiceDispute_provider_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT;
ALTER TABLE "ConsumerServiceDispute" ADD CONSTRAINT "ConsumerServiceDispute_resolver_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL;

CREATE TABLE "ConsumerOfferingAvailabilityException" (
  "id" UUID NOT NULL,
  "offeringId" UUID NOT NULL,
  "serviceDate" DATE NOT NULL,
  "closed" BOOLEAN NOT NULL DEFAULT true,
  "slotCapacity" INTEGER,
  "note" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsumerOfferingAvailabilityException_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsumerOfferingAvailabilityException_capacity_check" CHECK ("slotCapacity" IS NULL OR "slotCapacity" >= 1)
);
CREATE UNIQUE INDEX "ConsumerOfferingAvailabilityException_offering_date_key" ON "ConsumerOfferingAvailabilityException"("offeringId","serviceDate");
ALTER TABLE "ConsumerOfferingAvailabilityException" ADD CONSTRAINT "ConsumerOfferingAvailabilityException_offering_fkey" FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE CASCADE;

CREATE TABLE "ServiceOfferingProviderEvent" (
  "id" UUID NOT NULL,
  "offeringId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "snapshotJson" JSONB NOT NULL,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceOfferingProviderEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceOfferingProviderEvent_offering_time_idx" ON "ServiceOfferingProviderEvent"("offeringId","occurredAt" DESC);
ALTER TABLE "ServiceOfferingProviderEvent" ADD CONSTRAINT "ServiceOfferingProviderEvent_offering_fkey" FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE CASCADE;
ALTER TABLE "ServiceOfferingProviderEvent" ADD CONSTRAINT "ServiceOfferingProviderEvent_provider_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT;
ALTER TABLE "ServiceOfferingProviderEvent" ADD CONSTRAINT "ServiceOfferingProviderEvent_actor_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT;
