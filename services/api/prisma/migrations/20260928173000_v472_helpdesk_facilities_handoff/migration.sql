ALTER TABLE "FacilityWorkOrder" ADD COLUMN "sourceHelpdeskTicketId" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "HelpdeskTicket_society_id_key"
  ON "HelpdeskTicket"("societyId","id");

ALTER TABLE "FacilityWorkOrder"
  ADD CONSTRAINT "FacilityWorkOrder_society_helpdesk_fkey"
  FOREIGN KEY ("societyId","sourceHelpdeskTicketId")
  REFERENCES "HelpdeskTicket"("societyId","id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "FacilityWorkOrder_society_helpdesk_created_idx"
  ON "FacilityWorkOrder"("societyId","sourceHelpdeskTicketId","createdAt" DESC);

CREATE UNIQUE INDEX "FacilityWorkOrder_active_helpdesk_source_key"
  ON "FacilityWorkOrder"("societyId","sourceHelpdeskTicketId")
  WHERE "sourceHelpdeskTicketId" IS NOT NULL AND "status" IN ('OPEN','IN_PROGRESS');
