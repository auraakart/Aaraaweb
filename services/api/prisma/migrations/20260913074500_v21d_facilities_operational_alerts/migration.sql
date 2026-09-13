CREATE TABLE "FacilityOperationalAlert" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "alertType" VARCHAR(48) NOT NULL,
  "sourceType" VARCHAR(32) NOT NULL,
  "sourceId" UUID NOT NULL,
  "severity" VARCHAR(16) NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "message" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3),
  "dedupKey" VARCHAR(180) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FacilityOperationalAlert_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FacilityOperationalAlert_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FacilityOperationalAlert_ack_user_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "FacilityOperationalAlert_status_check" CHECK ("status" IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  CONSTRAINT "FacilityOperationalAlert_severity_check" CHECK ("severity" IN ('INFO','WARNING','CRITICAL'))
);
CREATE UNIQUE INDEX "FacilityOperationalAlert_dedup_key" ON "FacilityOperationalAlert"("societyId","dedupKey");
CREATE INDEX "FacilityOperationalAlert_open_idx" ON "FacilityOperationalAlert"("societyId","status","severity","dueAt");