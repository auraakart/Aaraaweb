CREATE TABLE "OccupancyLifecycleRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "occupancyId" UUID,
  "kind" TEXT NOT NULL,
  "relation" "UnitRelation" NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "effectiveAt" TIMESTAMPTZ(6) NOT NULL,
  "reason" TEXT,
  "requestedByUserId" UUID NOT NULL,
  "reviewedByUserId" UUID,
  "reviewedAt" TIMESTAMPTZ(6),
  "completedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OccupancyLifecycleRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OccupancyLifecycleRequest_kind_check" CHECK ("kind" IN ('MOVE_IN','MOVE_OUT')),
  CONSTRAINT "OccupancyLifecycleRequest_status_check" CHECK ("status" IN ('REQUESTED','APPROVED','REJECTED','COMPLETED','CANCELLED')),
  CONSTRAINT "OccupancyLifecycleRequest_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "OccupancyLifecycleRequest_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE,
  CONSTRAINT "OccupancyLifecycleRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "OccupancyLifecycleRequest_occupancyId_fkey" FOREIGN KEY ("occupancyId") REFERENCES "UnitOccupancy"("id") ON DELETE SET NULL,
  CONSTRAINT "OccupancyLifecycleRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "OccupancyLifecycleRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE TABLE "OccupancyLifecycleEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "actorUserId" UUID NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OccupancyLifecycleEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OccupancyLifecycleEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "OccupancyLifecycleEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OccupancyLifecycleRequest"("id") ON DELETE CASCADE,
  CONSTRAINT "OccupancyLifecycleEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE INDEX "OccupancyLifecycleRequest_society_status_effective_idx" ON "OccupancyLifecycleRequest"("societyId","status","effectiveAt");
CREATE INDEX "OccupancyLifecycleRequest_unit_status_idx" ON "OccupancyLifecycleRequest"("unitId","status");
CREATE INDEX "OccupancyLifecycleRequest_user_status_idx" ON "OccupancyLifecycleRequest"("userId","status");
CREATE INDEX "OccupancyLifecycleEvent_request_created_idx" ON "OccupancyLifecycleEvent"("requestId","createdAt");

CREATE UNIQUE INDEX "OccupancyLifecycleRequest_one_open_move_in_idx"
ON "OccupancyLifecycleRequest"("societyId","unitId","userId") WHERE "kind"='MOVE_IN' AND "status" IN ('REQUESTED','APPROVED');

CREATE UNIQUE INDEX "OccupancyLifecycleRequest_one_open_move_out_idx"
ON "OccupancyLifecycleRequest"("societyId","occupancyId") WHERE "kind"='MOVE_OUT' AND "status" IN ('REQUESTED','APPROVED') AND "occupancyId" IS NOT NULL;
