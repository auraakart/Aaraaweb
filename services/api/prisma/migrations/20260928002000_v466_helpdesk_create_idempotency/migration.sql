ALTER TABLE "HelpdeskTicket"
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "HelpdeskTicket_society_creator_idempotency_key"
  ON "HelpdeskTicket" ("societyId", "createdById", "idempotencyKey");
