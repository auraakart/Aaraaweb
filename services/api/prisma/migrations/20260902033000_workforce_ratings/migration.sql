CREATE TABLE "WorkforceRating" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "societyId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "ratedById" UUID NOT NULL,
    "score" SMALLINT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkforceRating_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkforceRating_score_range" CHECK ("score" BETWEEN 1 AND 5),
    CONSTRAINT "WorkforceRating_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkforceRating_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "WorkforceAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkforceRating_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "DomesticWorker"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkforceRating_ratedById_fkey" FOREIGN KEY ("ratedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkforceRating_assignmentId_key" UNIQUE ("assignmentId")
);

CREATE INDEX "WorkforceRating_societyId_workerId_idx"
    ON "WorkforceRating"("societyId", "workerId");

CREATE INDEX "WorkforceRating_societyId_score_idx"
    ON "WorkforceRating"("societyId", "score");
