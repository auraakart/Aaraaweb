-- V4.50.1: prefer the active canonical incident when legacy overstay duplicates exist.
-- Keep the unique source-key contract while reconciling rows produced before V4.50.
UPDATE "SecurityIncident"
SET "sourceKey"=NULL
WHERE "category"='OVERSTAY'
  AND "sourceKey" LIKE 'access-request:%'
  AND jsonb_typeof("mediaRefs")='array'
  AND ("mediaRefs"->>0) LIKE 'access-request:%';

WITH preferred AS (
  SELECT "id","societyId","category","mediaRefs"->>0 AS "sourceKey",
    ROW_NUMBER() OVER (
      PARTITION BY "societyId","category","mediaRefs"->>0
      ORDER BY CASE "status" WHEN 'OPEN' THEN 0 WHEN 'REVIEWED' THEN 1 ELSE 2 END,
               "occurredAt" ASC,"id" ASC
    ) AS "rowNumber"
  FROM "SecurityIncident"
  WHERE "category"='OVERSTAY'
    AND jsonb_typeof("mediaRefs")='array'
    AND ("mediaRefs"->>0) LIKE 'access-request:%'
)
UPDATE "SecurityIncident" incident
SET "sourceKey"=preferred."sourceKey"
FROM preferred
WHERE incident."id"=preferred."id" AND preferred."rowNumber"=1;
