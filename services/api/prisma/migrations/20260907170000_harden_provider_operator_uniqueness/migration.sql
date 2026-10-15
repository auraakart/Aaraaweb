-- Keep the oldest active provider mapping for any legacy duplicate user rows,
-- then enforce the runtime invariant at the database boundary.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "ConsumerProviderOperator"
  WHERE "active" = true
)
UPDATE "ConsumerProviderOperator" AS operator
SET "active" = false,
    "updatedAt" = CURRENT_TIMESTAMP
FROM ranked
WHERE operator."id" = ranked."id"
  AND ranked.rn > 1;

CREATE UNIQUE INDEX "ConsumerProviderOperator_one_active_provider_per_user_key"
  ON "ConsumerProviderOperator"("userId")
  WHERE "active" = true;
