CREATE TABLE IF NOT EXISTS "ParkingPolicy" (
  "societyId" uuid PRIMARY KEY REFERENCES "Society"("id") ON DELETE CASCADE,
  "maxActiveResidentVehicles" integer NOT NULL DEFAULT 2 CHECK ("maxActiveResidentVehicles" >= 1 AND "maxActiveResidentVehicles" <= 12),
  "requireCredential" boolean NOT NULL DEFAULT false,
  "allowTemporaryOverflow" boolean NOT NULL DEFAULT true,
  "updatedByUserId" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ParkingCredential" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" uuid NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "vehicleId" uuid NOT NULL REFERENCES "HouseholdVehicle"("id") ON DELETE CASCADE,
  "credential" varchar(80) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE','REVOKED')),
  "issuedByUserId" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "issuedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedByUserId" uuid REFERENCES "User"("id") ON DELETE RESTRICT,
  "revokedAt" timestamptz,
  "note" varchar(300),
  UNIQUE ("societyId","credential")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ParkingCredential_active_vehicle_key"
  ON "ParkingCredential"("societyId","vehicleId") WHERE "status"='ACTIVE';
CREATE INDEX IF NOT EXISTS "ParkingCredential_society_status_idx"
  ON "ParkingCredential"("societyId","status","issuedAt" DESC);

CREATE TABLE IF NOT EXISTS "ParkingViolation" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" uuid NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "slotId" uuid REFERENCES "ParkingSlot"("id") ON DELETE SET NULL,
  "vehicleId" uuid REFERENCES "HouseholdVehicle"("id") ON DELETE SET NULL,
  "permitId" uuid REFERENCES "ParkingPermit"("id") ON DELETE SET NULL,
  "code" varchar(40) NOT NULL,
  "severity" varchar(16) NOT NULL DEFAULT 'WARNING' CHECK ("severity" IN ('INFO','WARNING','CRITICAL')),
  "note" varchar(500),
  "status" varchar(16) NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','RESOLVED')),
  "reportedByUserId" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "reportedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedByUserId" uuid REFERENCES "User"("id") ON DELETE RESTRICT,
  "resolvedAt" timestamptz,
  "resolutionNote" varchar(500)
);
CREATE INDEX IF NOT EXISTS "ParkingViolation_society_status_idx"
  ON "ParkingViolation"("societyId","status","reportedAt" DESC);
