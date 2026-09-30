CREATE TABLE "CommunityEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" VARCHAR(3000),
  "audienceScope" VARCHAR(20) NOT NULL DEFAULT 'COMMUNITY',
  "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  "startsAt" TIMESTAMPTZ(6) NOT NULL,
  "endsAt" TIMESTAMPTZ(6) NOT NULL,
  "location" VARCHAR(240),
  "capacity" INTEGER,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunityEvent_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "CommunityEvent_created_by_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "CommunityEvent_audience_check" CHECK ("audienceScope" IN ('COMMUNITY','OWNER_ONLY')),
  CONSTRAINT "CommunityEvent_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED','CANCELLED')),
  CONSTRAINT "CommunityEvent_time_check" CHECK ("endsAt">"startsAt"),
  CONSTRAINT "CommunityEvent_capacity_check" CHECK ("capacity" IS NULL OR ("capacity">0 AND "capacity"<=10000))
);

CREATE UNIQUE INDEX "CommunityEvent_id_society_key" ON "CommunityEvent"("id","societyId");
CREATE INDEX "CommunityEvent_society_status_start_idx" ON "CommunityEvent"("societyId","status","startsAt");

CREATE TABLE "CommunityEventRsvp" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityEventRsvp_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunityEventRsvp_society_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "CommunityEventRsvp_event_society_fkey" FOREIGN KEY ("eventId","societyId") REFERENCES "CommunityEvent"("id","societyId") ON DELETE CASCADE,
  CONSTRAINT "CommunityEventRsvp_user_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "CommunityEventRsvp_status_check" CHECK ("status" IN ('GOING','NOT_GOING')),
  CONSTRAINT "CommunityEventRsvp_user_unique" UNIQUE ("societyId","eventId","userId")
);

CREATE INDEX "CommunityEventRsvp_society_event_status_idx" ON "CommunityEventRsvp"("societyId","eventId","status");
