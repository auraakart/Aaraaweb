CREATE TABLE "WorkforceLeave" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "societyId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "reason" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkforceLeave_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkforceLeave_valid_range" CHECK ("endsOn" >= "startsOn"),
    CONSTRAINT "WorkforceLeave_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkforceLeave_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "WorkforceAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkforceLeave_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "WorkforceLeave_societyId_active_startsOn_endsOn_idx"
    ON "WorkforceLeave"("societyId", "active", "startsOn", "endsOn");

CREATE INDEX "WorkforceLeave_assignmentId_active_startsOn_endsOn_idx"
    ON "WorkforceLeave"("assignmentId", "active", "startsOn", "endsOn");
