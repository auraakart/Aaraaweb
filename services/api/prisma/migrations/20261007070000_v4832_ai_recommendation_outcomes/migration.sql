CREATE TABLE "AiAssistantRecommendationOutcome" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "recommendationKey" VARCHAR(160) NOT NULL,
  "domain" VARCHAR(40) NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "note" VARCHAR(500),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiAssistantRecommendationOutcome_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiAssistantRecommendationOutcome_societyId_fkey"
    FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiAssistantRecommendationOutcome_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiAssistantRecommendationOutcome_status_check"
    CHECK ("status" IN ('REVIEWED','ACTED','RESOLVED','DISMISSED'))
);

CREATE INDEX "AiAssistantRecommendationOutcome_society_key_created_idx"
  ON "AiAssistantRecommendationOutcome"("societyId","recommendationKey","createdAt" DESC);

CREATE INDEX "AiAssistantRecommendationOutcome_society_domain_created_idx"
  ON "AiAssistantRecommendationOutcome"("societyId","domain","createdAt" DESC);
