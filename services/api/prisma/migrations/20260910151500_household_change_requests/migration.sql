CREATE TABLE "HouseholdChangeRequest" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "householdId" UUID NOT NULL,
  "requestedByUserId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "targetId" UUID,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedByUserId" UUID,
  "reviewedAt" TIMESTAMPTZ(6),
  "reviewNote" TEXT,
  CONSTRAINT "HouseholdChangeRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HouseholdChangeRequest_type_check" CHECK (
    "type" IN ('FAMILY_MEMBER_ADD', 'FAMILY_MEMBER_REMOVE', 'VEHICLE_ADD', 'VEHICLE_REMOVE')
  ),
  CONSTRAINT "HouseholdChangeRequest_status_check" CHECK (
    "status" IN ('PENDING', 'PROCESSING', 'APPROVED', 'REJECTED')
  )
);

CREATE INDEX "HouseholdChangeRequest_society_status_created_idx"
  ON "HouseholdChangeRequest"("societyId", "status", "createdAt");
CREATE INDEX "HouseholdChangeRequest_society_requester_created_idx"
  ON "HouseholdChangeRequest"("societyId", "requestedByUserId", "createdAt" DESC);
CREATE INDEX "HouseholdChangeRequest_household_status_idx"
  ON "HouseholdChangeRequest"("householdId", "status");
ALTER TABLE "HouseholdChangeRequest"
  ADD CONSTRAINT "HouseholdChangeRequest_societyId_fkey"
  FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdChangeRequest"
  ADD CONSTRAINT "HouseholdChangeRequest_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdChangeRequest"
  ADD CONSTRAINT "HouseholdChangeRequest_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HouseholdChangeRequest"
  ADD CONSTRAINT "HouseholdChangeRequest_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill the workflow ledger introduced before this indexed table. Keep the
-- JSON copy for rollback compatibility and older application versions.
INSERT INTO "HouseholdChangeRequest" (
  "id", "societyId", "householdId", "requestedByUserId", "type", "status",
  "targetId", "payload", "createdAt", "reviewedByUserId", "reviewedAt", "reviewNote"
)
SELECT
  (entry->>'id')::uuid,
  household."societyId",
  household."id",
  requester."id",
  entry->>'type',
  entry->>'status',
  CASE WHEN COALESCE(entry->>'targetId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN (entry->>'targetId')::uuid ELSE NULL END,
  CASE WHEN jsonb_typeof(entry->'payload') = 'object' THEN entry->'payload' ELSE '{}'::jsonb END,
  CASE WHEN pg_input_is_valid(entry->>'createdAt', 'timestamptz')
    THEN (entry->>'createdAt')::timestamptz ELSE household."createdAt" END,
  reviewer."id",
  CASE WHEN pg_input_is_valid(entry->>'reviewedAt', 'timestamptz')
    THEN (entry->>'reviewedAt')::timestamptz ELSE NULL END,
  NULLIF(entry->>'reviewNote', '')
FROM "Household" AS household
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(household."accessPreferences"->'householdChangeRequests') = 'array'
    THEN household."accessPreferences"->'householdChangeRequests' ELSE '[]'::jsonb END
) AS entry
JOIN "User" AS requester
  ON requester."id" = CASE
    WHEN COALESCE(entry->>'requestedByUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN (entry->>'requestedByUserId')::uuid ELSE NULL END
LEFT JOIN "User" AS reviewer
  ON reviewer."id" = CASE
    WHEN COALESCE(entry->>'reviewedByUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN (entry->>'reviewedByUserId')::uuid ELSE NULL END
WHERE COALESCE(entry->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND COALESCE(entry->>'requestedByUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND entry->>'type' IN ('FAMILY_MEMBER_ADD', 'FAMILY_MEMBER_REMOVE', 'VEHICLE_ADD', 'VEHICLE_REMOVE')
  AND entry->>'status' IN ('PENDING', 'PROCESSING', 'APPROVED', 'REJECTED')
ON CONFLICT ("id") DO NOTHING;

-- Close stale requests that could never succeed, then retain only the oldest
-- actionable add request per normalized society-wide plate. The JSON ledger is
-- deliberately preserved; indexed rows take precedence during the dual-read
-- compatibility window.
UPDATE "HouseholdChangeRequest" AS request
SET "status" = 'REJECTED',
    "reviewNote" = COALESCE(request."reviewNote", 'Automatically closed during migration: vehicle is already active')
FROM "HouseholdVehicle" AS vehicle
WHERE request."type" = 'VEHICLE_ADD'
  AND request."status" IN ('PENDING', 'PROCESSING')
  AND vehicle."societyId" = request."societyId"
  AND vehicle."active" = TRUE
  AND vehicle."plateNumber" = request."payload"->>'plateNumber';

WITH ranked_vehicle_adds AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "societyId", "payload"->>'plateNumber'
    ORDER BY "createdAt", "id"
  ) AS position
  FROM "HouseholdChangeRequest"
  WHERE "type" = 'VEHICLE_ADD'
    AND "status" IN ('PENDING', 'PROCESSING')
    AND COALESCE("payload"->>'plateNumber', '') <> ''
)
UPDATE "HouseholdChangeRequest" AS request
SET "status" = 'REJECTED',
    "reviewNote" = COALESCE(request."reviewNote", 'Automatically closed during migration: duplicate vehicle request')
FROM ranked_vehicle_adds
WHERE request."id" = ranked_vehicle_adds."id"
  AND ranked_vehicle_adds.position > 1;
