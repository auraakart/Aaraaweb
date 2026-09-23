-- V4.51: auditable gate notification fallback evidence.
CREATE TABLE "GateNotificationAttempt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reason" TEXT,
  "evidence" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GateNotificationAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GateNotificationAttempt_scope_request_user_channel_key"
  ON "GateNotificationAttempt" ("societyId","requestId","userId","channel");
CREATE INDEX "GateNotificationAttempt_scope_request_time_idx"
  ON "GateNotificationAttempt" ("societyId","requestId","createdAt" DESC);
