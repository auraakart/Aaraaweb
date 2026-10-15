-- V5.4.16 additive, durable commercial session audience.
BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE "Session" ADD COLUMN "audience" VARCHAR(16) NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "Session" ADD CONSTRAINT "Session_audience_scope_check"
  CHECK ("audience" IN ('STANDARD','PARTNER') AND ("audience"<>'PARTNER' OR "societyId" IS NULL));
COMMIT;
