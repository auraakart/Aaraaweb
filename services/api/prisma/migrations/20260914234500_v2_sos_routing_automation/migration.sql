CREATE TABLE "SosRoutingPolicy" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "societyId" UUID NOT NULL,
  "severity" TEXT NOT NULL,
  "acknowledgeWithinMinutes" INTEGER NOT NULL,
  "responderUserId" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SosRoutingPolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SosRoutingPolicy_societyId_fkey" FOREIGN KEY ("societyId") REFERENCES "Society"("id") ON DELETE CASCADE,
  CONSTRAINT "SosRoutingPolicy_responderUserId_fkey" FOREIGN KEY ("responderUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SosRoutingPolicy_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "SosRoutingPolicy_severity_check" CHECK ("severity" IN ('CRITICAL','HIGH','MEDIUM')),
  CONSTRAINT "SosRoutingPolicy_ack_deadline_check" CHECK ("acknowledgeWithinMinutes" BETWEEN 1 AND 1440),
  CONSTRAINT "SosRoutingPolicy_society_severity_key" UNIQUE ("societyId","severity")
);

ALTER TABLE "SosIncident"
  ADD COLUMN "assignedResponderUserId" UUID,
  ADD COLUMN "assignedAt" TIMESTAMPTZ,
  ADD COLUMN "acknowledgeDueAt" TIMESTAMPTZ,
  ADD COLUMN "autoEscalatedAt" TIMESTAMPTZ,
  ADD CONSTRAINT "SosIncident_assignedResponderUserId_fkey"
    FOREIGN KEY ("assignedResponderUserId") REFERENCES "User"("id") ON DELETE SET NULL;

ALTER TABLE "SosIncidentEvent"
  ALTER COLUMN "actorUserId" DROP NOT NULL,
  ADD COLUMN "actorSource" TEXT NOT NULL DEFAULT 'HUMAN';

ALTER TABLE "SosIncidentEvent"
  ADD CONSTRAINT "SosIncidentEvent_actor_source_check" CHECK ("actorSource" IN ('HUMAN','AUTOMATION')),
  ADD CONSTRAINT "SosIncidentEvent_actor_attribution_check" CHECK (
    ("actorSource"='HUMAN' AND "actorUserId" IS NOT NULL)
    OR ("actorSource"='AUTOMATION' AND "actorUserId" IS NULL)
  );

CREATE OR REPLACE FUNCTION validate_sos_routing_policy_responder() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "SocietyMembership" sm
    WHERE sm."societyId"=NEW."societyId"
      AND sm."userId"=NEW."responderUserId"
      AND sm."active"=true
  ) THEN
    RAISE EXCEPTION 'SOS routing responder must be an active member of the same society';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sos_routing_policy_responder_guard
BEFORE INSERT OR UPDATE OF "societyId","responderUserId" ON "SosRoutingPolicy"
FOR EACH ROW EXECUTE FUNCTION validate_sos_routing_policy_responder();

CREATE OR REPLACE FUNCTION apply_sos_routing_policy() RETURNS trigger AS $$
DECLARE
  target_user UUID;
  ack_minutes INTEGER;
BEGIN
  SELECT p."responderUserId", p."acknowledgeWithinMinutes"
    INTO target_user, ack_minutes
  FROM "SosRoutingPolicy" p
  WHERE p."societyId"=NEW."societyId"
    AND p."severity"=NEW."severity"
    AND p."active"=true
  LIMIT 1;

  IF target_user IS NOT NULL THEN
    NEW."assignedResponderUserId" := target_user;
    NEW."assignedAt" := CURRENT_TIMESTAMP;
    NEW."acknowledgeDueAt" := CURRENT_TIMESTAMP + make_interval(mins => ack_minutes);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sos_incident_apply_routing
BEFORE INSERT ON "SosIncident"
FOR EACH ROW EXECUTE FUNCTION apply_sos_routing_policy();

CREATE OR REPLACE FUNCTION record_sos_automatic_assignment() RETURNS trigger AS $$
BEGIN
  IF NEW."assignedResponderUserId" IS NOT NULL THEN
    INSERT INTO "SosIncidentEvent" (
      "societyId","incidentId","actorUserId","actorSource","action","fromStatus","toStatus","note"
    ) VALUES (
      NEW."societyId",NEW."id",NULL,'AUTOMATION','ASSIGNED',NEW."status",NEW."status",
      'SOS responder assigned from society routing policy'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sos_incident_record_automatic_assignment
AFTER INSERT ON "SosIncident"
FOR EACH ROW EXECUTE FUNCTION record_sos_automatic_assignment();

CREATE INDEX "SosRoutingPolicy_society_active_idx"
  ON "SosRoutingPolicy"("societyId","active","severity");
CREATE INDEX "SosIncident_society_ack_due_idx"
  ON "SosIncident"("societyId","status","acknowledgeDueAt")
  WHERE "status"='ACTIVE' AND "acknowledgeDueAt" IS NOT NULL;
