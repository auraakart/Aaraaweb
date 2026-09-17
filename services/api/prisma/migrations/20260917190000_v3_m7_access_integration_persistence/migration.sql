CREATE TABLE "AccessIntegrationDevice" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "gateId" UUID NOT NULL,
  "adapterKind" VARCHAR(32) NOT NULL,
  "deviceKey" VARCHAR(160) NOT NULL,
  "displayName" VARCHAR(160) NOT NULL,
  "config" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "health" VARCHAR(24) NOT NULL DEFAULT 'OFFLINE',
  "lastHealthAt" TIMESTAMPTZ,
  "lastSeenAt" TIMESTAMPTZ,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccessIntegrationDevice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccessIntegrationDevice_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessIntegrationDevice_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessIntegrationDevice_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessIntegrationDevice_adapterKind_check" CHECK ("adapterKind" IN ('ANPR','BOOM_BARRIER','RFID')),
  CONSTRAINT "AccessIntegrationDevice_health_check" CHECK ("health" IN ('ONLINE','DEGRADED','OFFLINE'))
);
CREATE UNIQUE INDEX "AccessIntegrationDevice_society_deviceKey_key" ON "AccessIntegrationDevice"("societyId","deviceKey");
CREATE INDEX "AccessIntegrationDevice_society_gate_active_idx" ON "AccessIntegrationDevice"("societyId","gateId","active");

CREATE TABLE "AccessIntegrationCommand" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "deviceId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "idempotencyKey" VARCHAR(160) NOT NULL,
  "command" VARCHAR(24) NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  "result" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ,
  CONSTRAINT "AccessIntegrationCommand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccessIntegrationCommand_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessIntegrationCommand_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AccessIntegrationDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessIntegrationCommand_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessIntegrationCommand_command_check" CHECK ("command" IN ('PING','OPEN','CLOSE','READ')),
  CONSTRAINT "AccessIntegrationCommand_status_check" CHECK ("status" IN ('PENDING','SUCCEEDED','FAILED'))
);
CREATE UNIQUE INDEX "AccessIntegrationCommand_society_device_idempotency_key" ON "AccessIntegrationCommand"("societyId","deviceId","idempotencyKey");
CREATE INDEX "AccessIntegrationCommand_society_device_created_idx" ON "AccessIntegrationCommand"("societyId","deviceId","createdAt" DESC);

CREATE TABLE "AccessIntegrationEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "deviceId" UUID NOT NULL,
  "externalEventId" VARCHAR(200) NOT NULL,
  "eventType" VARCHAR(80) NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "occurredAt" TIMESTAMPTZ NOT NULL,
  "receivedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccessIntegrationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccessIntegrationEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AccessIntegrationEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "AccessIntegrationDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccessIntegrationEvent_society_device_external_key" ON "AccessIntegrationEvent"("societyId","deviceId","externalEventId");
CREATE INDEX "AccessIntegrationEvent_society_device_occurred_idx" ON "AccessIntegrationEvent"("societyId","deviceId","occurredAt" DESC);
