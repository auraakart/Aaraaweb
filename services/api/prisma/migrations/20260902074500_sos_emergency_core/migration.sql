CREATE TYPE "SosStatus" AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'CANCELLED');

CREATE TABLE "SosIncident" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "residentUserId" UUID NOT NULL,
  "status" "SosStatus" NOT NULL DEFAULT 'ACTIVE',
  "message" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "acknowledgedById" UUID,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedById" UUID,
  "resolvedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SosIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SosIncident_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SosIncident_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SosIncident_residentUserId_fkey" FOREIGN KEY ("residentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SosIncident_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SosIncident_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SosIncident_societyId_status_createdAt_idx" ON "SosIncident"("societyId", "status", "createdAt");
CREATE INDEX "SosIncident_societyId_residentUserId_createdAt_idx" ON "SosIncident"("societyId", "residentUserId", "createdAt");

CREATE TABLE "SosIncidentEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "incidentId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" "SosStatus",
  "toStatus" "SosStatus",
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SosIncidentEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SosIncidentEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SosIncidentEvent_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SosIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SosIncidentEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SosIncidentEvent_societyId_incidentId_occurredAt_idx" ON "SosIncidentEvent"("societyId", "incidentId", "occurredAt");