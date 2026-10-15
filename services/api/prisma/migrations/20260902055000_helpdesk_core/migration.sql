CREATE TABLE "HelpdeskTicket" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "unitId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "assignedToId" UUID,
  "resolvedAt" TIMESTAMPTZ,
  "closedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HelpdeskTicket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HelpdeskTicket_priority_check" CHECK ("priority" IN ('LOW','NORMAL','HIGH','URGENT')),
  CONSTRAINT "HelpdeskTicket_status_check" CHECK ("status" IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  CONSTRAINT "HelpdeskTicket_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "HelpdeskTicket_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE,
  CONSTRAINT "HelpdeskTicket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "HelpdeskTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX "HelpdeskTicket_society_status_created_idx" ON "HelpdeskTicket"("societyId", "status", "createdAt" DESC);
CREATE INDEX "HelpdeskTicket_society_creator_created_idx" ON "HelpdeskTicket"("societyId", "createdById", "createdAt" DESC);
CREATE INDEX "HelpdeskTicket_society_unit_created_idx" ON "HelpdeskTicket"("societyId", "unitId", "createdAt" DESC);

CREATE TABLE "HelpdeskActivity" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "message" TEXT,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HelpdeskActivity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HelpdeskActivity_type_check" CHECK ("type" IN ('CREATED','COMMENT','STATUS_CHANGED')),
  CONSTRAINT "HelpdeskActivity_from_status_check" CHECK ("fromStatus" IS NULL OR "fromStatus" IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  CONSTRAINT "HelpdeskActivity_to_status_check" CHECK ("toStatus" IS NULL OR "toStatus" IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
  CONSTRAINT "HelpdeskActivity_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "HelpdeskActivity_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "HelpdeskTicket"("id") ON DELETE CASCADE,
  CONSTRAINT "HelpdeskActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX "HelpdeskActivity_ticket_time_idx" ON "HelpdeskActivity"("ticketId", "occurredAt" ASC);
CREATE INDEX "HelpdeskActivity_society_time_idx" ON "HelpdeskActivity"("societyId", "occurredAt" DESC);
