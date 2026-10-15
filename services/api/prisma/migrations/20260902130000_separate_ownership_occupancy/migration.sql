-- Property ownership and physical occupancy are deliberately separate.
-- Ownership alone must never grant gate notifications or household access.
CREATE TABLE "UnitOwnership" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "ownershipBps" INTEGER NOT NULL DEFAULT 10000,
  "effectiveFrom" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMPTZ(6),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnitOwnership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UnitOwnership_ownershipBps_check" CHECK ("ownershipBps" > 0 AND "ownershipBps" <= 10000),
  CONSTRAINT "UnitOwnership_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);

CREATE TABLE "UnitOccupancy" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "relation" "UnitRelation" NOT NULL,
  "effectiveFrom" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMPTZ(6),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "primaryGateContact" BOOLEAN NOT NULL DEFAULT false,
  "gateApprovalEnabled" BOOLEAN NOT NULL DEFAULT true,
  "gateNotificationEnabled" BOOLEAN NOT NULL DEFAULT true,
  "escalationOrder" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnitOccupancy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UnitOccupancy_escalationOrder_check" CHECK ("escalationOrder" >= 0),
  CONSTRAINT "UnitOccupancy_dates_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
);

CREATE UNIQUE INDEX "UnitOwnership_unitId_userId_key" ON "UnitOwnership"("unitId", "userId");
CREATE INDEX "UnitOwnership_societyId_unitId_active_idx" ON "UnitOwnership"("societyId", "unitId", "active");
CREATE INDEX "UnitOwnership_societyId_userId_active_idx" ON "UnitOwnership"("societyId", "userId", "active");
CREATE UNIQUE INDEX "UnitOccupancy_unitId_userId_key" ON "UnitOccupancy"("unitId", "userId");
CREATE INDEX "UnitOccupancy_societyId_unitId_active_gateNotificationEnabled_idx" ON "UnitOccupancy"("societyId", "unitId", "active", "gateNotificationEnabled");
CREATE INDEX "UnitOccupancy_societyId_userId_active_idx" ON "UnitOccupancy"("societyId", "userId", "active");

ALTER TABLE "UnitOwnership" ADD CONSTRAINT "UnitOwnership_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitOwnership" ADD CONSTRAINT "UnitOwnership_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitOwnership" ADD CONSTRAINT "UnitOwnership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitOccupancy" ADD CONSTRAINT "UnitOccupancy_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitOccupancy" ADD CONSTRAINT "UnitOccupancy_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitOccupancy" ADD CONSTRAINT "UnitOccupancy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill legacy relationships conservatively. Existing OWNER links are kept
-- as occupants to preserve access; administrators may later mark a specific
-- owner non-resident through the explicit occupancy lifecycle endpoint.
INSERT INTO "UnitOccupancy" (
  "id", "societyId", "unitId", "userId", "relation", "effectiveFrom",
  "active", "primaryGateContact", "gateApprovalEnabled",
  "gateNotificationEnabled", "escalationOrder", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), "societyId", "unitId", "userId", "relation", "createdAt",
       "active", "primary", true, true,
       CASE WHEN "primary" THEN 0 ELSE 100 END, "createdAt", CURRENT_TIMESTAMP
FROM "UnitResident";

INSERT INTO "UnitOwnership" (
  "id", "societyId", "unitId", "userId", "verified", "effectiveFrom",
  "active", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), "societyId", "unitId", "userId", false, "createdAt",
       "active", "createdAt", CURRENT_TIMESTAMP
FROM "UnitResident"
WHERE "relation" = 'OWNER';

