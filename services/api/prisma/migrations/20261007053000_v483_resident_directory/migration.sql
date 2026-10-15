CREATE TABLE "ResidentDirectoryProfile" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "displayName" VARCHAR(80) NOT NULL,
  "bio" VARCHAR(280),
  "interests" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "visible" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResidentDirectoryProfile_display_name_nonblank" CHECK (length(btrim("displayName")) > 0),
  CONSTRAINT "ResidentDirectoryProfile_interests_array" CHECK (jsonb_typeof("interests")='array')
);
CREATE UNIQUE INDEX "ResidentDirectoryProfile_society_user_key"
  ON "ResidentDirectoryProfile"("societyId","userId");
CREATE INDEX "ResidentDirectoryProfile_society_visible_idx"
  ON "ResidentDirectoryProfile"("societyId","visible","updatedAt" DESC);

CREATE TABLE "ResidentDirectoryContactRequest" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL REFERENCES "Society"("id") ON DELETE CASCADE,
  "requesterUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "recipientUserId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "message" VARCHAR(500),
  "responseNote" VARCHAR(500),
  "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMPTZ,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResidentDirectoryContactRequest_status_check" CHECK ("status" IN ('PENDING','ACCEPTED','DECLINED','WITHDRAWN')),
  CONSTRAINT "ResidentDirectoryContactRequest_not_self" CHECK ("requesterUserId"<>"recipientUserId"),
  CONSTRAINT "ResidentDirectoryContactRequest_response_check" CHECK (
    ("status"='PENDING' AND "respondedAt" IS NULL) OR
    ("status"<>'PENDING' AND "respondedAt" IS NOT NULL)
  )
);
CREATE INDEX "ResidentDirectoryContactRequest_recipient_idx"
  ON "ResidentDirectoryContactRequest"("societyId","recipientUserId","status","createdAt" DESC);
CREATE INDEX "ResidentDirectoryContactRequest_requester_idx"
  ON "ResidentDirectoryContactRequest"("societyId","requesterUserId","status","createdAt" DESC);
CREATE UNIQUE INDEX "ResidentDirectoryContactRequest_one_pending_pair"
  ON "ResidentDirectoryContactRequest"("societyId","requesterUserId","recipientUserId")
  WHERE "status"='PENDING';
