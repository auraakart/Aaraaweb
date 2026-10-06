CREATE TABLE "CommunityCircle" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityCircle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunityCircle_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "CommunityCircle_created_by_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE INDEX "CommunityCircle_society_status_created_idx" ON "CommunityCircle"("societyId","status","createdAt" DESC);

CREATE TABLE "CommunityCircleMember" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "circleId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "joinedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityCircleMember_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunityCircleMember_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "CommunityCircleMember_circle_fkey" FOREIGN KEY ("circleId") REFERENCES "CommunityCircle"("id") ON DELETE CASCADE,
  CONSTRAINT "CommunityCircleMember_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "CommunityCircleMember_society_circle_user_key" ON "CommunityCircleMember"("societyId","circleId","userId");
CREATE INDEX "CommunityCircleMember_society_user_joined_idx" ON "CommunityCircleMember"("societyId","userId","joinedAt" DESC);

CREATE TABLE "CommunityCirclePost" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "circleId" UUID NOT NULL,
  "authorUserId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityCirclePost_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunityCirclePost_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "CommunityCirclePost_circle_fkey" FOREIGN KEY ("circleId") REFERENCES "CommunityCircle"("id") ON DELETE CASCADE,
  CONSTRAINT "CommunityCirclePost_author_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE INDEX "CommunityCirclePost_society_circle_created_idx" ON "CommunityCirclePost"("societyId","circleId","createdAt" DESC);
CREATE INDEX "CommunityCirclePost_society_author_created_idx" ON "CommunityCirclePost"("societyId","authorUserId","createdAt" DESC);
