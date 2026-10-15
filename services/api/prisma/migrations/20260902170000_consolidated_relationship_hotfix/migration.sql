-- Retire the transitional relationship source and make ownership/occupancy
-- the only authorization sources. Preserve historical relationship periods.

UPDATE "UnitOwnership"
SET "active" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "active" = true
  AND "effectiveTo" IS NOT NULL
  AND "effectiveTo" <= CURRENT_TIMESTAMP;

UPDATE "UnitOccupancy"
SET "active" = false,
    "primaryGateContact" = false,
    "gateApprovalEnabled" = false,
    "gateNotificationEnabled" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "active" = true
  AND "effectiveTo" IS NOT NULL
  AND "effectiveTo" <= CURRENT_TIMESTAMP;

-- Future occupancies cannot be primary before their relationship begins.
UPDATE "UnitOccupancy"
SET "primaryGateContact" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "active" = true
  AND ("effectiveFrom" > CURRENT_TIMESTAMP OR "gateNotificationEnabled" = false);

-- Reconcile legacy duplicate/missing primary flags deterministically.
WITH ranked AS (
  SELECT "id",
         row_number() OVER (
           PARTITION BY "unitId"
           ORDER BY "primaryGateContact" DESC, "escalationOrder" ASC, "createdAt" ASC, "id" ASC
         ) AS position
  FROM "UnitOccupancy"
  WHERE "active" = true
    AND "gateNotificationEnabled" = true
    AND "effectiveFrom" <= CURRENT_TIMESTAMP
    AND ("effectiveTo" IS NULL OR "effectiveTo" > CURRENT_TIMESTAMP)
)
UPDATE "UnitOccupancy" AS occupancy
SET "primaryGateContact" = (ranked.position = 1), "updatedAt" = CURRENT_TIMESTAMP
FROM ranked
WHERE occupancy."id" = ranked."id";

DROP INDEX IF EXISTS "UnitOwnership_unitId_userId_key";
DROP INDEX IF EXISTS "UnitOccupancy_unitId_userId_key";

CREATE UNIQUE INDEX "UnitOwnership_one_active_unit_user_key"
  ON "UnitOwnership" ("unitId", "userId")
  WHERE "active" = true;

CREATE UNIQUE INDEX "UnitOccupancy_one_active_unit_user_key"
  ON "UnitOccupancy" ("unitId", "userId")
  WHERE "active" = true;

CREATE UNIQUE INDEX "UnitOccupancy_one_active_primary_per_unit_key"
  ON "UnitOccupancy" ("unitId")
  WHERE "active" = true AND "primaryGateContact" = true;

-- Relationship-derived memberships must be backed by a current relationship.
INSERT INTO "SocietyMembership" ("id", "userId", "societyId", "role", "active")
SELECT gen_random_uuid(), current_owners."userId", current_owners."societyId", 'OWNER', true
FROM (
  SELECT DISTINCT ownership."userId", ownership."societyId"
  FROM "UnitOwnership" ownership
  WHERE ownership."active" = true
    AND ownership."effectiveFrom" <= CURRENT_TIMESTAMP
    AND (ownership."effectiveTo" IS NULL OR ownership."effectiveTo" > CURRENT_TIMESTAMP)
) current_owners
ON CONFLICT ("userId", "societyId", "role") DO UPDATE SET "active" = true;

INSERT INTO "SocietyMembership" ("id", "userId", "societyId", "role", "active")
SELECT gen_random_uuid(), current_occupants."userId", current_occupants."societyId",
       current_occupants."relation"::text::"MembershipRole", true
FROM (
  SELECT DISTINCT occupancy."userId", occupancy."societyId", occupancy."relation"
  FROM "UnitOccupancy" occupancy
  WHERE occupancy."active" = true
    AND occupancy."relation" IN ('TENANT', 'FAMILY_MEMBER')
    AND occupancy."effectiveFrom" <= CURRENT_TIMESTAMP
    AND (occupancy."effectiveTo" IS NULL OR occupancy."effectiveTo" > CURRENT_TIMESTAMP)
) current_occupants
ON CONFLICT ("userId", "societyId", "role") DO UPDATE SET "active" = true;

UPDATE "SocietyMembership" AS membership
SET "active" = false
WHERE membership."active" = true
  AND membership."role" IN ('OWNER', 'TENANT', 'FAMILY_MEMBER')
  AND NOT EXISTS (
    SELECT 1
    FROM "UnitOwnership" ownership
    WHERE membership."role" = 'OWNER'
      AND ownership."societyId" = membership."societyId"
      AND ownership."userId" = membership."userId"
      AND ownership."active" = true
      AND ownership."effectiveFrom" <= CURRENT_TIMESTAMP
      AND (ownership."effectiveTo" IS NULL OR ownership."effectiveTo" > CURRENT_TIMESTAMP)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "UnitOccupancy" occupancy
    WHERE membership."role"::text = occupancy."relation"::text
      AND membership."role" IN ('TENANT', 'FAMILY_MEMBER')
      AND occupancy."societyId" = membership."societyId"
      AND occupancy."userId" = membership."userId"
      AND occupancy."active" = true
      AND occupancy."effectiveFrom" <= CURRENT_TIMESTAMP
      AND (occupancy."effectiveTo" IS NULL OR occupancy."effectiveTo" > CURRENT_TIMESTAMP)
  );

UPDATE "Session" AS session
SET "revokedAt" = CURRENT_TIMESTAMP
WHERE session."revokedAt" IS NULL
  AND session."societyId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "SocietyMembership" membership
    WHERE membership."societyId" = session."societyId"
      AND membership."userId" = session."userId"
      AND membership."active" = true
  );

DROP TABLE "UnitResident";
