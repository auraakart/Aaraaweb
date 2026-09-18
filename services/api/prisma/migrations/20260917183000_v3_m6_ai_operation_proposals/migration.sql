CREATE TABLE "AiOperationProposal" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "action" VARCHAR(80) NOT NULL,
  "payload" JSONB NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'PROPOSED',
  "result" JSONB,
  "errorMessage" VARCHAR(1000),
  "confirmedAt" TIMESTAMPTZ,
  "executedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiOperationProposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiOperationProposal_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiOperationProposal_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AiOperationProposal_status_check" CHECK ("status" IN ('PROPOSED','EXECUTING','EXECUTED','FAILED','CANCELLED')),
  CONSTRAINT "AiOperationProposal_action_check" CHECK ("action" IN ('CREATE_HELPDESK_TICKET'))
);
CREATE INDEX "AiOperationProposal_society_actor_created_idx" ON "AiOperationProposal"("societyId","actorUserId","createdAt" DESC);
CREATE INDEX "AiOperationProposal_status_updated_idx" ON "AiOperationProposal"("status","updatedAt");
