CREATE TABLE "WorkforceSuspensionEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "societyId" UUID NOT NULL,
    "workerId" UUID,
    "assignmentId" UUID,
    "actorUserId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkforceSuspensionEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkforceSuspensionEvent_target_check" CHECK (("workerId" IS NOT NULL) <> ("assignmentId" IS NOT NULL)),
    CONSTRAINT "WorkforceSuspensionEvent_action_check" CHECK ("action" IN ('SUSPEND', 'REINSTATE')),
    CONSTRAINT "WorkforceSuspensionEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkforceSuspensionEvent_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "DomesticWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkforceSuspensionEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "WorkforceAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkforceSuspensionEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "WorkforceSuspensionEvent_societyId_occurredAt_idx"
    ON "WorkforceSuspensionEvent"("societyId", "occurredAt" DESC);

CREATE INDEX "WorkforceSuspensionEvent_workerId_occurredAt_idx"
    ON "WorkforceSuspensionEvent"("workerId", "occurredAt" DESC);

CREATE INDEX "WorkforceSuspensionEvent_assignmentId_occurredAt_idx"
    ON "WorkforceSuspensionEvent"("assignmentId", "occurredAt" DESC);
