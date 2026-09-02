CREATE TABLE "Notice" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "category" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMPTZ,
  "expiresAt" TIMESTAMPTZ,
  "archivedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notice_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED','ARCHIVED')),
  CONSTRAINT "Notice_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "Notice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX "Notice_society_status_published_idx" ON "Notice"("societyId", "status", "publishedAt" DESC);
CREATE INDEX "Notice_society_created_idx" ON "Notice"("societyId", "createdAt" DESC);

CREATE TABLE "NoticeEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "noticeId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NoticeEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NoticeEvent_action_check" CHECK ("action" IN ('CREATED','PUBLISHED','ARCHIVED')),
  CONSTRAINT "NoticeEvent_from_status_check" CHECK ("fromStatus" IS NULL OR "fromStatus" IN ('DRAFT','PUBLISHED','ARCHIVED')),
  CONSTRAINT "NoticeEvent_to_status_check" CHECK ("toStatus" IS NULL OR "toStatus" IN ('DRAFT','PUBLISHED','ARCHIVED')),
  CONSTRAINT "NoticeEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "NoticeEvent_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE CASCADE,
  CONSTRAINT "NoticeEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX "NoticeEvent_notice_time_idx" ON "NoticeEvent"("noticeId", "occurredAt" ASC);
CREATE INDEX "NoticeEvent_society_time_idx" ON "NoticeEvent"("societyId", "occurredAt" DESC);
