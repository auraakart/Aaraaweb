CREATE TABLE "ResidentPushOutbox" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "targetRegistrationIds" JSONB,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMPTZ,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "deliveredAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResidentPushOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ResidentPushOutbox_status_check" CHECK ("status" IN ('PENDING','PROCESSING','DELIVERED','DEAD')),
  CONSTRAINT "ResidentPushOutbox_attempts_check" CHECK ("attempts" >= 0 AND "maxAttempts" BETWEEN 1 AND 20),
  CONSTRAINT "ResidentPushOutbox_targets_check" CHECK ("targetRegistrationIds" IS NULL OR jsonb_typeof("targetRegistrationIds") = 'array'),
  CONSTRAINT "ResidentPushOutbox_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "ResidentPushOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "ResidentPushOutbox_society_dedupe_key"
  ON "ResidentPushOutbox" ("societyId", "dedupeKey");
CREATE INDEX "ResidentPushOutbox_ready_idx"
  ON "ResidentPushOutbox" ("status", "nextAttemptAt", "createdAt")
  WHERE "status" = 'PENDING';
CREATE INDEX "ResidentPushOutbox_processing_idx"
  ON "ResidentPushOutbox" ("lockedAt")
  WHERE "status" = 'PROCESSING';
CREATE INDEX "ResidentPushOutbox_user_created_idx"
  ON "ResidentPushOutbox" ("societyId", "userId", "createdAt" DESC);

COMMENT ON TABLE "ResidentPushOutbox" IS
  'Durable, deduplicated resident FCM delivery queue with bounded retry and dead-letter state.';
