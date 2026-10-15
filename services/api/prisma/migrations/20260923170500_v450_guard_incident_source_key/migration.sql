ALTER TABLE "SecurityIncident" ADD COLUMN "sourceKey" TEXT;

WITH candidates AS (
  SELECT "id","societyId","category","mediaRefs"->>0 AS "sourceKey",
    ROW_NUMBER() OVER (PARTITION BY "societyId","category","mediaRefs"->>0 ORDER BY "occurredAt" ASC,"id" ASC) AS "rowNumber"
  FROM "SecurityIncident"
  WHERE "category"='OVERSTAY'
    AND jsonb_typeof("mediaRefs")='array'
    AND ("mediaRefs"->>0) LIKE 'access-request:%'
)
UPDATE "SecurityIncident" incident
SET "sourceKey"=candidate."sourceKey"
FROM candidates candidate
WHERE incident."id"=candidate."id" AND candidate."rowNumber"=1;

CREATE UNIQUE INDEX "SecurityIncident_societyId_category_sourceKey_key"
  ON "SecurityIncident"("societyId","category","sourceKey");
