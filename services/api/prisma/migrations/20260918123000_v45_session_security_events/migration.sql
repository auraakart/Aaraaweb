ALTER TABLE "Session"
  ADD COLUMN "revocationReason" VARCHAR(64);

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_revocation_reason_not_blank"
  CHECK ("revocationReason" IS NULL OR length(btrim("revocationReason")) > 0);

CREATE TABLE "SecurityEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "societyId" UUID,
  "sessionId" UUID,
  "eventType" VARCHAR(64) NOT NULL,
  "reason" VARCHAR(64),
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SecurityEvent_event_type_not_blank" CHECK (length(btrim("eventType")) > 0),
  CONSTRAINT "SecurityEvent_reason_not_blank" CHECK ("reason" IS NULL OR length(btrim("reason")) > 0)
);

CREATE INDEX "SecurityEvent_society_event_time_idx"
  ON "SecurityEvent" ("societyId","eventType","occurredAt" DESC);
CREATE INDEX "SecurityEvent_user_time_idx"
  ON "SecurityEvent" ("userId","occurredAt" DESC);
CREATE INDEX "SecurityEvent_session_time_idx"
  ON "SecurityEvent" ("sessionId","occurredAt" DESC);

CREATE OR REPLACE FUNCTION "aaraagate_record_session_revocation"()
RETURNS trigger AS $$
BEGIN
  IF OLD."revokedAt" IS NULL AND NEW."revokedAt" IS NOT NULL THEN
    INSERT INTO "SecurityEvent" (
      "userId","societyId","sessionId","eventType","reason","occurredAt"
    ) VALUES (
      NEW."userId",NEW."societyId",NEW."id",'SESSION_REVOKED',
      COALESCE(NEW."revocationReason",'UNSPECIFIED'),NEW."revokedAt"
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Session_revocation_security_event"
AFTER UPDATE OF "revokedAt" ON "Session"
FOR EACH ROW
EXECUTE FUNCTION "aaraagate_record_session_revocation"();
