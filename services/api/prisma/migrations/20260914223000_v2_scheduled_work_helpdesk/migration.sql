ALTER TABLE "HelpdeskSlaEvent"
  ALTER COLUMN "actorUserId" DROP NOT NULL,
  ADD COLUMN "actorSource" TEXT NOT NULL DEFAULT 'HUMAN';

ALTER TABLE "HelpdeskSlaEvent"
  ADD CONSTRAINT "HelpdeskSlaEvent_actor_source_check"
    CHECK ("actorSource" IN ('HUMAN','AUTOMATION')),
  ADD CONSTRAINT "HelpdeskSlaEvent_actor_attribution_check"
    CHECK (
      ("actorSource" = 'HUMAN' AND "actorUserId" IS NOT NULL)
      OR ("actorSource" = 'AUTOMATION' AND "actorUserId" IS NULL)
    );

CREATE INDEX "HelpdeskSlaEvent_source_time_idx"
  ON "HelpdeskSlaEvent"("actorSource", "createdAt" DESC);
