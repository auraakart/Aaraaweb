CREATE TYPE "ProviderVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "ProviderSocietyStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "ServiceBookingStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'CANCELLED', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "ServiceCategory" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceCategory_slug_key" ON "ServiceCategory"("slug");

CREATE TABLE "ServiceProvider" (
  "id" UUID NOT NULL,
  "businessName" TEXT NOT NULL,
  "contactName" TEXT,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "description" TEXT,
  "verification" "ProviderVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceProvider_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceProvider_verification_active_idx" ON "ServiceProvider"("verification", "active");

CREATE TABLE "ServiceProviderSociety" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "status" "ProviderSocietyStatus" NOT NULL DEFAULT 'PENDING',
  "commissionBps" INTEGER NOT NULL DEFAULT 1000,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceProviderSociety_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceProviderSociety_societyId_providerId_key" ON "ServiceProviderSociety"("societyId", "providerId");
CREATE INDEX "ServiceProviderSociety_societyId_status_idx" ON "ServiceProviderSociety"("societyId", "status");

CREATE TABLE "ServiceOffering" (
  "id" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "pricePaise" INTEGER NOT NULL,
  "durationMinutes" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceOffering_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceOffering_categoryId_active_idx" ON "ServiceOffering"("categoryId", "active");
CREATE INDEX "ServiceOffering_providerId_active_idx" ON "ServiceOffering"("providerId", "active");

CREATE TABLE "ServiceBooking" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "residentUserId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "offeringId" UUID NOT NULL,
  "accessRequestId" UUID,
  "status" "ServiceBookingStatus" NOT NULL DEFAULT 'REQUESTED',
  "scheduledFrom" TIMESTAMP(3) NOT NULL,
  "scheduledUntil" TIMESTAMP(3) NOT NULL,
  "servicePricePaise" INTEGER NOT NULL,
  "commissionBps" INTEGER NOT NULL,
  "commissionPaise" INTEGER NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceBooking_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceBooking_accessRequestId_key" ON "ServiceBooking"("accessRequestId");
CREATE INDEX "ServiceBooking_societyId_residentUserId_createdAt_idx" ON "ServiceBooking"("societyId", "residentUserId", "createdAt");
CREATE INDEX "ServiceBooking_societyId_providerId_status_idx" ON "ServiceBooking"("societyId", "providerId", "status");

CREATE TABLE "ServiceRating" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "providerId" UUID NOT NULL,
  "residentUserId" UUID NOT NULL,
  "score" INTEGER NOT NULL,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceRating_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceRating_bookingId_key" ON "ServiceRating"("bookingId");
CREATE INDEX "ServiceRating_providerId_createdAt_idx" ON "ServiceRating"("providerId", "createdAt");
CREATE INDEX "ServiceRating_societyId_createdAt_idx" ON "ServiceRating"("societyId", "createdAt");

ALTER TABLE "ServiceProviderSociety" ADD CONSTRAINT "ServiceProviderSociety_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceProviderSociety" ADD CONSTRAINT "ServiceProviderSociety_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceOffering" ADD CONSTRAINT "ServiceOffering_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceOffering" ADD CONSTRAINT "ServiceOffering_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ServiceCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_residentUserId_fkey" FOREIGN KEY ("residentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_offeringId_fkey" FOREIGN KEY ("offeringId") REFERENCES "ServiceOffering"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceBooking" ADD CONSTRAINT "ServiceBooking_accessRequestId_fkey" FOREIGN KEY ("accessRequestId") REFERENCES "AccessRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceRating" ADD CONSTRAINT "ServiceRating_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceRating" ADD CONSTRAINT "ServiceRating_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "ServiceBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceRating" ADD CONSTRAINT "ServiceRating_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ServiceProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceRating" ADD CONSTRAINT "ServiceRating_residentUserId_fkey" FOREIGN KEY ("residentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
