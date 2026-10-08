ALTER TABLE "CommunityCircle"
 ADD COLUMN "expiresAt" TIMESTAMPTZ(6),
 ADD COLUMN "reviewedByUserId" UUID REFERENCES "User"("id") ON DELETE SET NULL,
 ADD COLUMN "reviewedAt" TIMESTAMPTZ(6), ADD COLUMN "reviewNote" TEXT,
 ADD CONSTRAINT "CommunityCircle_status_check" CHECK ("status" IN ('ACTIVE','CLOSED','PENDING','REJECTED'));
CREATE INDEX "CommunityCircle_expiry_idx" ON "CommunityCircle"("expiresAt") WHERE "expiresAt" IS NOT NULL;
ALTER TABLE "CommunityCirclePost"
 ADD COLUMN "senderName" TEXT, ADD COLUMN "senderFlat" TEXT,
 ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN "moderatedByUserId" UUID REFERENCES "User"("id") ON DELETE SET NULL,
 ADD COLUMN "moderatedAt" TIMESTAMPTZ(6), ADD COLUMN "moderationReason" TEXT;
UPDATE "CommunityCirclePost" p SET "senderName"=COALESCE(NULLIF(TRIM(u."name"),''),'Former member')
FROM "User" u WHERE u."id"=p."authorUserId";
UPDATE "CommunityCirclePost" p SET "senderFlat"=COALESCE((
 SELECT CONCAT(b."name",' · ',un."number") FROM (
  SELECT "unitId","effectiveFrom",0 AS priority FROM "UnitOccupancy"
  WHERE "societyId"=p."societyId" AND "userId"=p."authorUserId" AND "effectiveFrom"<=p."createdAt"
   AND ("effectiveTo" IS NULL OR "effectiveTo">p."createdAt")
  UNION ALL
  SELECT "unitId","effectiveFrom",1 AS priority FROM "UnitOwnership"
  WHERE "societyId"=p."societyId" AND "userId"=p."authorUserId" AND "verified"=true AND "effectiveFrom"<=p."createdAt"
   AND ("effectiveTo" IS NULL OR "effectiveTo">p."createdAt")
 ) relation JOIN "Unit" un ON un."id"=relation."unitId" AND un."societyId"=p."societyId"
 JOIN "Building" b ON b."id"=un."buildingId"
 ORDER BY relation.priority,relation."effectiveFrom" DESC,un."id" LIMIT 1
),'Flat unavailable');
CREATE TABLE "CommunityCircleReport" (
 "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
 "circleId" UUID NOT NULL REFERENCES "CommunityCircle"("id") ON DELETE CASCADE,
 "postId" UUID NOT NULL REFERENCES "CommunityCirclePost"("id") ON DELETE CASCADE,
 "reporterUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN' CHECK ("status" IN ('OPEN','RESOLVED')),
 "resolvedByUserId" UUID REFERENCES "User"("id") ON DELETE SET NULL,
 "resolvedAt" TIMESTAMPTZ(6), "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("societyId","postId","reporterUserId")
);
CREATE INDEX "CommunityCircleReport_queue_idx" ON "CommunityCircleReport"("societyId","status","createdAt");
