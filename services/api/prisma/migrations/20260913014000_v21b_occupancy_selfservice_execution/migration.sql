CREATE TABLE "OccupancyLifecycleChecklistItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "completedAt" TIMESTAMPTZ(6),
  "completedByUserId" UUID,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OccupancyLifecycleChecklistItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OccupancyLifecycleChecklistItem_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "OccupancyLifecycleChecklistItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OccupancyLifecycleRequest"("id") ON DELETE CASCADE,
  CONSTRAINT "OccupancyLifecycleChecklistItem_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "OccupancyLifecycleChecklistItem_code_unique" UNIQUE ("requestId","code")
);

CREATE TABLE "OccupancyLifecycleDocument" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "fileReference" TEXT NOT NULL,
  "uploadedByUserId" UUID NOT NULL,
  "verifiedAt" TIMESTAMPTZ(6),
  "verifiedByUserId" UUID,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OccupancyLifecycleDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OccupancyLifecycleDocument_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "OccupancyLifecycleDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "OccupancyLifecycleRequest"("id") ON DELETE CASCADE,
  CONSTRAINT "OccupancyLifecycleDocument_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "OccupancyLifecycleDocument_verifiedByUserId_fkey" FOREIGN KEY ("verifiedByUserId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX "OccupancyLifecycleChecklistItem_request_idx" ON "OccupancyLifecycleChecklistItem"("requestId","required","completedAt");
CREATE INDEX "OccupancyLifecycleDocument_request_idx" ON "OccupancyLifecycleDocument"("requestId","kind","createdAt");
