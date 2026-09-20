CREATE TABLE "AiAssistantRetrievalAudit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "toolId" VARCHAR(80) NOT NULL,
  "intent" VARCHAR(80) NOT NULL,
  "unitId" UUID,
  "sources" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status" VARCHAR(24) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiAssistantRetrievalAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiAssistantRetrievalAudit_societyId_fkey"
    FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiAssistantRetrievalAudit_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiAssistantRetrievalAudit_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AiAssistantRetrievalAudit_status_check"
    CHECK ("status" IN ('SUCCESS','UNSUPPORTED','BLOCKED'))
);

CREATE INDEX "AiAssistantRetrievalAudit_society_actor_created_idx"
  ON "AiAssistantRetrievalAudit"("societyId","actorUserId","createdAt" DESC);

CREATE INDEX "AiAssistantRetrievalAudit_society_tool_created_idx"
  ON "AiAssistantRetrievalAudit"("societyId","toolId","createdAt" DESC);
