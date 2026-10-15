ALTER TABLE "HelpdeskActivity"
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "HelpdeskActivity_society_actor_idempotency_key"
  ON "HelpdeskActivity"("societyId", "actorUserId", "idempotencyKey");
