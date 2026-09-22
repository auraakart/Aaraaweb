CREATE TYPE "SocietyWorkerEventType" AS ENUM ('CREATED','CONFIGURED','VERIFIED','REJECTED','SUSPENDED','REACTIVATED','LEAVE_ADDED','LEAVE_CANCELLED','ATTENDANCE_CORRECTED');

CREATE TABLE "SocietyWorkerLeave" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "workerId" UUID NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "reason" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" UUID NOT NULL,
  "cancelledByUserId" UUID,
  "cancelledAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyWorkerLeave_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyWorkerLeave_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocietyWorkerLeave_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "SocietyWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SocietyWorkerEvent" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "workerId" UUID NOT NULL,
  "event" "SocietyWorkerEventType" NOT NULL,
  "actorUserId" UUID NOT NULL,
  "reason" TEXT,
  "details" JSONB NOT NULL DEFAULT '{}',
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyWorkerEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SocietyWorkerEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SocietyWorkerEvent_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "SocietyWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SocietyWorkerLeave_scope_worker_dates_idx"
ON "SocietyWorkerLeave"("societyId","workerId","active","startsOn","endsOn");

CREATE INDEX "SocietyWorkerLeave_scope_dates_idx"
ON "SocietyWorkerLeave"("societyId","active","startsOn","endsOn");

CREATE INDEX "SocietyWorkerEvent_societyId_workerId_occurredAt_idx"
ON "SocietyWorkerEvent"("societyId","workerId","occurredAt" DESC);

CREATE INDEX "SocietyWorkerEvent_societyId_event_occurredAt_idx"
ON "SocietyWorkerEvent"("societyId","event","occurredAt" DESC);
