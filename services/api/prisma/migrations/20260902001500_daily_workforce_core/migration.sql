CREATE TYPE "DomesticWorkerRole" AS ENUM ('MAID', 'DRIVER', 'COOK', 'NANNY', 'OTHER');
CREATE TYPE "DomesticWorkerVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "WorkforceAssignmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

CREATE TABLE "DomesticWorker" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "role" "DomesticWorkerRole" NOT NULL,
  "verification" "DomesticWorkerVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DomesticWorker_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkforceAssignment" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "householdId" UUID NOT NULL,
  "workerId" UUID NOT NULL,
  "status" "WorkforceAssignmentStatus" NOT NULL DEFAULT 'PENDING',
  "schedule" JSONB NOT NULL DEFAULT '{}',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkforceAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DomesticWorker_societyId_phone_key" ON "DomesticWorker"("societyId", "phone");
CREATE INDEX "DomesticWorker_societyId_verification_active_idx" ON "DomesticWorker"("societyId", "verification", "active");
CREATE UNIQUE INDEX "WorkforceAssignment_householdId_workerId_key" ON "WorkforceAssignment"("householdId", "workerId");
CREATE INDEX "WorkforceAssignment_societyId_status_active_idx" ON "WorkforceAssignment"("societyId", "status", "active");
CREATE INDEX "WorkforceAssignment_societyId_workerId_active_idx" ON "WorkforceAssignment"("societyId", "workerId", "active");

ALTER TABLE "DomesticWorker" ADD CONSTRAINT "DomesticWorker_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkforceAssignment" ADD CONSTRAINT "WorkforceAssignment_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkforceAssignment" ADD CONSTRAINT "WorkforceAssignment_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkforceAssignment" ADD CONSTRAINT "WorkforceAssignment_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "DomesticWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
