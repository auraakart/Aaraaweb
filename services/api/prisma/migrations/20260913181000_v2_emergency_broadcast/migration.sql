CREATE TABLE "EmergencyBroadcast" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "incidentId" UUID,
  "title" VARCHAR(160) NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "severity" VARCHAR(16) NOT NULL DEFAULT 'HIGH',
  "status" VARCHAR(16) NOT NULL DEFAULT 'PUBLISHED',
  "createdByUserId" UUID NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmergencyBroadcast_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmergencyBroadcast_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmergencyBroadcast_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SosIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmergencyBroadcast_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmergencyBroadcast_severity_check" CHECK ("severity" IN ('CRITICAL','HIGH','MEDIUM')),
  CONSTRAINT "EmergencyBroadcast_status_check" CHECK ("status" IN ('PUBLISHED','CANCELLED'))
);

CREATE INDEX "EmergencyBroadcast_society_published_idx" ON "EmergencyBroadcast"("societyId", "publishedAt" DESC);
CREATE INDEX "EmergencyBroadcast_incident_idx" ON "EmergencyBroadcast"("societyId", "incidentId", "publishedAt" DESC);

CREATE TABLE "EmergencyBroadcastRecipient" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "broadcastId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "acknowledgedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmergencyBroadcastRecipient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmergencyBroadcastRecipient_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmergencyBroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "EmergencyBroadcast"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmergencyBroadcastRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "EmergencyBroadcastRecipient_broadcast_user_key" UNIQUE ("broadcastId", "userId")
);

CREATE INDEX "EmergencyBroadcastRecipient_society_user_idx" ON "EmergencyBroadcastRecipient"("societyId", "userId", "createdAt" DESC);
CREATE INDEX "EmergencyBroadcastRecipient_broadcast_ack_idx" ON "EmergencyBroadcastRecipient"("broadcastId", "acknowledgedAt");