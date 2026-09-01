CREATE TYPE "AccessSubjectType" AS ENUM ('VISITOR', 'DELIVERY', 'CAB', 'DOMESTIC_HELP', 'VENDOR', 'SERVICE_PROVIDER', 'CONTRACTOR', 'OTHER');
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELLED', 'CHECKED_IN', 'CHECKED_OUT', 'EXPIRED');

CREATE TABLE "AccessRequest" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "requestedById" UUID NOT NULL,
  "subjectType" "AccessSubjectType" NOT NULL,
  "subjectName" TEXT NOT NULL,
  "subjectPhone" TEXT,
  "purpose" TEXT,
  "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "credentialHash" TEXT,
  "enteredAt" TIMESTAMP(3),
  "exitedAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccessRequest_societyId_unitId_status_idx" ON "AccessRequest"("societyId", "unitId", "status");
CREATE INDEX "AccessRequest_societyId_requestedById_createdAt_idx" ON "AccessRequest"("societyId", "requestedById", "createdAt");
CREATE INDEX "AccessRequest_societyId_credentialHash_idx" ON "AccessRequest"("societyId", "credentialHash");

ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
