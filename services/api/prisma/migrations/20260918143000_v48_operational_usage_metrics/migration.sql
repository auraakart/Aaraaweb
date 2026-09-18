CREATE TABLE "OperationalUsageEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID,
  "eventType" VARCHAR(48) NOT NULL,
  "subjectHash" CHAR(64) NOT NULL,
  "bucketDate" DATE NOT NULL DEFAULT CURRENT_DATE,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationalUsageEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OperationalUsageEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OperationalUsageEvent_type_check" CHECK ("eventType" IN (
    'PROPERTY_CONTEXT_SWITCHED',
    'SERVICE_DISCOVERY_VIEWED',
    'INDEPENDENT_HOME_ENTERED'
  ))
);

CREATE UNIQUE INDEX "OperationalUsageEvent_society_type_subject_day_key"
  ON "OperationalUsageEvent"("societyId","eventType","subjectHash","bucketDate")
  WHERE "societyId" IS NOT NULL;

CREATE INDEX "OperationalUsageEvent_society_type_time_idx"
  ON "OperationalUsageEvent"("societyId","eventType","occurredAt" DESC);

CREATE INDEX "OperationalUsageEvent_type_time_idx"
  ON "OperationalUsageEvent"("eventType","occurredAt" DESC);
