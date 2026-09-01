CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "SocietyStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "MembershipRole" AS ENUM ('SUPER_ADMIN', 'SOCIETY_ADMIN', 'COMMITTEE_MEMBER', 'FACILITY_MANAGER', 'ACCOUNTANT', 'OWNER', 'TENANT', 'FAMILY_MEMBER', 'SECURITY_SUPERVISOR', 'SECURITY_GUARD', 'STAFF', 'VENDOR');
CREATE TYPE "UnitRelation" AS ENUM ('OWNER', 'TENANT', 'FAMILY_MEMBER');
CREATE TYPE "VisitorStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');
CREATE TYPE "VisitorPassStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED');
CREATE TYPE "AuditEventType" AS ENUM ('VISITOR_VERIFIED', 'VISITOR_CHECKED_IN', 'VISITOR_CHECKED_OUT');

CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "phone" TEXT NOT NULL,
  "email" TEXT,
  "name" TEXT,
  "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Society" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" "SocietyStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Society_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocietyMembership" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "role" "MembershipRole" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocietyMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Building" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Unit" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "buildingId" UUID NOT NULL,
  "number" TEXT NOT NULL,
  CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UnitResident" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "relation" "UnitRelation" NOT NULL,
  "primary" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnitResident_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Gate" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Gate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Visitor" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "hostUserId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "purpose" TEXT,
  "status" "VisitorStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VisitorPass" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "visitorId" UUID NOT NULL,
  "credentialHash" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "status" "VisitorPassStatus" NOT NULL DEFAULT 'ACTIVE',
  "checkedInAt" TIMESTAMP(3),
  "checkedOutAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VisitorPass_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
  "id" UUID NOT NULL,
  "societyId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "gateId" UUID NOT NULL,
  "visitorPassId" UUID NOT NULL,
  "event" "AuditEventType" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "societyId" UUID,
  "accessTokenHash" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Society_code_key" ON "Society"("code");
CREATE UNIQUE INDEX "SocietyMembership_userId_societyId_role_key" ON "SocietyMembership"("userId", "societyId", "role");
CREATE INDEX "SocietyMembership_societyId_idx" ON "SocietyMembership"("societyId");
CREATE UNIQUE INDEX "Building_societyId_code_key" ON "Building"("societyId", "code");
CREATE UNIQUE INDEX "Unit_buildingId_number_key" ON "Unit"("buildingId", "number");
CREATE INDEX "Unit_societyId_idx" ON "Unit"("societyId");
CREATE UNIQUE INDEX "UnitResident_unitId_userId_key" ON "UnitResident"("unitId", "userId");
CREATE INDEX "UnitResident_societyId_unitId_idx" ON "UnitResident"("societyId", "unitId");
CREATE INDEX "UnitResident_societyId_userId_idx" ON "UnitResident"("societyId", "userId");
CREATE UNIQUE INDEX "Gate_societyId_code_key" ON "Gate"("societyId", "code");
CREATE INDEX "Visitor_societyId_hostUserId_idx" ON "Visitor"("societyId", "hostUserId");
CREATE INDEX "Visitor_societyId_unitId_idx" ON "Visitor"("societyId", "unitId");
CREATE INDEX "VisitorPass_societyId_status_idx" ON "VisitorPass"("societyId", "status");
CREATE INDEX "VisitorPass_visitorId_idx" ON "VisitorPass"("visitorId");
CREATE INDEX "VisitorPass_societyId_credentialHash_idx" ON "VisitorPass"("societyId", "credentialHash");
CREATE INDEX "AuditEvent_societyId_occurredAt_idx" ON "AuditEvent"("societyId", "occurredAt");
CREATE INDEX "AuditEvent_societyId_gateId_occurredAt_idx" ON "AuditEvent"("societyId", "gateId", "occurredAt");
CREATE INDEX "AuditEvent_societyId_visitorPassId_occurredAt_idx" ON "AuditEvent"("societyId", "visitorPassId", "occurredAt");
CREATE UNIQUE INDEX "Session_accessTokenHash_key" ON "Session"("accessTokenHash");
CREATE UNIQUE INDEX "Session_refreshTokenHash_key" ON "Session"("refreshTokenHash");
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");
CREATE INDEX "Session_societyId_revokedAt_idx" ON "Session"("societyId", "revokedAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "Session_refreshExpiresAt_idx" ON "Session"("refreshExpiresAt");

ALTER TABLE "SocietyMembership" ADD CONSTRAINT "SocietyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocietyMembership" ADD CONSTRAINT "SocietyMembership_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Building" ADD CONSTRAINT "Building_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitResident" ADD CONSTRAINT "UnitResident_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitResident" ADD CONSTRAINT "UnitResident_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UnitResident" ADD CONSTRAINT "UnitResident_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Gate" ADD CONSTRAINT "Gate_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitorPass" ADD CONSTRAINT "VisitorPass_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VisitorPass" ADD CONSTRAINT "VisitorPass_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_visitorPassId_fkey" FOREIGN KEY ("visitorPassId") REFERENCES "VisitorPass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE ON UPDATE CASCADE;
