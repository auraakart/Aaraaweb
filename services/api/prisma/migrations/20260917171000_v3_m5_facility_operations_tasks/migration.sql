CREATE TABLE "FacilityOperationsTask" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "category" VARCHAR(32) NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "location" VARCHAR(240),
  "scheduledAt" TIMESTAMPTZ,
  "dueAt" TIMESTAMPTZ,
  "assignedUserId" UUID,
  "status" VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  "completionNote" VARCHAR(5000),
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ,
  CONSTRAINT "FacilityOperationsTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilityOperationsTask_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityOperationsTask_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityOperationsTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityOperationsTask_category_check" CHECK ("category" IN ('HOUSEKEEPING','STAFF')),
  CONSTRAINT "FacilityOperationsTask_status_check" CHECK ("status" IN ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  CONSTRAINT "FacilityOperationsTask_schedule_check" CHECK ("scheduledAt" IS NULL OR "dueAt" IS NULL OR "dueAt" >= "scheduledAt")
);

CREATE INDEX "FacilityOperationsTask_society_status_due_idx" ON "FacilityOperationsTask"("societyId", "status", "dueAt");
CREATE INDEX "FacilityOperationsTask_society_assignee_idx" ON "FacilityOperationsTask"("societyId", "assignedUserId") WHERE "assignedUserId" IS NOT NULL;

CREATE TABLE "FacilityOperationsTaskEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "eventType" VARCHAR(32) NOT NULL,
  "fromStatus" VARCHAR(32),
  "toStatus" VARCHAR(32),
  "note" VARCHAR(5000),
  "actorUserId" UUID NOT NULL,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityOperationsTaskEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilityOperationsTaskEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityOperationsTaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "FacilityOperationsTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityOperationsTaskEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FacilityOperationsTaskEvent_type_check" CHECK ("eventType" IN ('CREATED','STATUS_CHANGED','ASSIGNED'))
);

CREATE INDEX "FacilityOperationsTaskEvent_society_task_time_idx" ON "FacilityOperationsTaskEvent"("societyId", "taskId", "occurredAt");
