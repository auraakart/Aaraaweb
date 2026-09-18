CREATE TABLE "PushDeliveryOutbox" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "targetScope" TEXT NOT NULL,
  "societyId" UUID,
  "userId" UUID NOT NULL,
  "eventType" VARCHAR(96) NOT NULL,
  "dedupeKey" VARCHAR(220) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(6),
  "lastAttemptAt" TIMESTAMPTZ(6),
  "dispatchedAt" TIMESTAMPTZ(6),
  "lastError" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushDeliveryOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushDeliveryOutbox_scope_check" CHECK ("targetScope" IN ('RESIDENT','CONSUMER')),
  CONSTRAINT "PushDeliveryOutbox_status_check" CHECK ("status" IN ('PENDING','IN_FLIGHT','DISPATCHED','FAILED')),
  CONSTRAINT "PushDeliveryOutbox_attempt_check" CHECK ("attemptCount" >= 0),
  CONSTRAINT "PushDeliveryOutbox_event_not_blank" CHECK (btrim("eventType") <> ''),
  CONSTRAINT "PushDeliveryOutbox_dedupe_not_blank" CHECK (btrim("dedupeKey") <> ''),
  CONSTRAINT "PushDeliveryOutbox_resident_society_check" CHECK ("targetScope" <> 'RESIDENT' OR "societyId" IS NOT NULL)
);

CREATE UNIQUE INDEX "PushDeliveryOutbox_scope_dedupe_key"
  ON "PushDeliveryOutbox" ("targetScope","dedupeKey");
CREATE INDEX "PushDeliveryOutbox_due_idx"
  ON "PushDeliveryOutbox" ("status","nextAttemptAt","createdAt");
CREATE INDEX "PushDeliveryOutbox_user_idx"
  ON "PushDeliveryOutbox" ("userId","createdAt" DESC);
CREATE INDEX "PushDeliveryOutbox_society_idx"
  ON "PushDeliveryOutbox" ("societyId","createdAt" DESC)
  WHERE "societyId" IS NOT NULL;

ALTER TABLE "PushDeliveryOutbox"
  ADD CONSTRAINT "PushDeliveryOutbox_society_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "PushDeliveryOutbox_user_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
