CREATE TABLE "HelpdeskSlaPolicy" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "priority" TEXT NOT NULL,
  "firstResponseMinutes" INTEGER NOT NULL,
  "resolutionMinutes" INTEGER NOT NULL,
  "escalationAfterMinutes" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HelpdeskSlaPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HelpdeskSlaPolicy_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "HelpdeskSlaPolicy_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "HelpdeskSlaPolicy_priority_check" CHECK ("priority" IN ('LOW','NORMAL','HIGH','URGENT')),
  CONSTRAINT "HelpdeskSlaPolicy_response_check" CHECK ("firstResponseMinutes" > 0),
  CONSTRAINT "HelpdeskSlaPolicy_resolution_check" CHECK ("resolutionMinutes" >= "firstResponseMinutes"),
  CONSTRAINT "HelpdeskSlaPolicy_escalation_check" CHECK ("escalationAfterMinutes" > 0),
  CONSTRAINT "HelpdeskSlaPolicy_society_priority_key" UNIQUE ("societyId", "priority")
);

ALTER TABLE "HelpdeskTicket"
  ADD COLUMN "firstResponseDueAt" TIMESTAMPTZ,
  ADD COLUMN "resolutionDueAt" TIMESTAMPTZ,
  ADD COLUMN "firstRespondedAt" TIMESTAMPTZ,
  ADD COLUMN "slaState" TEXT NOT NULL DEFAULT 'UNTRACKED',
  ADD COLUMN "escalationLevel" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "escalatedToId" UUID,
  ADD COLUMN "lastEscalatedAt" TIMESTAMPTZ,
  ADD CONSTRAINT "HelpdeskTicket_sla_state_check" CHECK ("slaState" IN ('UNTRACKED','ON_TRACK','RESPONSE_BREACHED','RESOLUTION_BREACHED','MET')),
  ADD CONSTRAINT "HelpdeskTicket_escalation_level_check" CHECK ("escalationLevel" >= 0),
  ADD CONSTRAINT "HelpdeskTicket_escalatedToId_fkey" FOREIGN KEY ("escalatedToId") REFERENCES "User"("id") ON DELETE SET NULL;

CREATE INDEX "HelpdeskTicket_society_sla_due_idx" ON "HelpdeskTicket"("societyId", "slaState", "resolutionDueAt");

CREATE TABLE "HelpdeskSlaEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "fromState" TEXT,
  "toState" TEXT,
  "escalationLevel" INTEGER,
  "escalatedToId" UUID,
  "note" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HelpdeskSlaEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HelpdeskSlaEvent_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "HelpdeskSlaEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "HelpdeskTicket"("id") ON DELETE CASCADE,
  CONSTRAINT "HelpdeskSlaEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "HelpdeskSlaEvent_escalatedToId_fkey" FOREIGN KEY ("escalatedToId") REFERENCES "User"("id") ON DELETE SET NULL,
  CONSTRAINT "HelpdeskSlaEvent_type_check" CHECK ("eventType" IN ('TRACKING_STARTED','FIRST_RESPONSE','STATE_CHANGED','ESCALATED','POLICY_REAPPLIED')),
  CONSTRAINT "HelpdeskSlaEvent_level_check" CHECK ("escalationLevel" IS NULL OR "escalationLevel" >= 0)
);

CREATE INDEX "HelpdeskSlaEvent_ticket_time_idx" ON "HelpdeskSlaEvent"("ticketId", "createdAt" ASC);

CREATE OR REPLACE FUNCTION prevent_helpdesk_sla_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'HelpdeskSlaEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER helpdesk_sla_event_no_update
BEFORE UPDATE ON "HelpdeskSlaEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_helpdesk_sla_event_mutation();

CREATE TRIGGER helpdesk_sla_event_no_delete
BEFORE DELETE ON "HelpdeskSlaEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_helpdesk_sla_event_mutation();
