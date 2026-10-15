CREATE TYPE "SocietyWorkerVerificationStatus" AS ENUM ('PENDING','VERIFIED','REJECTED','SUSPENDED');

CREATE TABLE "SocietyWorker" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "employer" TEXT,
  "verification" "SocietyWorkerVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "schedule" JSONB NOT NULL DEFAULT '{}',
  "startDate" TIMESTAMPTZ(6),
  "endDate" TIMESTAMPTZ(6),
  "createdByUserId" UUID NOT NULL,
  "verifiedByUserId" UUID,
  "verifiedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyWorker_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyWorker_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SocietyWorkerGateAccess" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "workerId" UUID NOT NULL,
  "gateId" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyWorkerGateAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyWorkerGateAccess_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocietyWorkerGateAccess_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "SocietyWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocietyWorkerGateAccess_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SocietyWorkerAttendance" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "workerId" UUID NOT NULL,
  "gateId" UUID NOT NULL,
  "checkedInAt" TIMESTAMPTZ(6) NOT NULL,
  "checkedOutAt" TIMESTAMPTZ(6),
  "checkInByUserId" UUID NOT NULL,
  "checkOutByUserId" UUID,
  "checkInKey" TEXT NOT NULL,
  "checkOutKey" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyWorkerAttendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyWorkerAttendance_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocietyWorkerAttendance_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "SocietyWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocietyWorkerAttendance_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SocietyWorker_societyId_phone_key" ON "SocietyWorker"("societyId","phone");
CREATE INDEX "SocietyWorker_societyId_verification_active_idx" ON "SocietyWorker"("societyId","verification","active");
CREATE INDEX "SocietyWorker_societyId_department_active_idx" ON "SocietyWorker"("societyId","department","active");
CREATE UNIQUE INDEX "SocietyWorkerGateAccess_workerId_gateId_key" ON "SocietyWorkerGateAccess"("workerId","gateId");
CREATE INDEX "SocietyWorkerGateAccess_societyId_gateId_active_idx" ON "SocietyWorkerGateAccess"("societyId","gateId","active");
CREATE UNIQUE INDEX "SocietyWorkerAttendance_societyId_checkInKey_key" ON "SocietyWorkerAttendance"("societyId","checkInKey");
CREATE UNIQUE INDEX "SocietyWorkerAttendance_societyId_checkOutKey_key" ON "SocietyWorkerAttendance"("societyId","checkOutKey");
CREATE INDEX "SocietyWorkerAttendance_societyId_workerId_checkedOutAt_idx" ON "SocietyWorkerAttendance"("societyId","workerId","checkedOutAt");
CREATE INDEX "SocietyWorkerAttendance_societyId_gateId_checkedInAt_idx" ON "SocietyWorkerAttendance"("societyId","gateId","checkedInAt" DESC);
